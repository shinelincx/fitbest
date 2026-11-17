package com.ifitbest.server.module.coach;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.ifitbest.server.infra.integration.LlmClient;
import com.ifitbest.server.infra.persistence.DeviceSegment;
import com.ifitbest.server.infra.persistence.DeviceSegmentRepo;
import com.ifitbest.server.infra.persistence.DeviceSession;
import com.ifitbest.server.infra.persistence.DeviceSessionRepo;
import com.ifitbest.server.infra.persistence.SegmentType;
import com.ifitbest.server.infra.persistence.TrainingRecord;
import com.ifitbest.server.infra.persistence.TrainingRecordRepo;
import com.ifitbest.server.infra.persistence.WorkoutMode;
import com.ifitbest.server.module.record.RecordsService;
import com.ifitbest.server.config.FitbestProperties;

/** AI 教练 —— LLM（可插拔）+ 本地规则降级 + 用户训练数据摘要，契约一致 */
@Service
public class CoachService {

    public record CoachMessage(String role, String content) {
    }

    private static final Map<String, String> BRAND_PROMPT = Map.of(
        "hyrox", "HYROX 赛制为 8 组（1km 跑 + 一个功能站点），共 8 个功能站点（滑雪机、推雪橇、拉雪橇、波比跳远、划船机、农夫行走、沙袋弓步、墙球）。",
        "btwe", "BTWE 赛制为 4 组模块（800m 跑 + 心肺动作 + 力量动作），适合入门与日常基础体能训练。");

    private record Rule(String[] match, String reply) {
    }

    private static final List<Rule> COMMON_RULES = List.of(
        new Rule(new String[]{"心率", "bpm", "心跳", "正常"},
            "训练心率分三个区间：热身区 100-130 bpm，有氧耐力区 130-160 bpm，高强度间歇区 160-185 bpm。模块赛大部分时间应在 140-170 之间。如果静息心率超过 75，说明恢复不足，建议主动休息一天。"),
        new Rule(new String[]{"耐力", "提升", "持久", "跑"},
            "提升耐力有三个关键点：① 每周 2 次低心率长距离跑（心率控制在 140 以内，40 分钟以上）；② 划船机/滑雪机做 20 分钟稳态训练，配速稳定不爆；③ 保证睡眠 7 小时以上，耐力是在恢复中长出来的。"),
        new Rule(new String[]{"动作", "标准", "姿势", "发力"},
            "动作质量永远比重量重要。建议：① 拍视频对照标准动作；② 降重量找发力感；③ 关注核心收紧——所有动作的根基都是核心稳定；④ 如有疼痛立即停止。"),
        new Rule(new String[]{"恢复", "休息", "酸痛", "疲劳"},
            "恢复四件套：① 睡眠 7-9 小时；② 训练后 30 分钟内补充蛋白质+碳水；③ 泡沫轴放松大腿前侧和背部；④ 主动恢复日做 20 分钟低强度骑行。如果连续两天静息心率偏高 10 以上，强制休息。"),
        new Rule(new String[]{"饮食", "吃", "营养", "减脂"},
            "训练前 1.5 小时吃一根香蕉+一片面包；训练中每 20 分钟补一口水；训练后 30 分钟内摄入 20-30g 蛋白质。日常保证每公斤体重 1.6-2g 蛋白质，碳水占总热量 50% 左右。"),
        new Rule(new String[]{"受伤", "疼", "痛", "膝盖", "腰"},
            "疼痛是身体的警告，不是考验。建议：① 立即停止引发疼痛的动作；② 急性期 48 小时内冰敷，每次 15 分钟；③ 观察是否影响日常活动，如果影响请就医；④ 恢复训练时从低强度开始。"));

    private static final Map<String, List<Rule>> PLAN_RULES = Map.of(
        "hyrox", List.of(new Rule(new String[]{"今天", "练什么", "训练", "计划", "备赛"},
            "建议今天做完整赛制模拟：8 组（1km 跑 + 功能站点）。先动态热身 5 分钟，重点激活髋部和核心。跑段保持目标配速，站点之间快速转换，跑步时鼻吸嘴呼，力量动作时发力呼气、还原吸气。")),
        "btwe", List.of(new Rule(new String[]{"今天", "练什么", "训练", "计划", "备赛"},
            "建议今天做模块赛模拟：4 组（800m 跑 + 心肺 + 力量）。先动态热身 5 分钟，每组之间休息 90 秒，注意呼吸节奏——跑步时鼻吸嘴呼，力量动作时发力呼气、还原吸气。")));

    private static final Map<String, String> FALLBACK = Map.of(
        "hyrox", "我是你的 HYROX 专属 AI 教练。关于训练计划、心率监控、动作要领、恢复饮食都可以问我。你可以试试问「今天练什么」「心率多少正常」或者「怎么提升耐力」。",
        "btwe", "我是你的 BTWE 专属 AI 教练。关于训练计划、心率监控、动作要领、恢复饮食都可以问我。你可以试试问「今天练什么」「心率多少正常」或者「怎么提升耐力」。");

