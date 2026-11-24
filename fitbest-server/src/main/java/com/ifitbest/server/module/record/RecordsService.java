package com.ifitbest.server.module.record;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.JacksonConfig;
import com.ifitbest.server.infra.persistence.TrainingRecord;
import com.ifitbest.server.infra.persistence.TrainingRecordRepo;
import com.ifitbest.server.infra.persistence.DeviceSessionRepo;
import com.ifitbest.server.infra.persistence.WriteLocks;

/** 赛事训练记录（hyrox / btwe），clientId 幂等，契约一致 */
@Service
public class RecordsService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final TrainingRecordRepo records;

    private final DeviceSessionRepo deviceSessions;
    private final WriteLocks locks;

    public RecordsService(TrainingRecordRepo records, DeviceSessionRepo deviceSessions, WriteLocks locks) {
        this.records = records;
        this.deviceSessions = deviceSessions;
        this.locks = locks;
    }

    /** 记录序列化：JSON 列（moduleTimes / runSplits）输出为数组而非字符串 */
    public static Map<String, Object> serialize(TrainingRecord r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", r.getId().toString());
        out.put("userId", r.getUserId().toString());
        out.put("app", r.getApp());
        out.put("clientKey", r.getClientKey());
        out.put("planId", r.getPlanId());
        out.put("completed", r.isCompleted());
        out.put("totalTimeSec", r.getTotalTimeSec());
        out.put("distanceM", r.getDistanceM());
        out.put("moduleTimes", parseJson(r.getModuleTimes()));
        out.put("runSplits", parseJson(r.getRunSplits()));
        out.put("avgHr", r.getAvgHr());
        out.put("maxHr", r.getMaxHr());
        out.put("rpe", r.getRpe());
        out.put("weakestStation", r.getWeakestStation());
        out.put("startedAt", r.getStartedAt());
        out.put("createdAt", r.getCreatedAt());
        return out;
    }

    public static Object parseJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readValue(raw, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    public record CreateInput(String clientId, String app, String planId, boolean completed,
                              int totalTimeSec, int distanceM, java.util.List<Integer> moduleTimes,
                              java.util.List<Integer> runSplits, Integer avgHr, Integer maxHr, Integer rpe,
                              String weakestStation, LocalDateTime startedAt) {
    }

    @Transactional
    public Map<String, Object> create(UUID userId, CreateInput input) {
        // clientId 用作幂等键：重复上传同一客户端记录不会产生重复行
        String clientId = input.clientId() == null || input.clientId().isBlank() ? null : input.clientId();
        if (clientId != null) {
            locks.trainingRecord(userId, clientId);
            if (records.isDeletedKey(userId, input.app(), clientId)) {
                throw new BizException(410, "训练记录已删除");
            }
            TrainingRecord existing = records.findByUserIdAndAppAndClientKey(userId, input.app(), clientId).orElse(null);
            if (existing != null) {
                if (deviceSessions.existsByTrainingRecordId(existing.getId())) {
                    mergeAppDetails(existing, input);
                }
                return serialize(existing);
            }
        }

        TrainingRecord record = new TrainingRecord();
        record.setId(UUID.randomUUID());
        record.setUserId(userId);
        record.setApp(input.app());
        record.setClientKey(clientId);
        record.setPlanId(input.planId());
        record.setCompleted(input.completed());
        record.setTotalTimeSec(input.totalTimeSec());
        record.setDistanceM(input.distanceM());
        record.setModuleTimes(writeJson(input.moduleTimes()));
        record.setRunSplits(writeJson(input.runSplits()));
        record.setAvgHr(input.avgHr());
        record.setMaxHr(input.maxHr());
        record.setRpe(input.rpe());
        record.setWeakestStation(input.weakestStation());
        record.setStartedAt(input.startedAt());
        record.setCreatedAt(Times.nowUtc());
        records.save(record);
        return serialize(record);
    }

    private static void mergeAppDetails(TrainingRecord record, CreateInput input) {
        // 设备实测优先；应用补充计划、主观指标及训练界面生成的分组。
        if (input.planId() != null) record.setPlanId(input.planId());
        if (input.rpe() != null) record.setRpe(input.rpe());
        if (input.weakestStation() != null) record.setWeakestStation(input.weakestStation());
        if (input.moduleTimes() != null && !input.moduleTimes().isEmpty()) record.setModuleTimes(writeJson(input.moduleTimes()));
        if (input.runSplits() != null && !input.runSplits().isEmpty()) record.setRunSplits(writeJson(input.runSplits()));
        if (record.getDistanceM() == 0) record.setDistanceM(input.distanceM());
        if (record.getTotalTimeSec() == 0) record.setTotalTimeSec(input.totalTimeSec());
        if (record.getAvgHr() == null) record.setAvgHr(input.avgHr());
        if (record.getMaxHr() == null) record.setMaxHr(input.maxHr());
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

    public java.util.List<Map<String, Object>> list(UUID userId, String app, int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        java.util.List<TrainingRecord> rows = app != null && !app.isBlank()
            ? records.findByUserIdAndApp(userId, app, org.springframework.data.domain.PageRequest.of(0, size))
            : records.findByUserId(userId, org.springframework.data.domain.PageRequest.of(0, size));
        return rows.stream().map(RecordsService::serialize).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> page(UUID userId, String app, String cursor, int limit) {
        int size = Math.min(Math.max(limit, 1), 200);
        Specification<TrainingRecord> spec = (root, query, cb) ->
            cb.and(cb.equal(root.get("userId"), userId), cb.equal(root.get("app"), app));
        if (cursor != null) {
            int separator = cursor.indexOf('|');
            LocalDateTime createdAt;
            UUID id;
            try {
                createdAt = JacksonConfig.parseIso(cursor.substring(0, separator));
                id = UUID.fromString(cursor.substring(separator + 1));
                if (createdAt == null) throw new IllegalArgumentException();
            } catch (RuntimeException e) {
                throw BizException.badRequest("训练记录分页游标无效");
            }
            spec = spec.and((root, query, cb) -> cb.or(
                cb.lessThan(root.get("createdAt"), createdAt),
                cb.and(cb.equal(root.get("createdAt"), createdAt), cb.lessThan(root.get("id"), id))));
        }
        List<TrainingRecord> rows = records.findAll(spec,
            PageRequest.of(0, size + 1, Sort.by(Sort.Direction.DESC, "createdAt", "id"))).getContent();
        List<TrainingRecord> items = rows.subList(0, Math.min(rows.size(), size));
        TrainingRecord last = rows.size() > size ? items.get(items.size() - 1) : null;
        String next = last == null ? "" : last.getCreatedAt() + "|" + last.getId();
        return Map.of("items", items.stream().map(RecordsService::serialize).toList(), "nextCursor", next);
    }

    @Transactional
    public Map<String, Object> remove(UUID userId, UUID id) {
        TrainingRecord record = records.findById(id).filter(r -> r.getUserId().equals(userId)).orElse(null);
        if (record == null) {
            throw BizException.notFound("记录不存在");
        }
        removeRecord(userId, record);
        return Map.of("ok", true);
    }

    @Transactional
    public Map<String, Object> removeByReference(UUID userId, String app, String clientId, UUID id) {
        if (clientId != null && !clientId.isBlank()) {
            removeByKey(userId, app, clientId);
            return Map.of("id", clientId);
        }
        if (id == null) throw BizException.badRequest("缺少训练记录标识");
        records.findById(id).filter(r -> r.getUserId().equals(userId) && r.getApp().equals(app))
            .ifPresent(record -> removeRecord(userId, record));
        return Map.of("id", id.toString());
    }

    private void removeRecord(UUID userId, TrainingRecord record) {
        if (record.getClientKey() != null) {
            removeByKey(userId, record.getApp(), record.getClientKey());
        } else {
            locks.trainingRecord(userId, record.getId().toString());
            deleteWithDeviceSessions(record);
        }
    }

    private void removeByKey(UUID userId, String app, String clientId) {
        locks.trainingRecord(userId, clientId);
        records.markDeletedKey(userId, app, clientId);
        records.findByUserIdAndAppAndClientKey(userId, app, clientId).ifPresent(this::deleteWithDeviceSessions);
        deviceSessions.findByUserIdAndClientSessionId(userId, clientId)
            .filter(device -> app.equals(device.getApp())
                && device.getMode() == com.ifitbest.server.infra.persistence.WorkoutMode.training)
            .ifPresent(deviceSessions::delete);
    }

    private void deleteWithDeviceSessions(TrainingRecord record) {
        deviceSessions.deleteByTrainingRecordId(record.getId());
        records.delete(record);
    }
}
