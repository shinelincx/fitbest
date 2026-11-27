package com.ifitbest.server.module.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_PG_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "FITBEST_FEEDBACK_REDIS_URL", matches = ".+")
class DeviceLoginPostgresTest {
    private static final String AUTH = "/api/v1/auth";
    private static final String DEVICE = AUTH + "/device-login";
    private static final String PASSWORD = "Test-password-123";

    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry config) {
        config.add("spring.datasource.url", () -> System.getenv("FITBEST_SYNC_PG_URL"));
        config.add("spring.datasource.username", () -> System.getenv("FITBEST_SYNC_PG_USER"));
        config.add("spring.datasource.password", () -> System.getenv("FITBEST_SYNC_PG_PASSWORD"));
        config.add("spring.data.redis.url", () -> System.getenv("FITBEST_FEEDBACK_REDIS_URL"));
    }

    @Autowired JdbcTemplate db;
    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    private final UUID user = UUID.randomUUID();
    private final UUID other = UUID.randomUUID();

    @BeforeEach
    void seedAccount() {
        seedAccount(user);
    }

    private void seedAccount(UUID id) {
        db.update("INSERT INTO users (id,nickname,updated_at) VALUES (?, 'Device login QA', now())", id);
        db.update("INSERT INTO user_identities (id,user_id,type,identifier,created_at) VALUES (?,?,'email',?,now())",
            UUID.randomUUID(), id, id + "@example.test");
        db.update("INSERT INTO user_credentials (user_id,password_hash,updated_at) VALUES (?,?,now())",
            id, new BCryptPasswordEncoder().encode(PASSWORD));
    }

    @AfterEach
    void cleanup() {
        db.update("DELETE FROM users WHERE id IN (?, ?)", user, other);
    }

    @Test
    void deviceSignsInWithIndependentSessionAfterMobileConfirms() throws Exception {
        JsonNode mobile = signIn(user);
        String bearer = mobile.path("accessToken").asText();

        Instant beforeStart = Instant.now();
        var start = post(DEVICE + "/start", Map.of("deviceName", "QA 划船机"), null);
        JsonNode challenge = ok(start);
        assertThat(start.getHeaders().getCacheControl()).contains("no-store");
        assertThat(Instant.parse(challenge.path("expiresAt").asText())).isBetween(beforeStart.plusSeconds(89), Instant.now().plusSeconds(91));
        assertThat(challenge.path("pollIntervalSeconds").asInt()).isEqualTo(3);
        String scanId = challenge.path("scanId").asText();
        String secret = challenge.path("deviceSecret").asText();
        assertThat(secret).isNotBlank().isNotEqualTo(scanId);
        JsonNode qr = json.readTree(challenge.path("qrPayload").asText());
        assertThat(qr).isEqualTo(json.valueToTree(Map.of("type", "fitbest.device-login", "version", 1, "scanId", scanId)));
        var mobileBody = Map.of("scanId", scanId);
        var deviceBody = Map.of("scanId", scanId, "deviceSecret", secret);

        assertThat(post(DEVICE + "/confirm", mobileBody, null).getStatusCode().value()).isEqualTo(401);
        assertThat(ok(post(DEVICE + "/poll", deviceBody, null)).path("status").asText()).isEqualTo("pending");
        JsonNode preview = ok(post(DEVICE + "/inspect", mobileBody, bearer));
        assertThat(preview.path("deviceName").asText()).isEqualTo("QA 划船机");
        assertThat(preview.path("verificationCode").asText()).isEqualTo(challenge.path("verificationCode").asText());
        ok(post(DEVICE + "/confirm", mobileBody, bearer));

        var claimed = post(DEVICE + "/poll", deviceBody, null);
        JsonNode login = ok(claimed);
        assertThat(claimed.getHeaders().getCacheControl()).contains("no-store");
        assertThat(login.path("status").asText()).isEqualTo("signed_in");
        String accessToken = login.path("accessToken").asText();
        assertThat(account(accessToken).path("id").asText()).isEqualTo(user.toString());
        String deviceRefresh = login.path("refreshToken").asText();
        assertThat(deviceRefresh).isNotEqualTo(mobile.path("refreshToken").asText());
        JsonNode refreshed = ok(post(AUTH + "/refresh", Map.of("refreshToken", deviceRefresh), null));
        assertThat(account(refreshed.path("accessToken").asText()).path("id").asText()).isEqualTo(user.toString());
        var latest = Map.of("refreshToken", refreshed.path("refreshToken").asText());
        ok(post(AUTH + "/logout", latest, accessToken));
        assertThat(post(AUTH + "/refresh", latest, null).getStatusCode().value()).isEqualTo(401);
        ok(post(AUTH + "/refresh", Map.of("refreshToken", mobile.path("refreshToken").asText()), null));
    }

    @Test
    void onlyTheFirstMobileAccountAndFirstDeviceClaimWin() throws Exception {
        seedAccount(other);
        String phone = signIn(user).path("accessToken").asText();
        String otherPhone = signIn(other).path("accessToken").asText();
        var device = newChallenge();
        var scan = Map.of("scanId", device.get("scanId"));
        assertThat(post(DEVICE + "/poll", scan, null).getStatusCode().value()).isEqualTo(404);
        assertThat(post(DEVICE + "/poll", Map.of("scanId", device.get("scanId"), "deviceSecret", "0".repeat(64)), null)
            .getStatusCode().value()).isEqualTo(404);

        var confirm = CompletableFuture.supplyAsync(() -> post(DEVICE + "/confirm", scan, phone));
        var second = post(DEVICE + "/confirm", scan, otherPhone);
        var first = confirm.get(10, TimeUnit.SECONDS);
        assertThat(new Integer[]{first.getStatusCode().value(), second.getStatusCode().value()})
            .containsExactlyInAnyOrder(200, 409);
        boolean firstWon = first.getStatusCode().value() == 200;
        ok(post(DEVICE + "/confirm", scan, firstWon ? phone : otherPhone));

        var parallelPoll = CompletableFuture.supplyAsync(() -> post(DEVICE + "/poll", device, null));
        var one = ok(post(DEVICE + "/poll", device, null));
        var two = ok(parallelPoll.get(10, TimeUnit.SECONDS));
        assertThat(new String[]{one.path("status").asText(), two.path("status").asText()})
            .containsExactlyInAnyOrder("signed_in", "redeemed");
        var successful = one.path("status").asText().equals("signed_in") ? one : two;
        assertThat(account(successful.path("accessToken").asText()).path("id").asText())
            .isEqualTo((firstWon ? user : other).toString());
        assertThat(post(DEVICE + "/confirm", scan, phone).getStatusCode().value()).isEqualTo(409);
    }

    @Test
    void cancelledOrExpiredRequestsCannotBeConfirmedOrClaimed() {
        String phone = signIn(user).path("accessToken").asText();
        var cancelled = newChallenge();
        var cancelledScan = Map.of("scanId", cancelled.get("scanId"));
        ok(post(DEVICE + "/confirm", cancelledScan, phone));
        assertStatus("/cancel", cancelled, "cancelled");
        assertStatus("/cancel", cancelled, "cancelled");
        assertStatus("/poll", cancelled, "cancelled");
        assertThat(post(DEVICE + "/confirm", cancelledScan, phone).getStatusCode().value()).isEqualTo(410);

        var expired = newChallenge();
        db.update("UPDATE device_login_requests SET expires_at = now() - interval '1 second' WHERE scan_id = ?",
            expired.get("scanId"));
        var expiredScan = Map.of("scanId", expired.get("scanId"));
        assertThat(post(DEVICE + "/inspect", expiredScan, phone).getStatusCode().value()).isEqualTo(410);
        assertThat(post(DEVICE + "/confirm", expiredScan, phone).getStatusCode().value()).isEqualTo(410);
        assertStatus("/poll", expired, "expired");
    }

    @Test
    void devicePollingReturnsRetryAfterWhenCalledTooFrequently() {
        var device = newChallenge();
        for (int i = 0; i < 3; i++) assertStatus("/poll", device, "pending");
        var throttled = post(DEVICE + "/poll", device, null);
        assertThat(throttled.getStatusCode().value()).isEqualTo(429);
        assertThat(throttled.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).matches("[1-3]");
    }

    @Test
    void confirmedRequestIsCancelledWhenItsAccountIsDeletedBeforeClaim() {
        String phone = signIn(user).path("accessToken").asText();
        var device = newChallenge();
        ok(post(DEVICE + "/confirm", Map.of("scanId", device.get("scanId")), phone));
        ok(http.exchange("/api/v1/me", HttpMethod.DELETE, new HttpEntity<>(Map.of("password", PASSWORD), headers(phone)),
            JsonNode.class));
        assertStatus("/poll", device, "cancelled");
    }

    @Test
    void failedSessionWriteLeavesConfirmedQrAvailableForRetry() {
        String phone = signIn(user).path("accessToken").asText();
        var device = newChallenge();
        ok(post(DEVICE + "/confirm", Map.of("scanId", device.get("scanId")), phone));
        db.execute("ALTER TABLE user_sessions ADD CONSTRAINT device_login_test_fail_session "
            + "CHECK (user_id <> '%s') NOT VALID".formatted(user));
        try {
            assertThat(post(DEVICE + "/poll", device, null).getStatusCode().value()).isEqualTo(500);
        } finally {
            db.execute("ALTER TABLE user_sessions DROP CONSTRAINT device_login_test_fail_session");
        }
        assertStatus("/poll", device, "signed_in");
    }

    private JsonNode signIn(UUID id) {
        return ok(post(AUTH + "/password/login", Map.of("account", id + "@example.test", "password", PASSWORD), null));
    }

    private Map<String, String> newChallenge() {
        JsonNode start = ok(post(DEVICE + "/start", Map.of(), null));
        return Map.of("scanId", start.path("scanId").asText(), "deviceSecret", start.path("deviceSecret").asText());
    }

    private void assertStatus(String path, Map<String, String> device, String expected) {
        assertThat(ok(post(DEVICE + path, device, null)).path("status").asText()).isEqualTo(expected);
    }

    private JsonNode account(String accessToken) {
        return ok(http.exchange("/api/v1/me", HttpMethod.GET, new HttpEntity<>(headers(accessToken)), JsonNode.class));
    }

    private ResponseEntity<JsonNode> post(String path, Object body, String bearer) {
        return http.postForEntity(path, new HttpEntity<>(body, headers(bearer)), JsonNode.class);
    }

    private static HttpHeaders headers(String bearer) {
        var headers = new HttpHeaders();
        if (bearer != null) headers.setBearerAuth(bearer);
        return headers;
    }

    private static JsonNode ok(ResponseEntity<JsonNode> response) {
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNotNull();
        return response.getBody();
    }
}