    private final TrainingRecordRepo trainingRecords;
    private final DeviceSessionRepo deviceSessions;
    private final DeviceSegmentRepo deviceSegments;
    private final LlmClient llm;
    private final FitbestProperties props;

    public CoachService(TrainingRecordRepo trainingRecords, DeviceSessionRepo deviceSessions,
                        DeviceSegmentRepo deviceSegments, LlmClient llm, FitbestProperties props) {
        this.trainingRecords = trainingRecords;
        this.deviceSessions = deviceSessions;
        this.deviceSegments = deviceSegments;
        this.llm = llm;
        this.props = props;
    }

    // ---------- 对话 ----------

    public Map<String, Object> chat(String app, List<CoachMessage> messages, String contextText) {
        String normalizedApp = "btwe".equals(app) ? "btwe" : "hyrox";
        CoachMessage last = null;
        for (int i = messages.size() - 1; i >= 0; i--) {
            if ("user".equals(messages.get(i).role())) {
                last = messages.get(i);
                break;
            }
        }
        String question = last == null || last.content() == null ? "" : last.content().trim();

        if (!props.getLlm().getApiKey().isBlank()) {
            String reply = callLlm(normalizedApp, messages, contextText);
            if (reply != null && !reply.isBlank()) {
                return Map.of("reply", reply, "source", "llm");
            }
        }

        String base = localReply(normalizedApp, question);
        return Map.of("reply",
            contextText == null || contextText.isBlank() ? base : base + "（已参考你的近况：" + contextText + "）",
            "source", "local");
    }

    private String callLlm(String app, List<CoachMessage> messages, String contextText) {
        List<Map<String, String>> llmMessages = new ArrayList<>();
        llmMessages.add(Map.of("role", "system", "content", systemPrompt(app, contextText)));
        int from = Math.max(0, messages.size() - 10);
        for (CoachMessage m : messages.subList(from, messages.size())) {
            String content = m.content() == null ? "" : m.content();
            if (content.length() > 500) {
                content = content.substring(0, 500);
            }
            llmMessages.add(Map.of("role", "coach".equals(m.role()) ? "assistant" : "user", "content", content));
        }
        return llm.chat(llmMessages, 0.6, 400);
    }

    private String systemPrompt(String app, String contextText) {
        return "你是 FITBEST 的 AI 体能教练，名字叫「教练小菲」，专精 HYROX 与 BTWE 体能赛事训练。\n"
            + BRAND_PROMPT.get(app) + "\n"
            + "要求：\n"
            + "1. 用简体中文回答，语气专业、亲切、简洁，控制在 120 字以内。\n"
            + "2. 回答围绕训练计划、心率区间、动作要领、恢复与饮食、赛前备赛。\n"
            + "3. 涉及受伤或医疗问题时，提醒用户及时就医，不要给出诊断。\n"
            + "4. 不要编造具体赛事日期、价格或医疗结论。\n"
            + "5. 如果用户数据里提到具体数字，回答必须引用这些数字，不要另编数字。\n"
            + (contextText != null && !contextText.isBlank()
                ? "\n用户近况（只能引用，不得编造）：\n" + contextText
                : "");
    }

    private String localReply(String app, String input) {
        String lower = input == null ? "" : input.toLowerCase();
        List<Rule> rules = new ArrayList<>(PLAN_RULES.get(app));
        rules.addAll(COMMON_RULES);
        for (Rule rule : rules) {
            for (String keyword : rule.match()) {
                if (lower.contains(keyword)) {
                    return rule.reply();
                }
            }
        }
        return FALLBACK.get(app);
    }

    // ---------- 用户训练数据摘要 ----------

    public record ContextResult(PlanEngine.PlanDigest digest, String text) {
    }

