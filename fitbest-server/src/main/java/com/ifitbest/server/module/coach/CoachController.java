package com.ifitbest.server.module.coach;

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
import com.ifitbest.server.common.auth.OptionalUser;
import com.ifitbest.server.common.error.BizException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** AI 教练端点 —— /api/v1/coach（chat / plan 可选登录，context 需登录） */
@RestController
@RequestMapping("/api/v1/coach")
public class CoachController {

    private final CoachService coach;

    public CoachController(CoachService coach) {
        this.coach = coach;
    }

    // ---------- 请求体 ----------

    public record ChatMessage(
        @Pattern(regexp = "user|coach") String role,
        @NotBlank @Size(max = 500) String content) {
    }

    public record ChatBody(
        @Pattern(regexp = "hyrox|btwe") String app,
        @NotEmpty(message = "消息不能为空") @Size(max = 20) List<@Valid ChatMessage> messages,
        @Size(max = 600) String context) {
    }

    public record DigestBody(
        @Min(0) Integer recentCount,
        @Min(0) Integer avgTotalSec,
        @Min(0) Integer avgRunSplitSec,
        @Size(max = 8) List<@Size(max = 60) String> weakestStations,
        @Min(1) @Max(10) Integer lastRpe,
        @Min(0) Integer avgTreadmillPaceSec,
        @Min(0) @Max(100) Integer treadmillConsistencyPct,
        @Min(0) Integer treadmillSessions) {
    }

    public record PlanBody(
        @Pattern(regexp = "hyrox|btwe") String app,
        @Pattern(regexp = "finish|pb") String goal,
        @Pattern(regexp = "none|once|multi") String experience,
        @NotNull @Min(2) @Max(5) Integer daysPerWeek,
        @NotNull @Min(20) @Max(180) Integer sessionMinutes,
        @Size(max = 10) List<@Size(max = 30) String> equipment,
        @Size(max = 80) String weak,
        String raceDate,
        DigestBody digest) {
    }

    // ---------- 端点 ----------

    @OptionalUser
    @PostMapping("chat")
    public Map<String, Object> chat(@CurrentUser(required = false) String userId,
                                    @Valid @RequestBody ChatBody body) {
        String app = body.app() == null ? "hyrox" : body.app();
        List<CoachService.CoachMessage> messages = body.messages().stream()
            .map(m -> new CoachService.CoachMessage(m.role(), m.content()))
            .toList();
        // 游客可用本地摘要补充上下文；登录用户以服务端数据为准（简化：直接用请求 context）
        return coach.chat(app, messages, body.context());
    }

    @OptionalUser
    @PostMapping("plan/generate")
    public Map<String, Object> generatePlan(@CurrentUser(required = false) String userId,
                                            @Valid @RequestBody PlanBody body) {
        DigestBody d = body.digest();
        PlanEngine.PlanDigest digest = d == null ? null : new PlanEngine.PlanDigest(
            d.recentCount(), d.avgTotalSec(), d.avgRunSplitSec(), d.weakestStations(), d.lastRpe(),
            d.avgTreadmillPaceSec(), d.treadmillConsistencyPct(), d.treadmillSessions());
        PlanEngine.PlanRequest request = new PlanEngine.PlanRequest(
            body.app() == null ? "hyrox" : body.app(),
            body.goal() == null ? "finish" : body.goal(),
            body.experience() == null ? "none" : body.experience(),
            body.daysPerWeek(), body.sessionMinutes(),
            body.equipment() == null ? List.of() : body.equipment(),
            body.weak() == null || body.weak().isBlank() ? "没有短板" : body.weak(),
            body.raceDate(), digest);
        if (body.raceDate() != null && !isValidIsoDate(body.raceDate())) {
            throw BizException.badRequest("raceDate 时间格式不正确");
        }
        return coach.generatePlan(userId == null ? null : UUID.fromString(userId), request);
    }

    @Authed
    @GetMapping("context")
    public Map<String, Object> getContext(@CurrentUser UUID userId, @RequestParam(required = false) String app) {
        String normalizedApp = "btwe".equals(app) ? "btwe" : "hyrox";
        CoachService.ContextResult ctx = coach.context(userId, normalizedApp);
        Map<String, Object> digest = new java.util.LinkedHashMap<>();
        digest.put("recentCount", ctx.digest().recentCount());
        digest.put("avgTotalSec", ctx.digest().avgTotalSec());
        digest.put("avgRunSplitSec", ctx.digest().avgRunSplitSec());
        digest.put("weakestStations", ctx.digest().weakestStations());
        digest.put("lastRpe", ctx.digest().lastRpe());
        digest.put("avgTreadmillPaceSec", ctx.digest().avgTreadmillPaceSec());
        digest.put("treadmillConsistencyPct", ctx.digest().treadmillConsistencyPct());
        digest.put("treadmillSessions", ctx.digest().treadmillSessions());
        return Map.of("digest", digest, "text", ctx.text());
    }

    private static boolean isValidIsoDate(String value) {
        try {
            java.time.Instant.parse(value);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
