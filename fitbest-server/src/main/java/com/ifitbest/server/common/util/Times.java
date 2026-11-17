package com.ifitbest.server.common.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 时间工具 —— 与原 NestJS common/time.ts 语义一致（上海时区业务日 + UTC 存储） */
public final class Times {

    public static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");
    private static final Pattern DURATION = Pattern.compile("^(\\d+)([smhd])$");

    private Times() {
    }

    /** 当前 UTC 时间（实体时间戳统一使用 UTC 墙钟，与 Node Date 行为一致） */
    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 上海时区 YYYY-MM-DD（对应 now+8h 后的日期） */
    public static String shanghaiDateKey(LocalDateTime utcDateTime) {
        return utcDateTime.atZone(ZoneOffset.UTC).withZoneSameInstant(SHANGHAI).toLocalDate().toString();
    }

    /** 本周一 00:00（上海时区）对应的 UTC 时间 */
    public static LocalDateTime weekStartShanghai() {
        return weekStartShanghai(nowUtc());
    }

    public static LocalDateTime weekStartShanghai(LocalDateTime nowUtc) {
        ZonedDateTime local = nowUtc.atZone(ZoneOffset.UTC).withZoneSameInstant(SHANGHAI);
        int day = local.getDayOfWeek().getValue(); // 1=周一 .. 7=周日
        int offset = day == 7 ? 6 : day - 1;
        LocalDate monday = local.toLocalDate().minusDays(offset);
        return monday.atStartOfDay(SHANGHAI).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** 本月 1 日 00:00（上海时区）对应的 UTC 时间 */
    public static LocalDateTime monthStartShanghai() {
        ZonedDateTime local = nowUtc().atZone(ZoneOffset.UTC).withZoneSameInstant(SHANGHAI);
        return local.toLocalDate().withDayOfMonth(1).atStartOfDay(SHANGHAI)
            .withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** 今天 00:00（上海时区）对应的 UTC 时间 */
    public static LocalDateTime dayStartShanghai() {
        ZonedDateTime local = nowUtc().atZone(ZoneOffset.UTC).withZoneSameInstant(SHANGHAI);
        return local.toLocalDate().atStartOfDay(SHANGHAI).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    /** 本周一到周日共 7 天的日期键 */
    public static List<String> currentWeekDays() {
        LocalDateTime start = weekStartShanghai();
        List<String> days = new ArrayList<>(7);
        for (int i = 0; i < 7; i++) {
            days.add(shanghaiDateKey(start.plusDays(i)));
        }
        return days;
    }

    /** 解析 15m / 8h / 30d / 60s 为秒 */
    public static long parseDurationSeconds(String value, long fallbackSeconds) {
        if (value == null) {
            return fallbackSeconds;
        }
        Matcher m = DURATION.matcher(value.trim());
        if (!m.matches()) {
            return fallbackSeconds;
        }
        long amount = Long.parseLong(m.group(1));
        return switch (m.group(2)) {
            case "s" -> amount;
            case "m" -> amount * 60;
            case "h" -> amount * 3600;
            default -> amount * 86400;
        };
    }

    /** sha256 hex（与 Node createHash('sha256') 一致） */
    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
