package com.ifitbest.server.module.device;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 设备同步端点 —— /api/v1/me/device-sessions */
@RestController
@RequestMapping("/api/v1/me/device-sessions")
@Authed
public class DeviceSyncController {

    private final DeviceSyncService deviceSync;

    public DeviceSyncController(DeviceSyncService deviceSync) {
        this.deviceSync = deviceSync;
    }

    public record SegmentBody(
        @NotNull @Min(0) @Max(1000) Integer seq,
        @NotNull @Pattern(regexp = "start|finish|station|treadmill") String type,
        @Size(max = 80) String machineSerial,
        @Size(max = 30) String machineType,
        @Min(0) @Max(864000) Integer connectTick,
        @Min(0) @Max(864000) Integer disconnectTick,
        @Min(0) @Max(86400) Integer durationSec,
        @Min(0) @Max(200000) Integer distanceM,
        Map<String, Object> metrics) {
    }

    public record DeviceBody(
        @NotBlank @Size(max = 80) String serialNo,
        @Pattern(regexp = "band|machine") String kind,
        @Size(max = 80) String label) {
    }

    public record SyncBody(
        @NotBlank @Size(max = 80) String clientSessionId,
        @NotNull @Valid DeviceBody device,
        @Pattern(regexp = "hyrox|btwe") String app,
        @Pattern(regexp = "training|race") String mode,
        @NotBlank @Size(max = 40) String startedAt,
        @Size(max = 40) String endedAt,
        @NotNull @Min(0) @Max(86400) Integer durationSec,
        @Min(0) @Max(200000) Integer distanceM,
        @Min(30) @Max(250) Integer avgHr,
        @Min(30) @Max(250) Integer maxHr,
        Map<String, Object> metrics,
        @Size(max = 40) String closeReason,
        @Pattern(regexp = "ok|partial|invalid") String quality,
        @Size(max = 64) List<@NotNull @Valid SegmentBody> segments) {
    }

    @PostMapping
    public Map<String, Object> sync(@CurrentUser UUID userId, @Valid @RequestBody SyncBody body) {
        List<SegmentDeriver.SegmentInput> segments = body.segments() == null ? List.of()
            : body.segments().stream()
                .map(seg -> new SegmentDeriver.SegmentInput(
                    seg.seq(), seg.type(), seg.machineSerial(), seg.machineType(),
                    seg.connectTick(), seg.disconnectTick(),
                    seg.durationSec() == null ? 0 : seg.durationSec(),
                    seg.distanceM() == null ? 0 : seg.distanceM(),
                    seg.metrics()))
                .toList();

        DeviceSyncService.DeviceInput device = new DeviceSyncService.DeviceInput(
            body.device().serialNo(), body.device().kind(), body.device().label());

        DeviceSyncService.SyncInput input = new DeviceSyncService.SyncInput(
            body.clientSessionId(), device,
            body.app() == null ? "hyrox" : body.app(),
            body.mode() == null ? "training" : body.mode(),
            body.startedAt(), body.endedAt(),
            body.durationSec(),
            body.distanceM() == null ? 0 : body.distanceM(),
            body.avgHr(), body.maxHr(), body.metrics(), body.closeReason(),
            body.quality() == null ? "ok" : body.quality(),
            segments);
        return deviceSync.sync(userId, input);
    }

    @GetMapping
    public List<Map<String, Object>> list(@CurrentUser UUID userId,
                                          @RequestParam(required = false) String mode,
                                          @RequestParam(required = false) Integer limit) {
        return deviceSync.list(userId, mode, limit == null ? 20 : limit);
    }
}
