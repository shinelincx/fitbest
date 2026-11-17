package com.ifitbest.server.module.session;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.infra.persistence.SessionSource;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 训练会话端点 —— /api/v1/sessions、/api/v1/stats/weekly */
@RestController
@RequestMapping("/api/v1")
@Authed
public class SessionsController {

    private final SessionsService sessions;

    public SessionsController(SessionsService sessions) {
        this.sessions = sessions;
    }

    public record CreateBody(
        UUID machineId,
        UUID gymId,
        @NotNull(message = "不能为空") MachineType machineType,
        @jakarta.validation.constraints.Size(max = 100) String machineModel,
        @jakarta.validation.constraints.Size(max = 30) String mode,
        @NotNull @Min(0) @Max(86400) Integer durationSec,
        @NotNull @Min(0) @Max(1000000) Integer distanceM,
        @NotNull @Min(0) @Max(10000) Integer calories,
        @Min(30) @Max(250) Integer avgHr,
        @DecimalMin("0") @DecimalMax("100") BigDecimal avgSpeed,
        @Min(0) @Max(500) Integer cadence,
        @Min(0) @Max(5000) Integer power,
        @Pattern(regexp = "ble|sim|manual") String source,
        LocalDateTime startedAt,
        LocalDateTime endedAt,
        @Min(0) Integer target,
        Boolean completed) {
    }

    @PostMapping("sessions")
    public Map<String, Object> create(@CurrentUser UUID userId,
                                      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                      @Valid @RequestBody CreateBody body) {
        return sessions.create(userId, idempotencyKey, toInput(body));
    }

    @PostMapping("sessions/restore")
    public Map<String, Object> restore(@CurrentUser UUID userId,
                                       @RequestHeader("Idempotency-Key") String idempotencyKey,
                                       @Valid @RequestBody CreateBody body) {
        return sessions.restore(userId, idempotencyKey, toInput(body));
    }

    @DeleteMapping("sessions")
    public Map<String, Object> delete(@CurrentUser UUID userId, @RequestParam @NotBlank @Size(max = 200) String ref) {
        sessions.delete(userId, ref);
        return Map.of("ok", true);
    }

    public record ClearBody(
        @Size(max = 5000) List<@NotBlank @Size(max = 200) String> pendingIds,
        @Size(min = 1, max = 10) List<@NotNull MachineType> machineTypes) {}

    @DeleteMapping("sessions/all")
    public Map<String, Object> clear(@CurrentUser UUID userId, @Valid @RequestBody(required = false) ClearBody body) {
        List<String> pendingIds = body == null || body.pendingIds() == null ? List.of() : body.pendingIds();
        return Map.of("deleted", sessions.clear(userId, pendingIds, body == null ? null : body.machineTypes()));
    }

    private static SessionsService.CreateInput toInput(CreateBody body) {
        return new SessionsService.CreateInput(
            body.machineId(), body.gymId(), body.machineType(), body.machineModel(), body.mode(),
            body.durationSec(), body.distanceM(), body.calories(), body.avgHr(), body.avgSpeed(),
            body.cadence(), body.power(),
            body.source() == null ? SessionSource.ble : SessionSource.valueOf(body.source()),
            body.startedAt(), body.endedAt(), body.target(), body.completed());
    }

    @GetMapping("sessions")
    public Map<String, Object> list(@CurrentUser UUID userId,
                                    @RequestParam(required = false) String range,
                                    @RequestParam(required = false) String cursor,
                                    @RequestParam(required = false) Integer limit) {
        String normalizedRange = range == null ? "week" : range;
        if (!"week".equals(normalizedRange) && !"month".equals(normalizedRange) && !"all".equals(normalizedRange)) {
            throw BizException.badRequest("range 仅支持 week / month / all");
        }
        int size = Math.min(Math.max(limit == null ? 20 : limit, 1), 50);
        return sessions.list(userId, normalizedRange, cursor, size);
    }

    @GetMapping("stats/weekly")
    public Map<String, Object> weekly(@CurrentUser UUID userId) {
        return sessions.weeklyStats(userId);
    }
}
