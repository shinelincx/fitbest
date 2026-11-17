package com.ifitbest.server.module.device;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 从手环段推导训练字段 —— 与 NestJS deriveTraining 算法一致 */
public final class SegmentDeriver {

    private static final int RUN_SPLIT_MIN_DISTANCE_M = 500;

    private SegmentDeriver() {
    }

    public record SegmentInput(int seq, String type, String machineSerial, String machineType,
                               Integer connectTick, Integer disconnectTick, int durationSec, int distanceM,
                               Map<String, Object> metrics) {
    }

    public record Derived(int distanceM, List<Integer> moduleTimes, List<Integer> runSplits) {
    }

    /**
     * - runSplits：跑步机段按实际距离折算「每公里用时」
     * - moduleTimes：按赛制合成组（HYROX = 1 站点/组，BTWE = 2 站点/组）
     */
    public static Derived derive(List<SegmentInput> segments, String app) {
        List<SegmentInput> sorted = new ArrayList<>(segments);
        sorted.sort((a, b) -> Integer.compare(a.seq(), b.seq()));
        int stationsPerModule = "btwe".equals(app) ? 2 : 1;

        List<Integer> runSplits = new ArrayList<>();
        int treadmillDistanceM = 0;
        int moduleAcc = 0;
        int stationsInModule = 0;
        List<Integer> moduleTimes = new ArrayList<>();

        for (SegmentInput seg : sorted) {
            if ("treadmill".equals(seg.type())) {
                treadmillDistanceM += seg.distanceM();
                moduleAcc += seg.durationSec();
                if (seg.durationSec() > 0 && seg.distanceM() >= RUN_SPLIT_MIN_DISTANCE_M) {
                    runSplits.add((int) Math.round((seg.durationSec() * 1000.0) / seg.distanceM()));
                }
                continue;
            }
            if ("station".equals(seg.type())) {
                moduleAcc += seg.durationSec();
                stationsInModule += 1;
                if (stationsInModule >= stationsPerModule) {
                    if (moduleAcc > 0) {
                        moduleTimes.add(moduleAcc);
                    }
                    moduleAcc = 0;
                    stationsInModule = 0;
                }
            }
        }
        // 结尾未配齐一整组的阶段（终止训练）也按一组计入
        if (moduleAcc > 0) {
            moduleTimes.add(moduleAcc);
        }

        return new Derived(treadmillDistanceM,
            moduleTimes.isEmpty() ? null : moduleTimes,
            runSplits.isEmpty() ? null : runSplits);
    }
}
