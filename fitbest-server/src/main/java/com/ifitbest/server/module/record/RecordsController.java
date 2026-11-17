package com.ifitbest.server.module.record;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.DateTimeException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.JacksonConfig;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 训练记录端点 —— /api/v1/me/training-records */
@RestController
@RequestMapping("/api/v1/me/training-records")
@Authed
public class RecordsController {

    private final RecordsService records;

    public RecordsController(RecordsService records) {
        this.records = records;
    }

    public record CreateBody(
        @Size(max = 80) String clientId,
        @NotNull @Pattern(regexp = "hyrox|btwe", message = "app 仅支持 hyrox / btwe") String app,
        @Size(max = 80) String planId,
        Boolean completed,
        @NotNull @Min(0) @Max(86400) Integer totalTimeSec,
        @Min(0) @Max(200000) Integer distanceM,
        @Size(max = 64) List<@Min(0) @Max(86400) Integer> moduleTimes,
        @Size(max = 64) List<@Min(0) @Max(86400) Integer> runSplits,
        @Min(30) @Max(250) Integer avgHr,
        @Min(30) @Max(250) Integer maxHr,
        @Min(1) @Max(10) Integer rpe,
        @Size(max = 80) String weakestStation,
        @Size(max = 40) String startedAt) {
    }

    @PostMapping
    public Map<String, Object> create(@CurrentUser UUID userId, @Valid @RequestBody CreateBody body) {
        RecordsService.CreateInput input = new RecordsService.CreateInput(
            body.clientId(), body.app(), body.planId(), Boolean.TRUE.equals(body.completed()),
            body.totalTimeSec(), body.distanceM() == null ? 0 : body.distanceM(),
            body.moduleTimes(), body.runSplits(), body.avgHr(), body.maxHr(), body.rpe(),
            body.weakestStation(), parseStartedAt(body.startedAt()));
        return records.create(userId, input);
    }

    private static LocalDateTime parseStartedAt(String value) {
        if (value == null || value.isBlank()) return null;
        String date = value.trim();
        try {
            // 旧版仅上报 UTC 日历日，沿用 NestJS 对纯日期的 UTC 零点解释。
            return date.length() == 10 ? LocalDate.parse(date).atStartOfDay() : JacksonConfig.parseIso(date);
        } catch (IllegalArgumentException | DateTimeException e) {
            throw BizException.badRequest("startedAt 时间格式不正确");
        }
    }

    @GetMapping
    public List<Map<String, Object>> list(@CurrentUser UUID userId,
                                          @RequestParam(required = false) String app,
                                          @RequestParam(required = false) Integer limit) {
        return records.list(userId, app, limit == null ? 50 : limit);
    }

    @GetMapping("page")
    public Map<String, Object> page(@CurrentUser UUID userId, @RequestParam String app,
                                     @RequestParam(required = false) String cursor,
                                     @RequestParam(defaultValue = "100") int limit) {
        if (!"hyrox".equals(app) && !"btwe".equals(app)) throw BizException.badRequest("app 仅支持 hyrox / btwe");
        return records.page(userId, app, cursor, limit);
    }

    public record DeleteBody(@NotNull @Pattern(regexp = "hyrox|btwe") String app,
                             @Size(max = 80) String clientId, UUID id) {
    }

    @PostMapping("deletions")
    public Map<String, Object> removeByReference(@CurrentUser UUID userId, @Valid @RequestBody DeleteBody body) {
        return records.removeByReference(userId, body.app(), body.clientId(), body.id());
    }

    @DeleteMapping("{id}")
    public Map<String, Object> remove(@CurrentUser UUID userId, @PathVariable UUID id) {
        return records.remove(userId, id);
    }
}
