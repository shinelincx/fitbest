package com.ifitbest.server.module.coach;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 确定性训练计划引擎 —— 所有数字在这里算，LLM 只负责表达。与 NestJS plan.engine.ts 输出一致 */
public final class PlanEngine {

    private PlanEngine() {
    }

    // ---------- 类型 ----------

    public record PlanDigest(Integer recentCount, Integer avgTotalSec, Integer avgRunSplitSec,
                             List<String> weakestStations, Integer lastRpe,
                             Integer avgTreadmillPaceSec, Integer treadmillConsistencyPct, Integer treadmillSessions) {
    }

    public record PlanRequest(String app, String goal, String experience, int daysPerWeek, int sessionMinutes,
                              List<String> equipment, String weak, String raceDate, PlanDigest digest) {
    }

    record SessionTemplate(String title, String detail, String intent, String guardrail) {
    }

    public record GeneratedWeek(int week, String phase, String focus, double volumeFactor,
                                List<Map<String, Object>> sessions) {
    }

    public static Map<String, Object> generate(PlanRequest req) {
        String app = req.app() == null ? "hyrox" : req.app();
        int days = clamp((int) Math.round(req.daysPerWeek()), 2, 5);
        PlanDigest digest = req.digest();
        boolean dataDriven = digest != null && digest.recentCount() != null && digest.recentCount() > 0;

        int weeks = "pb".equals(req.goal()) ? 8 : "none".equals(req.experience()) ? 10 : 9;
        Integer byRace = weeksUntil(req.raceDate());
        if (byRace != null) {
            weeks = clamp(byRace, 4, 16);
        }

        List<SessionTemplate> templates = templates(app, days);
        List<String> stations = focusStations(req);
        String runPace = resolveRunPace(req);
        String targetFinish = resolveTargetFinish(req);

        List<GeneratedWeek> weeklyPlan = new ArrayList<>();
        for (int week = 1; week <= weeks; week++) {
            String phase = phaseOf(week, weeks);
            double factor = volumeFactorOf(week, weeks);
            boolean isTaper = "赛前减量期".equals(phase);
            boolean isSim = "模拟测试期".equals(phase);
            String stationNote = stations.isEmpty() ? "" : "重点：" + String.join("、", stations);

            List<Map<String, Object>> sessions = new ArrayList<>();
            for (int idx = 0; idx < templates.size(); idx++) {
                SessionTemplate t = templates.get(idx);
                String detail = t.detail();
                if (isTaper) {
                    detail += "（本周减量 30–40%，保持动作模式即可）";
                } else if (isSim) {
                    detail += "（按比赛标准重量与配速）";
                }
                Map<String, Object> session = new java.util.LinkedHashMap<>();
                session.put("day", "第 " + (idx + 1) + " 次");
                session.put("title", t.title());
                session.put("detail", detail + "；" + runPace + (stationNote.isEmpty() ? "" : "；" + stationNote));
                session.put("intent", t.intent());
                session.put("guardrail", t.guardrail());
                sessions.add(session);
            }
            weeklyPlan.add(new GeneratedWeek(week, phase,
                isTaper ? "减量保状态" : isSim ? "模拟验证" : stations.isEmpty() ? "均衡推进" : "补强 " + stations.get(0),
                factor, sessions));
        }

        List<String> advice = new ArrayList<>();
        if (dataDriven) {
            advice.add("已参考你最近 " + digest.recentCount() + " 次训练"
                + (digest.avgTotalSec() != null ? "（平均 " + mmss(digest.avgTotalSec()) + "）" : "")
                + "自动校准强度。");
            if (!stations.isEmpty()) {
                advice.add("数据显示「" + String.join("、", stations) + "」是你的主要短板，本周期安排了更高频的专项。");
            }
            if (digest.lastRpe() != null && digest.lastRpe() >= 8) {
                advice.add("上次训练主观强度偏高，前两周先把强度降一档，避免累积疲劳。");
            }
            if (digest.treadmillConsistencyPct() != null && digest.treadmillConsistencyPct() < 85
                && digest.avgTreadmillPaceSec() != null) {
                advice.add("跑步机配速一致性 " + digest.treadmillConsistencyPct() + "%，建议每周加一次「匀速跑」：按 "
                    + mmss(digest.avgTreadmillPaceSec()) + "/公里定速，全程不看表、只听节拍。");
            }
        } else {
            advice.add("你还没有足够的模拟数据，先按经验值安排；完成 2 次模拟后我会自动校准。");
        }
        advice.add("单次训练 " + req.sessionMinutes() + " 分钟不含热身放松，请额外留 10 分钟动态热身。");

        List<String> missing = new ArrayList<>();
        if ("hyrox".equals(app)) {
            List<String> equipment = req.equipment() == null ? List.of() : req.equipment();
            if (!equipment.contains("雪橇")) {
                missing.add("雪橇用阻力撬/农夫走替代");
            }
            if (!equipment.contains("药球")) {
                missing.add("药球用壶铃高翻替代");
            }
            if (!equipment.contains("划船机")) {
                missing.add("划船机用滑雪机替代");
            }
            if (!equipment.contains("滑雪机")) {
                missing.add("滑雪机用划船机替代");
            }
        }
        if (!missing.isEmpty()) {
            advice.add("器械替代：" + String.join("；", missing) + "。");
        }
        advice.add("每周至少 2 天完全休息，睡眠 7 小时以上。");

        String experienceText = "none".equals(req.experience()) ? "首次备赛"
            : "once".equals(req.experience()) ? "单次参赛" : "多次参赛";
        String summary = "基于你的" + experienceText + "经验、每周 " + days + " 天 × " + req.sessionMinutes()
            + " 分钟的可训练时间，生成 " + weeks + " 周渐进计划，目标 " + targetFinish + "。";

        List<String> highlights = new ArrayList<>(List.of(
            weeks + " 周周期化",
            "每周 " + days + " 次",
            "目标 " + targetFinish,
            stations.isEmpty() ? "均衡提升" : "重点补强：" + String.join("、", stations),
            dataDriven ? "基于真实训练数据" : "经验值起步"));

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("engine", "deterministic");
        out.put("app", app);
        out.put("name", "pb".equals(req.goal()) ? "教练定制 · PB 冲刺" : "教练定制 · 完赛计划");
        out.put("level", "multi".equals(req.experience()) ? "elite" : "once".equals(req.experience()) ? "intermediate" : "beginner");
        out.put("durationWeeks", weeks);
        out.put("sessionsPerWeek", days);
        out.put("summary", summary);
        out.put("highlights", highlights);
        out.put("targetFinish", targetFinish);
        out.put("advice", advice);
        out.put("weeks", weeklyPlan.stream().map(w -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("week", w.week());
            m.put("phase", w.phase());
            m.put("focus", w.focus());
            m.put("volumeFactor", w.volumeFactor());
            m.put("sessions", w.sessions());
            return m;
        }).toList());
        Map<String, Object> basedOn = new java.util.LinkedHashMap<>();
        basedOn.put("recentCount", digest == null || digest.recentCount() == null ? 0 : digest.recentCount());
        basedOn.put("avgTotalSec", digest == null ? null : digest.avgTotalSec());
        basedOn.put("avgRunSplitSec", digest == null ? null : digest.avgRunSplitSec());
        basedOn.put("weakestStations", stations);
        basedOn.put("dataDriven", dataDriven);
        out.put("basedOn", basedOn);
        return out;
    }

    // ---------- 基础工具 ----------

    private static int clamp(int n, int min, int max) {
        return Math.min(Math.max(n, min), max);
    }

    public static String mmss(int sec) {
        int m = sec / 60;
        int s = Math.round(sec % 60);
        return m + " 分 " + String.format("%02d", s) + " 秒";
    }

    private static Integer weeksUntil(String dateStr) {
        if (dateStr == null || dateStr.isBlank()) {
            return null;
        }
        try {
            long target = java.time.Instant.parse(dateStr).toEpochMilli();
            return (int) Math.ceil((target - System.currentTimeMillis()) / (7.0 * 24 * 3600 * 1000));
        } catch (Exception e) {
            return null;
        }
    }

    private static String phaseOf(int week, int total) {
        double ratio = (double) week / total;
        if (ratio <= 0.2) {
            return "基础适应期";
        }
        if (ratio <= 0.45) {
            return "强度提升期";
        }
        if (ratio <= 0.7) {
            return "专项强化期";
        }
        if (ratio <= 0.9) {
            return "模拟测试期";
        }
        return "赛前减量期";
    }

    private static double volumeFactorOf(int week, int total) {
        double factor = 1 + 0.06 * (week - 1);
        if (week % 4 == 0) {
            factor *= 0.65;
        }
        if (week == total) {
            factor *= 0.6;
        } else if (week == total - 1) {
            factor *= 0.75;
        }
        return Math.round(factor * 100.0) / 100.0;
    }

    private static String resolveTargetFinish(PlanRequest req) {
        Integer avg = req.digest() == null ? null : req.digest().avgTotalSec();
        if (avg != null && avg > 0) {
            int low = (int) Math.round(avg * 0.92 / 60.0);
            int high = (int) Math.round(avg * 0.98 / 60.0);
            return low + "–" + high + " 分钟（基于最近平均 " + mmss(avg) + "）";
        }
        if ("pb".equals(req.goal())) {
            return "比上次快 3–5 分钟";
        }
        if ("none".equals(req.experience())) {
            return "90–105 分钟完赛";
        }
        if ("once".equals(req.experience())) {
            return "75–90 分钟完赛";
        }
        return "65–75 分钟完赛";
    }

    private static String resolveRunPace(PlanRequest req) {
        Integer split = req.digest() == null ? null : req.digest().avgRunSplitSec();
        if (split != null && split > 0) {
            int fast = split - 8;
            int slow = split - 2;
            return "目标跑段 " + mmss(fast) + "–" + mmss(slow) + "/公里";
        }
        return "跑段比 5km 配速慢 30–45 秒/公里";
    }

    private static List<String> focusStations(PlanRequest req) {
        List<String> fromDigest = req.digest() == null || req.digest().weakestStations() == null
            ? List.of()
            : req.digest().weakestStations().stream().filter(s -> s != null && !s.isBlank()).toList();
        if (!fromDigest.isEmpty()) {
            return fromDigest.subList(0, Math.min(2, fromDigest.size()));
        }
        String weak = req.weak() == null ? "" : req.weak().trim();
        if (weak.isEmpty() || "没有短板".equals(weak)) {
            return List.of();
        }
        return List.of(weak);
    }

    // ---------- 课程模板 ----------

    private static List<SessionTemplate> templates(String app, int days) {
        if ("btwe".equals(app)) {
            return switch (days) {
                case 2 -> List.of(
                    new SessionTemplate("800m 间歇 + 心肺", "800m×4 间歇跑；划船机/滑雪机 3×500m", "建立基础心肺与配速感", "配速掉出目标区间就减 1 组"),
                    new SessionTemplate("4 模块模拟", "4 组（800m 跑 + 心肺 + 力量），组间休息 90 秒", "验证基础赛制完成能力", "第一组放慢 5%，先稳住节奏"));
                case 3 -> List.of(
                    new SessionTemplate("间歇跑训练", "800m×5，目标配速 ±10 秒", "提高跑段经济性", "连续 2 组不达标即收工"),
                    new SessionTemplate("心肺 + 力量", "划船机 4×500m；深蹲/硬拉/推举 3 组", "心肺与力量交替，提高整体做功能力", "动作变形即降重量"),
                    new SessionTemplate("4 模块模拟", "4 组全流程模拟，记录每组用时与心率", "产出分段数据用于下周调整", "只记录不硬拼，保留恢复"));
                case 4 -> List.of(
                    new SessionTemplate("轻松有氧", "30 分钟 Zone 2 慢跑或骑行", "低强度恢复 + 有氧基础", "心率超过 Zone 2 上限就改快走"),
                    new SessionTemplate("间歇跑训练", "800m×5 + 200m×4 短冲刺", "提高速度储备与后程冲刺能力", "冲刺组出现动作变形立即停止"),
                    new SessionTemplate("力量训练", "深蹲、硬拉、推举，各 4 组渐进加重", "提高基础力量，支撑心肺模块输出", "腰部不适立即停止"),
                    new SessionTemplate("4 模块模拟", "4 组全流程模拟，按比赛节奏", "完整验证并记录数据", "结束后补充蛋白质与碳水"));
                default -> List.of(
                    new SessionTemplate("轻松有氧", "30–40 分钟 Zone 2", "恢复与有氧基础", "保持能对话的强度"),
                    new SessionTemplate("间歇跑训练", "800m×5 + 200m×4", "提升速度耐力", "掉速 2 组即停"),
                    new SessionTemplate("心肺专项", "划船机 5×500m；滑雪机 4×250m", "提高心肺模块效率", "心率过高延长组间休息"),
                    new SessionTemplate("力量训练", "深蹲、硬拉、推举、农夫行走，各 3–4 组", "力量支撑整体输出", "动作质量优先"),
                    new SessionTemplate("4 模块模拟", "4 组全流程模拟，比赛节奏", "完整验证并沉淀数据", "结束后 10 分钟内完成补给"));
            };
        }
        return switch (days) {
            case 2 -> List.of(
                new SessionTemplate("跑段配速 + 站点力量", "1km×4 间歇跑；推/拉雪橇各 4×25m，组间休息 90 秒", "同时刺激跑段配速和两个大力量站点，维持双线能力", "最后一组若 RPE > 8，直接结束，不补组"),
                new SessionTemplate("完整赛制模拟", "8 组全流程模拟，按比赛重量与配速", "验证当前完赛能力，产出分段时间用于校准下阶段计划", "第一组刻意放慢 5%，避免后程崩盘"));
            case 3 -> List.of(
                new SessionTemplate("跑段配速训练", "1km×4 间歇跑 + 髋部激活，控制在目标配速 ±10 秒", "建立可重复的配速感，让身体记住目标节奏", "配速掉出目标区间 2 组以上就收工"),
                new SessionTemplate("力量站点专项", "推/拉雪橇、农夫行走、沙袋箭步走，各 4 组渐进加重", "提高力量站点的单次输出效率，减少站立停顿", "动作变形立刻降重量，不追求次数"),
                new SessionTemplate("完整赛制模拟", "8 组全流程模拟，跑段略慢于比赛配速，重点练转换", "练跑站转换效率，把站间切换时间压下来", "转换时间超过 20 秒就停下来复盘一次"));
            case 4 -> List.of(
                new SessionTemplate("跑段配速训练", "1km×4 间歇跑 + 阈值跑 10 分钟", "提升乳酸阈值，让比赛配速更省力", "心率超过阈值区间上限 30 秒仍未回落则降速"),
                new SessionTemplate("力量站点专项", "雪橇推/拉、农夫行走、沙袋箭步走，4 组渐进加重", "补齐力量短板，保持动作质量优先", "任一组动作变形即降重"),
                new SessionTemplate("心肺站点专项", "滑雪机/划船机 4×1000m；药球过墙 4×25 次", "提高心肺站点耐力，降低后程掉速", "心率连续 2 分钟高于上限则延长组间休息"),
                new SessionTemplate("完整赛制模拟", "8 组全流程模拟，记录分段时间与心率漂移", "用真实数据定位短板，为下周计划提供依据", "模拟只记录不硬拼，避免影响后续训练"));
            default -> List.of(
                new SessionTemplate("轻松有氧跑", "30–40 分钟 Zone 2 慢跑", "在低强度下积累有氧基础，同时促进恢复", "心率超过 Zone 2 上限就改快走"),
                new SessionTemplate("跑段配速训练", "1km×5 间歇跑 + 阈值跑 10 分钟", "提高配速稳定性，为比赛后程储备速度", "第 4 组开始掉速就停止加组"),
                new SessionTemplate("力量站点专项", "雪橇推/拉、农夫行走、沙袋箭步走，4 组渐进加重", "提高绝对力量，减少赛中的力量瓶颈", "腰部不适立即停止，不硬撑"),
                new SessionTemplate("心肺站点 + 半程模拟", "滑雪机/划船机专项 + 4 组半程模拟", "在疲劳状态下练站点输出，模拟比赛中段感受", "半程模拟后若 RPE > 8，取消最后的补充组"),
                new SessionTemplate("完整赛制模拟", "8 组全流程模拟，比赛重量与配速", "完整验证一次，产出可对比的分段数据", "结束后 10 分钟内完成补水与碳水补充"));
        };
    }
}
