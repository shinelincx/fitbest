package com.ifitbest.server.common.util;

/** 身份标识脱敏 —— 与原 NestJS common/profile.ts 中的实现一致 */
public final class Masks {

    private Masks() {
    }

    public static String phone(String phone) {
        return phone != null && phone.length() >= 7
            ? phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4)
            : phone;
    }

    public static String email(String email) {
        if (email == null) {
            return null;
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return email;
        }
        String name = email.substring(0, at);
        return name.substring(0, 1) + "***" + email.substring(at);
    }

    public static String wechat(String identifier) {
        if (identifier == null) {
            return null;
        }
        int prefix = identifier.startsWith("devu_") || identifier.startsWith("dev_") ? 5 : 4;
        return identifier.substring(0, Math.min(prefix, identifier.length()))
            + "***"
            + (identifier.length() > 2 ? identifier.substring(identifier.length() - 2) : "");
    }
}