    public ContextResult context(UUID userId, String app) {
        List<TrainingRecord> records = trainingRecords.findByUserIdAndApp(userId, app,
            org.springframework.data.domain.PageRequest.of(0, 12));

        List<TrainingRecord> completed = records.stream().filter(TrainingRecord::isCompleted).toList();
        Integer avgTotalSec = completed.isEmpty() ? null
            : (int) Math.round(completed.stream().mapToInt(TrainingRecord::getTotalTimeSec).average().orElse(0));

        List<Integer> splits = new ArrayList<>();
        for (TrainingRecord r : records) {
            List<Integer> runSplits = parseIntList(r.getRunSplits());
            splits.addAll(runSplits.stream().filter(n -> n != null && n > 0).toList());
        }
        Integer avgRunSplitSec = splits.isEmpty() ? null
            : (int) Math.round(splits.stream().mapToInt(Integer::intValue).average().orElse(0));

        java.util.Map<String, Integer> stationCounts = new LinkedHashMap<>();
        for (TrainingRecord r : records) {
            if (r.getWeakestStation() != null) {
                stationCounts.merge(r.getWeakestStation(), 1, Integer::sum);
            }
        }
        List<String> weakestStations = stationCounts.entrySet().stream()
            .sorted((a, b) -> b.getValue() - a.getValue())
            .limit(2)
            .map(Map.Entry::getKey)
            .toList();

        Integer lastRpe = records.isEmpty() ? null : records.get(0).getRpe();

        // 跑步机训练数据（deviceSession mode=training）单独汇总：配速与配速一致性
        List<DeviceSession> sessions = deviceSessions.findByUserIdAndAppAndModeOrderByStartedAtDesc(
            userId, app, WorkoutMode.training, org.springframework.data.domain.PageRequest.of(0, 12));

        List<Double> paces = new ArrayList<>();
        int treadmillSessions = 0;
        for (DeviceSession s : sessions) {
            List<DeviceSegment> segs = deviceSegments.findBySessionIdAndType(s.getId(), SegmentType.treadmill).stream()
                .filter(seg -> seg.getDurationSec() > 0 && seg.getDistanceM() >= 500)
                .toList();
            if (segs.isEmpty()) {
                continue;
            }
            treadmillSessions += 1;
            for (DeviceSegment seg : segs) {
                paces.add(seg.getDurationSec() * 1000.0 / seg.getDistanceM());
            }
        }

        Integer avgTreadmillPaceSec = null;
        Integer treadmillConsistencyPct = null;
        if (!paces.isEmpty()) {
            double mean = paces.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            double variance = paces.stream().mapToDouble(p -> (p - mean) * (p - mean)).average().orElse(0);
            double cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
            avgTreadmillPaceSec = (int) Math.round(mean);
            treadmillConsistencyPct = Math.max(0, Math.min(100, (int) Math.round(100 - cv * 100)));
        }

        PlanEngine.PlanDigest digest = new PlanEngine.PlanDigest(
            records.size(), avgTotalSec, avgRunSplitSec, weakestStations, lastRpe,
            avgTreadmillPaceSec, treadmillConsistencyPct, paces.isEmpty() ? 0 : treadmillSessions);

        List<String> parts = new ArrayList<>();
        parts.add("最近 " + records.size() + " 次训练，完成 " + completed.size() + " 次");
        if (avgTotalSec != null && avgTotalSec > 0) {
            parts.add("平均用时 " + PlanEngine.mmss(avgTotalSec));
        }
        if (avgRunSplitSec != null && avgRunSplitSec > 0) {
            parts.add("平均跑段 " + PlanEngine.mmss(avgRunSplitSec) + "/公里");
        }
        if (!weakestStations.isEmpty()) {
            parts.add("短板站点 " + String.join("、", weakestStations));
        }
        if (lastRpe != null && lastRpe > 0) {
            parts.add("上次主观强度 RPE " + lastRpe);
        }
        if (avgTreadmillPaceSec != null) {
            parts.add("跑步机 " + treadmillSessions + " 次、平均配速 " + PlanEngine.mmss(avgTreadmillPaceSec)
                + "/公里、配速一致性 " + treadmillConsistencyPct + "%");
        }
        return new ContextResult(digest, String.join("；", parts) + "。");
    }

    public Map<String, Object> generatePlan(UUID userId, PlanEngine.PlanRequest req) {
        if (userId != null) {
            ContextResult ctx = context(userId, req.app() == null ? "hyrox" : req.app());
            PlanEngine.PlanDigest merged = mergeDigest(ctx.digest(), req.digest());
            return PlanEngine.generate(withDigest(req, merged));
        }
        return PlanEngine.generate(req);
    }

    private static PlanEngine.PlanRequest withDigest(PlanEngine.PlanRequest req, PlanEngine.PlanDigest digest) {
        return new PlanEngine.PlanRequest(req.app(), req.goal(), req.experience(), req.daysPerWeek(),
            req.sessionMinutes(), req.equipment(), req.weak(), req.raceDate(), digest);
    }

    /** 请求携带的 digest 覆盖服务端摘要（与 NestJS { ...digest, ...req.digest } 语义一致） */
    private static PlanEngine.PlanDigest mergeDigest(PlanEngine.PlanDigest base, PlanEngine.PlanDigest override) {
        if (override == null) {
            return base;
        }
        return new PlanEngine.PlanDigest(
            override.recentCount() != null ? override.recentCount() : base.recentCount(),
            override.avgTotalSec() != null ? override.avgTotalSec() : base.avgTotalSec(),
            override.avgRunSplitSec() != null ? override.avgRunSplitSec() : base.avgRunSplitSec(),
            override.weakestStations() != null ? override.weakestStations() : base.weakestStations(),
            override.lastRpe() != null ? override.lastRpe() : base.lastRpe(),
            override.avgTreadmillPaceSec() != null ? override.avgTreadmillPaceSec() : base.avgTreadmillPaceSec(),
            override.treadmillConsistencyPct() != null ? override.treadmillConsistencyPct() : base.treadmillConsistencyPct(),
            override.treadmillSessions() != null ? override.treadmillSessions() : base.treadmillSessions());
    }

    private static List<Integer> parseIntList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<Integer>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    public static List<Integer> parseListSafe(String json) {
        return parseIntList(json);
    }

    public static Object parseJsonSafe(String json) {
        return RecordsService.parseJson(json);
    }
}
