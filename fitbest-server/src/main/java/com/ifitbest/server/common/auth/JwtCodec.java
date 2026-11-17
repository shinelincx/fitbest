package com.ifitbest.server.common.auth;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;

/**
 * JWT 编解码（HS256）—— 手写实现，与 Node jsonwebtoken 字节级兼容：
 *  - header 固定 {"alg":"HS256","typ":"JWT"}
 *  - payload 自动附带 iat/exp（秒）
 *  - 令牌可跨端互验：NestJS 签发的 token 在此可验，反之亦然（灰度期双后端并行依赖此特性）
 */
@Component
public class JwtCodec {

    public static final String TYP_ACCESS = "access";
    public static final String TYP_REFRESH = "refresh";
    public static final String TYP_ADMIN = "admin";

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final FitbestProperties props;

    public JwtCodec(FitbestProperties props) {
        this.props = props;
    }

    public String signAccess(String userId) {
        return sign(Map.of("sub", userId, "typ", TYP_ACCESS),
            props.getJwt().getAccessSecret(), Times.parseDurationSeconds(props.getJwt().getAccessTtl(), 900));
    }

    public String signRefresh(String userId, String sessionId) {
        return sign(Map.of("sub", userId, "sid", sessionId, "typ", TYP_REFRESH),
            props.getJwt().getRefreshSecret(), Times.parseDurationSeconds(props.getJwt().getRefreshTtl(), 30 * 86400));
    }

    public String signAdmin(AdminPayload payload) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("aid", payload.aid());
        claims.put("typ", TYP_ADMIN);
        claims.put("role", payload.role());
        claims.put("orgId", payload.orgId());
        claims.put("gymId", payload.gymId());
        return sign(claims, props.getJwt().getAdminSecret(), 8 * 3600);
    }

    /** 校验并返回 payload；签名不符 / 过期 / typ 不符抛出 IllegalArgumentException */
    public Map<String, Object> verify(String token, String expectedTyp, String secret) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                throw new IllegalArgumentException("invalid token");
            }
            String expected = b64Mac(parts[0] + "." + parts[1], secret);
            if (!MessageDigests.constantTimeEquals(expected, parts[2])) {
                throw new IllegalArgumentException("bad signature");
            }
            String json = new String(B64D.decode(parts[1]), StandardCharsets.UTF_8);
            Map<String, Object> claims = Json.read(json);
            if (!expectedTyp.equals(claims.get("typ"))) {
                throw new IllegalArgumentException("invalid token type");
            }
            Object exp = claims.get("exp");
            if (exp instanceof Number n && System.currentTimeMillis() / 1000 >= n.longValue()) {
                throw new IllegalArgumentException("expired");
            }
            return claims;
        } catch (Exception e) {
            throw new IllegalArgumentException("invalid token", e);
        }
    }

    private String sign(Map<String, Object> claims, String secret, long ttlSeconds) {
        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> payload = new LinkedHashMap<>(claims);
        payload.put("iat", now);
        payload.put("exp", now + ttlSeconds);
        String header = B64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String body = B64.encodeToString(Json.write(payload).getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + body;
        return signingInput + "." + b64Mac(signingInput, secret);
    }

    private static String b64Mac(String input, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return B64.encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 管理端载荷（对应 NestJS AdminPayload） */
    public record AdminPayload(String aid, String role, String orgId, String gymId) {
        public static AdminPayload fromClaims(Map<String, Object> claims) {
            return new AdminPayload(
                String.valueOf(claims.get("aid")),
                String.valueOf(claims.get("role")),
                String.valueOf(claims.get("orgId")),
                claims.get("gymId") == null ? null : String.valueOf(claims.get("gymId")));
        }
    }

    /** 轻量 JSON 工具（避免循环依赖，仅用于 JWT payload） */
    static final class Json {
        private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

        static Map<String, Object> read(String json) {
            try {
                return MAPPER.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
            } catch (Exception e) {
                throw new IllegalArgumentException(e);
            }
        }

        static String write(Object value) {
            try {
                return MAPPER.writeValueAsString(value);
            } catch (Exception e) {
                throw new IllegalArgumentException(e);
            }
        }
    }

    /** 常量时间比较，避免时序侧信道 */
    static final class MessageDigests {
        static boolean constantTimeEquals(String a, String b) {
            byte[] x = a.getBytes(StandardCharsets.UTF_8);
            byte[] y = b.getBytes(StandardCharsets.UTF_8);
            return java.security.MessageDigest.isEqual(x, y);
        }
    }

    /** 当前 UTC 时间（实体统一使用） */
    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }
}
