package com.ifitbest.server.module.auth;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.UserRepo;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeviceLoginService {
    static final int POLL_INTERVAL_SECONDS = 3;
    private static final int VALID_SECONDS = 90;
    private static final String SELECT = """
        SELECT device_name, verification_code, expires_at, user_id, status
        FROM device_login_requests WHERE scan_id = ?
        """;
    private static final RowMapper<Challenge> READ_CHALLENGE = (row, index) -> new Challenge(
        row.getString("device_name"), row.getString("verification_code"),
        row.getObject("expires_at", OffsetDateTime.class), row.getObject("user_id", UUID.class),
        row.getString("status"));

    private record Challenge(String deviceName, String verificationCode, OffsetDateTime expiresAt,
                             UUID userId, String status) {
        boolean expired() {
            return !expiresAt.isAfter(OffsetDateTime.now(ZoneOffset.UTC));
        }

        void checkMobile(UUID actor) {
            if (status.equals("redeemed")) throw BizException.conflict("二维码已使用，请重新生成");
            if (status.equals("cancelled") || expired()) throw new BizException(410, "二维码已失效，请重新生成");
            if (userId != null && !userId.equals(actor)) throw BizException.conflict("二维码已由其他账号确认");
        }
    }

    public record Start(String scanId, String qrPayload, String deviceSecret, String verificationCode,
                        String expiresAt, int pollIntervalSeconds) {}
    public record Preview(String deviceName, String verificationCode, String expiresAt) {}

    private final JdbcTemplate db;
    private final UserRepo users;
    private final AuthService auth;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();

    public DeviceLoginService(JdbcTemplate db, UserRepo users, AuthService auth, ObjectMapper json) {
        this.db = db;
        this.users = users;
        this.auth = auth;
        this.json = json;
    }

    Start start(String deviceName) {
        String scanId = randomHex(16);
        String secret = randomHex(32);
        String code = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
        OffsetDateTime expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(VALID_SECONDS);
        String payload;
        try {
            payload = json.writeValueAsString(Map.of("type", "fitbest.device-login", "version", 1, "scanId", scanId));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法生成设备登录二维码", e);
        }
        db.update("""
            INSERT INTO device_login_requests (scan_id, device_secret_hash, device_name, verification_code, expires_at)
            VALUES (?, ?, NULLIF(?, ''), ?, ?)
            """, scanId, Times.sha256Hex(secret), deviceName == null ? null : deviceName.strip(), code, expiresAt);
        return new Start(scanId, payload, secret, code, expiresAt.toInstant().toString(), POLL_INTERVAL_SECONDS);
    }

    Preview inspect(String scanId, UUID userId) {
        Challenge challenge = find(SELECT, scanId);
        challenge.checkMobile(userId);
        return new Preview(challenge.deviceName(), challenge.verificationCode(), challenge.expiresAt().toInstant().toString());
    }

    @Transactional
    public Map<String, Boolean> confirm(String scanId, UUID userId) {
        Challenge challenge = find(SELECT + " FOR UPDATE", scanId);
        challenge.checkMobile(userId);
        if (challenge.userId() == null) {
            db.update("UPDATE device_login_requests SET user_id = ?, status = 'confirmed' WHERE scan_id = ?", userId, scanId);
        }
        return Map.of("ok", true);
    }

    @Transactional
    public Map<String, Object> poll(String scanId, String secretHash, String ip) {
        Challenge challenge = forDevice(scanId, secretHash);
        if (challenge.status().equals("redeemed") || challenge.status().equals("cancelled")) return status(challenge.status());
        if (challenge.expired()) return status("expired");
        if (challenge.userId() == null) return status("pending");

        // Account deletion and token issuance must serialize on the same user row.
        var user = users.findForUpdate(challenge.userId()).orElse(null);
        if (user == null || !"active".equals(user.getStatus())) {
            setStatus(scanId, "cancelled");
            return status("cancelled");
        }
        if (challenge.expired()) return status("expired");
        var result = new LinkedHashMap<>(auth.finishLogin(challenge.userId(), challenge.deviceName(), ip));
        setStatus(scanId, "redeemed");
        result.put("status", "signed_in");
        return result;
    }

    @Transactional
    public Map<String, Object> cancel(String scanId, String secretHash) {
        Challenge challenge = forDevice(scanId, secretHash);
        if (challenge.status().equals("redeemed")) throw BizException.conflict("二维码已使用，请在设备上退出登录");
        if (challenge.status().equals("cancelled")) return status("cancelled");
        if (challenge.expired()) return status("expired");
        setStatus(scanId, "cancelled");
        return status("cancelled");
    }

    @Scheduled(fixedDelay = 60_000)
    void removeExpiredRequests() {
        db.update("DELETE FROM device_login_requests WHERE expires_at <= CURRENT_TIMESTAMP - INTERVAL '10 minutes'");
    }

    private Challenge forDevice(String scanId, String secretHash) {
        return find(SELECT + " AND device_secret_hash = ? FOR UPDATE", scanId, secretHash);
    }

    private Challenge find(String query, Object... arguments) {
        return db.query(query, READ_CHALLENGE, arguments).stream().findFirst()
            .orElseThrow(() -> BizException.notFound("设备登录请求不存在"));
    }

    private void setStatus(String scanId, String status) {
        db.update("UPDATE device_login_requests SET status = ? WHERE scan_id = ?", status, scanId);
    }

    private static Map<String, Object> status(String state) {
        return Map.of("status", state);
    }

    private String randomHex(int byteCount) {
        byte[] bytes = new byte[byteCount];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
