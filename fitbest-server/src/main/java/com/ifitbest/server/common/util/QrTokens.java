package com.ifitbest.server.common.util;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** 器械二维码签名 —— 与原 NestJS common/scan-token.ts 一致：fb1.{machineId}.{HMAC 前 16 字符} */
public final class QrTokens {

    private QrTokens() {
    }

    public static String signMachine(String machineId, String secret) {
        return hmacSha256Base64Url(machineId, secret).substring(0, 16);
    }

    public static String buildQrValue(String machineId, String secret) {
        return "fb1." + machineId + "." + signMachine(machineId, secret);
    }

    /** 验签通过返回 machineId，否则 null */
    public static String parseQrValue(String value, String secret) {
        String[] parts = value.trim().split("\\.");
        if (parts.length != 3 || !"fb1".equals(parts[0])) {
            return null;
        }
        String machineId = parts[1];
        return signMachine(machineId, secret).equals(parts[2]) ? machineId : null;
    }

    public static String hmacSha256Base64Url(String input, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
