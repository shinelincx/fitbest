package com.ifitbest.server.module.device;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.Device;
import com.ifitbest.server.infra.persistence.DeviceKind;
import com.ifitbest.server.infra.persistence.DeviceRepo;
import com.ifitbest.server.infra.persistence.DeviceSegment;
import com.ifitbest.server.infra.persistence.DeviceSegmentRepo;
import com.ifitbest.server.infra.persistence.DeviceSession;
import com.ifitbest.server.infra.persistence.DeviceSessionRepo;
import com.ifitbest.server.infra.persistence.SegmentType;
import com.ifitbest.server.infra.persistence.TrainingRecord;
import com.ifitbest.server.infra.persistence.TrainingRecordRepo;
import com.ifitbest.server.infra.persistence.WorkoutMode;
import com.ifitbest.server.infra.persistence.WriteLocks;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.module.record.RecordsService;

/** 设备（手环）同步 —— 整场一次收，clientSessionId 幂等，训练模式联动生成 TrainingRecord */
@Service
public class DeviceSyncService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final DeviceSessionRepo deviceSessions;
    private final DeviceSegmentRepo deviceSegments;
    private final DeviceRepo devices;
    private final TrainingRecordRepo trainingRecords;
    private final WriteLocks locks;

    public DeviceSyncService(DeviceSessionRepo deviceSessions, DeviceSegmentRepo deviceSegments,
                             DeviceRepo devices, TrainingRecordRepo trainingRecords, WriteLocks locks) {
        this.deviceSessions = deviceSessions;
        this.deviceSegments = deviceSegments;
        this.devices = devices;
        this.trainingRecords = trainingRecords;
        this.locks = locks;
    }

    public record SyncInput(String clientSessionId, DeviceInput device, String app, String mode,
                            String startedAt, String endedAt, int durationSec, int distanceM,
                            Integer avgHr, Integer maxHr, Map<String, Object> metrics, String closeReason,
                            String quality, List<SegmentDeriver.SegmentInput> segments) {
    }

    public record DeviceInput(String serialNo, String kind, String label) {
    }

    @Transactional
    public Map<String, Object> sync(UUID userId, SyncInput input) {
        locks.trainingRecord(userId, input.clientSessionId());
        String app = input.app() == null ? "hyrox" : input.app();
        if (!"race".equals(input.mode()) && trainingRecords.isDeletedKey(userId, app, input.clientSessionId())) {
            throw new BizException(410, "训练记录已删除");
        }
        DeviceSession existing = deviceSessions.findByUserIdAndClientSessionId(userId, input.clientSessionId()).orElse(null);
        if (existing != null) {
            return withDuplicate(toDto(existing), true);
        }

        LocalDateTime startedAt = parseDate(input.startedAt());
        LocalDateTime endedAt = parseDate(input.endedAt());
        locks.acquire("device-serial", input.device().serialNo());
        Device device = devices.findBySerialNo(input.device().serialNo()).orElse(null);
        if (device == null) {
            device = new Device();
            device.setId(UUID.randomUUID());
            device.setSerialNo(input.device().serialNo());
            device.setCreatedAt(Times.nowUtc());
        }
        device.setKind("machine".equals(input.device().kind()) ? DeviceKind.machine : DeviceKind.band);
        device.setLabel(input.device().label());
        device.setLastSeenAt(Times.nowUtc());
        devices.save(device);

        DeviceSession session = new DeviceSession();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setDeviceId(device.getId());
        session.setClientSessionId(input.clientSessionId());
        session.setMode("race".equals(input.mode()) ? WorkoutMode.race : WorkoutMode.training);
        session.setApp(app);
        session.setStartedAt(startedAt);
        session.setEndedAt(endedAt);
        session.setDurationSec(input.durationSec());
        session.setDistanceM(input.distanceM());
        session.setAvgHr(input.avgHr());
        session.setMaxHr(input.maxHr());
        session.setMetrics(writeJson(input.metrics()));
        session.setCloseReason(input.closeReason());
        session.setQuality(qualityOf(input.quality()));
        session.setCreatedAt(Times.nowUtc());

        deviceSessions.saveAndFlush(session);
        List<DeviceSegment> segmentRows = new ArrayList<>();
        for (SegmentDeriver.SegmentInput seg : input.segments()) {
            DeviceSegment row = new DeviceSegment();
            row.setId(UUID.randomUUID());
            row.setSessionId(session.getId());
            row.setSeq(seg.seq());
            row.setType(SegmentType.valueOf(seg.type()));
            row.setMachineSerial(seg.machineSerial());
            row.setMachineType(seg.machineType());
            row.setConnectTick(seg.connectTick());
            row.setDisconnectTick(seg.disconnectTick());
            row.setDurationSec(seg.durationSec());
            row.setDistanceM(seg.distanceM());
            row.setMetrics(writeJson(seg.metrics()));
            row.setCreatedAt(Times.nowUtc());
            segmentRows.add(row);
        }
        deviceSegments.saveAll(segmentRows);

        // 只有有效的训练模式会话关联专项训练。
        if (session.getMode() == WorkoutMode.training
            && session.getQuality() != com.ifitbest.server.infra.persistence.DeviceSessionQuality.invalid) {
            session.setTrainingRecordId(linkOrCreateTrainingRecord(userId, input, session));
            deviceSessions.save(session);
        }
        return toDto(deviceSessions.findById(session.getId()).orElseThrow());
    }

    private UUID linkOrCreateTrainingRecord(UUID userId, SyncInput input, DeviceSession session) {
        TrainingRecord record = trainingRecords
            .findByUserIdAndAppAndClientKey(userId, session.getApp(), input.clientSessionId()).orElse(null);
        if (record == null) {
            record = new TrainingRecord();
            record.setId(UUID.randomUUID());
            record.setUserId(userId);
            record.setApp(session.getApp());
            record.setClientKey(input.clientSessionId());
            record.setCreatedAt(Times.nowUtc());
        }

        SegmentDeriver.Derived derived = SegmentDeriver.derive(input.segments(), session.getApp());
        boolean completed = "finish".equals(input.closeReason())
            || (!"partial".equals(input.quality())
                && input.segments().stream().anyMatch(s -> "finish".equals(s.type())));

        record.setCompleted(completed);
        if (input.durationSec() > 0) record.setTotalTimeSec(input.durationSec());
        int distanceM = derived.distanceM() > 0 ? derived.distanceM() : input.distanceM();
        if (distanceM > 0) record.setDistanceM(distanceM);
        if (record.getModuleTimes() == null || "[]".equals(record.getModuleTimes())) {
            record.setModuleTimes(writeJson(derived.moduleTimes()));
        }
        if (record.getRunSplits() == null || "[]".equals(record.getRunSplits())) {
            record.setRunSplits(writeJson(derived.runSplits()));
        }
        if (input.avgHr() != null) record.setAvgHr(input.avgHr());
        if (input.maxHr() != null) record.setMaxHr(input.maxHr());
        record.setStartedAt(session.getStartedAt());
        trainingRecords.saveAndFlush(record);
        return record.getId();
    }

    public List<Map<String, Object>> list(UUID userId, String mode, int limit) {
        int size = Math.min(Math.max(limit, 1), 100);
        List<DeviceSession> rows;
        if ("training".equals(mode)) {
            rows = deviceSessions.findByUserIdAndMode(userId, WorkoutMode.training, org.springframework.data.domain.PageRequest.of(0, size));
        } else if ("race".equals(mode)) {
            rows = deviceSessions.findByUserIdAndMode(userId, WorkoutMode.race, org.springframework.data.domain.PageRequest.of(0, size));
        } else {
            rows = deviceSessions.findByUserId(userId, org.springframework.data.domain.PageRequest.of(0, size));
        }
        return rows.stream().map(this::toDto).toList();
    }

    private Map<String, Object> toDto(DeviceSession s) {
        Device device = devices.findById(s.getDeviceId()).orElse(null);
        List<DeviceSegment> segments = deviceSegments.findBySessionIdOrderBySeqAsc(s.getId());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId().toString());
        out.put("clientSessionId", s.getClientSessionId());
        out.put("mode", s.getMode().name());
        out.put("app", s.getApp());
        out.put("startedAt", s.getStartedAt());
        out.put("endedAt", s.getEndedAt());
        out.put("durationSec", s.getDurationSec());
        out.put("distanceM", s.getDistanceM());
        out.put("avgHr", s.getAvgHr());
        out.put("maxHr", s.getMaxHr());
        out.put("metrics", RecordsService.parseJson(s.getMetrics()));
        out.put("closeReason", s.getCloseReason());
        out.put("quality", s.getQuality().name());
        out.put("trainingRecordId", s.getTrainingRecordId() == null ? null : s.getTrainingRecordId().toString());
        Map<String, Object> deviceDto = new LinkedHashMap<>();
        deviceDto.put("serialNo", device == null ? null : device.getSerialNo());
        deviceDto.put("label", device == null ? null : device.getLabel());
        out.put("device", deviceDto);
        out.put("segments", segments.stream().map(seg -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("seq", seg.getSeq());
            dto.put("type", seg.getType().name());
            dto.put("machineSerial", seg.getMachineSerial());
            dto.put("machineType", seg.getMachineType());
            dto.put("connectTick", seg.getConnectTick());
            dto.put("disconnectTick", seg.getDisconnectTick());
            dto.put("durationSec", seg.getDurationSec());
            dto.put("distanceM", seg.getDistanceM());
            dto.put("metrics", RecordsService.parseJson(seg.getMetrics()));
            return dto;
        }).toList());
        return out;
    }

    private static Map<String, Object> withDuplicate(Map<String, Object> dto, boolean duplicate) {
        dto.put("duplicate", duplicate);
        return dto;
    }

    private static com.ifitbest.server.infra.persistence.DeviceSessionQuality qualityOf(String quality) {
        try {
            return com.ifitbest.server.infra.persistence.DeviceSessionQuality.valueOf(quality == null ? "ok" : quality);
        } catch (Exception e) {
            return com.ifitbest.server.infra.persistence.DeviceSessionQuality.ok;
        }
    }

    private static LocalDateTime parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return com.ifitbest.server.config.JacksonConfig.parseIso(value);
        } catch (IllegalArgumentException e) {
            throw BizException.badRequest("设备训练时间格式不正确");
        }
    }

    private static String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }
}
