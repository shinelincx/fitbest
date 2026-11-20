package com.ifitbest.server.module;

import static org.assertj.core.api.Assertions.assertThat;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_PG_URL", matches = ".+")
@EnabledIfEnvironmentVariable(named = "FITBEST_FEEDBACK_REDIS_URL", matches = ".+")
class FeedbackPostgresTest {
    @DynamicPropertySource
    static void isolate(DynamicPropertyRegistry config) {
        config.add("spring.datasource.url", () -> System.getenv("FITBEST_SYNC_PG_URL"));
        config.add("spring.datasource.username", () -> System.getenv("FITBEST_SYNC_PG_USER"));
        config.add("spring.datasource.password", () -> System.getenv("FITBEST_SYNC_PG_PASSWORD"));
        config.add("spring.data.redis.url", () -> System.getenv("FITBEST_FEEDBACK_REDIS_URL"));
        config.add("server.address", () -> "127.0.0.1");
        config.add("fitbest.feedback.trusted-proxies", () -> "127.0.0.1");
    }

    @Autowired JdbcTemplate db;
    @Autowired JwtCodec jwt;
    @Autowired TestRestTemplate http;

    private final UUID user = UUID.randomUUID();
    private final UUID org = UUID.randomUUID();
    private final UUID superId = UUID.randomUUID();
    private final UUID viewerId = UUID.randomUUID();
    private final UUID orgAdminId = UUID.randomUUID();
    private final UUID gym = UUID.randomUUID();
    private final List<UUID> keys = new ArrayList<>();
    private String userToken;
    private String superToken;
    private String viewerToken;
    private String clientIp;
    private byte[] png;

    @BeforeEach
    void seed() throws Exception {
        db.update("INSERT INTO users (id,nickname,updated_at) VALUES (?, 'Feedback test', now())", user);
        db.update("INSERT INTO orgs (id,name,code) VALUES (?, 'Feedback test', ?)", org, org.toString());
        superToken = admin(superId, "super");
        viewerToken = admin(viewerId, "viewer");
        userToken = jwt.signAccess(user.toString());
        clientIp = "2001:db8:" + org.toString().substring(0,4) + ":" + org.toString().substring(4,8) + "::1";
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", bytes);
        png = bytes.toByteArray();
    }

    @AfterEach
    void cleanup() {
        for (UUID key : keys) db.update("DELETE FROM feedback WHERE idempotency_key = ?", key);
        db.update("DELETE FROM audit_logs WHERE admin_id IN (?, ?, ?)", superId, viewerId, orgAdminId);
        db.update("DELETE FROM admin_users WHERE id IN (?, ?, ?)", superId, viewerId, orgAdminId);
        db.update("DELETE FROM gyms WHERE id = ?", gym);
        db.update("DELETE FROM orgs WHERE id = ?", org);
        db.update("DELETE FROM users WHERE id = ?", user);
    }

    @Test
    void menuGrantAllowsViewingAndHandlingAndRevocationInvalidatesSession() {
        db.update("INSERT INTO gyms (id, org_id, name, code) VALUES (?, ?, 'Feedback test', ?)", gym, org, gym.toString());
        String orgAdminToken = admin(orgAdminId, "org_admin");
        var account = new java.util.HashMap<String, Object>(Map.of("name", "Feedback test", "phone", "199"
            + "%08d".formatted(Math.floorMod(viewerId.hashCode(), 100_000_000)), "role", "viewer", "orgId", org,
            "gymId", gym, "feedbackManager", true));
        String collection = "/api/v1/admin/feedback";
        var receipt = submit("hyrox", "菜单权限访客测试", null, key(), png);
        assertThat(receipt.getStatusCode().value()).isEqualTo(200);
        String path = collection + "/" + receipt.getBody().get("id");
        assertThat(adminGet(collection, viewerToken, Map.class).getStatusCode().value()).isEqualTo(403);
        assertThat(updateViewer(orgAdminToken, account).getStatusCode().value()).isEqualTo(403);
        assertThat(updateViewer(superToken, account).getBody().get("feedbackManager")).isEqualTo(true);
        assertThat(adminGet(collection, viewerToken, Map.class).getStatusCode().value()).isEqualTo(401);

        String granted = viewerSession();
        account.remove("feedbackManager");
        assertThat(updateViewer(superToken, account).getBody().get("feedbackManager")).isEqualTo(true);
        assertThat(adminGet(collection, granted, Map.class).getBody().get("canWrite")).isEqualTo(true);
        var detail = adminGet(path, granted, Map.class).getBody();
        assertThat(detail.get("canWrite")).isEqualTo(true);
        String image = path + "/attachments/" + ((List<?>) detail.get("attachments")).get(0);
        assertThat(adminGet(image, granted, byte[].class).getBody()).isEqualTo(png);
        assertThat(action(path, granted, 0, "start").getStatusCode().value()).isEqualTo(200);
        assertThat(updateViewer(granted, account).getStatusCode().value()).isEqualTo(403);
        assertThat(updateViewer(orgAdminToken, account).getStatusCode().value()).isEqualTo(404);

        account.put("feedbackManager", false);
        assertThat(updateViewer(superToken, account).getBody().get("feedbackManager")).isEqualTo(false);
        assertThat(adminGet(image, granted, byte[].class).getStatusCode().value()).isEqualTo(401);
        String revoked = viewerSession();
        assertThat(adminGet(path, revoked, Map.class).getStatusCode().value()).isEqualTo(403);
        assertThat(action(path, revoked, 1, "resolve").getStatusCode().value()).isEqualTo(403);
        assertThat(db.queryForObject("""
            SELECT count(*) FROM audit_logs WHERE admin_id = ? AND target_id = ?
              AND action = 'account.update'
              AND payload::jsonb->'changes'->'before'->>'feedbackManager'
                  <> payload::jsonb->'changes'->'after'->>'feedbackManager'
            """, Long.class, superId, viewerId.toString())).isEqualTo(2L);
    }

    private ResponseEntity<Map> updateViewer(String token, Map<String, Object> values) {
        return http.exchange("/api/v1/admin/system/accounts/" + viewerId, HttpMethod.PUT,
            new HttpEntity<>(values, headers(token)), Map.class);
    }

    private String viewerSession() {
        long version = db.queryForObject("SELECT session_version FROM admin_users WHERE id = ?", Long.class, viewerId);
        return jwt.signAdmin(new AdminPayload(viewerId.toString(), "viewer", org.toString(), gym.toString(), version));
    }

    @Test
    void crossSourceReceiptsFiltersAccessAndConflicts() throws Exception {
        for (String source : List.of("fitbest", "hyrox", "btwe")) {
            for (String token : new String[]{null, userToken}) {
                var receipt = submit(source, "  隔离测试反馈  ", token, key(), png);
                assertThat(receipt.getStatusCode().value()).isEqualTo(200);
                assertUtc(receipt.getBody().get("createdAt"));
                String path = "/api/v1/admin/feedback/" + receipt.getBody().get("id");
                var detail = adminGet(path, superToken, Map.class);
                assertThat(detail.getStatusCode().value()).isEqualTo(200);
                Map<?, ?> feedback = (Map<?, ?>) detail.getBody().get("feedback");
                assertThat(feedback.get("source")).isEqualTo(source);
                assertThat(feedback.get("submitterId")).isEqualTo(token == null ? null : user.toString());
                assertUtc(feedback.get("createdAt"));

                String image = path + "/attachments/" + ((List<?>) detail.getBody().get("attachments")).get(0);
                assertThat(adminGet(image, superToken, byte[].class).getBody()).isEqualTo(png);
                assertThat(adminGet(path, viewerToken, Map.class).getStatusCode().value()).isEqualTo(403);
                assertThat(adminGet(image, viewerToken, byte[].class).getStatusCode().value()).isEqualTo(403);
                assertThat(adminGet(image, null, byte[].class).getStatusCode().value()).isEqualTo(401);
                assertThat(action(path, viewerToken, 0, "start").getStatusCode().value()).isEqualTo(403);

                var first = CompletableFuture.supplyAsync(() -> action(path, superToken, 0, "start"));
                var second = CompletableFuture.supplyAsync(() -> action(path, superToken, 0, "start"));
                assertThat(List.of(first.get(20, TimeUnit.SECONDS).getStatusCode().value(),
                    second.get(20, TimeUnit.SECONDS).getStatusCode().value())).containsExactlyInAnyOrder(200, 409);
                assertThat(action(path, superToken, 1, "resolve").getStatusCode().value()).isEqualTo(200);
                assertThat(action(path, superToken, 2, "reopen").getStatusCode().value()).isEqualTo(200);
                assertThat(action(path, superToken, 3, "note").getStatusCode().value()).isEqualTo(200);
                var history = (List<?>) adminGet(path, superToken, Map.class).getBody().get("history");
                assertThat(history).hasSize(4);
                Map<?, ?> last = (Map<?, ?>) history.get(3);
                assertUtc(last.get("createdAt"));
                assertThat(last.get("actorId")).isEqualTo(superId.toString());
                assertThat(last.get("fromStatus")).isEqualTo(last.get("toStatus"));
            }
        }
        var list = adminGet("/api/v1/admin/feedback?source=btwe&status=pending&from=2000-01-01T00:00:00Z"
            + "&to=2099-01-01T00:00:00Z&page=2&size=1", superToken, Map.class);
        assertThat(list.getStatusCode().value()).isEqualTo(200);
        assertThat((List<?>) list.getBody().get("items")).hasSize(1);
    }

    @Test
    void guestRetriesCountBeforeIdempotencyAndConcurrentWritesAreAtomic() throws Exception {
        UUID guestKey = key();
        Map<?, ?> original = submit("fitbest", "限频测试资料", null, guestKey, png).getBody();
        assertUtc(original.get("createdAt"));
        for (int i = 2; i <= 5; i++) {
            var retry = submit("fitbest", "限频测试资料", null, guestKey, png);
            assertThat(retry.getStatusCode().value()).isEqualTo(200);
            assertThat(retry.getBody()).isEqualTo(original);
        }
        assertThat(submit("fitbest", "限频测试资料", null, guestKey, png).getStatusCode().value()).isEqualTo(429);
        assertSingleAttachment(guestKey);
        for (String source : List.of("fitbest", "hyrox", "btwe")) {
            UUID concurrentKey = key();
            var first = CompletableFuture.supplyAsync(() -> submit(source, "并发测试资料", userToken, concurrentKey, png));
            var second = CompletableFuture.supplyAsync(() -> submit(source, "并发测试资料", userToken, concurrentKey, png));
            var saved = first.get(20, TimeUnit.SECONDS);
            assertThat(saved.getStatusCode().value()).isEqualTo(200);
            var retried = second.get(20, TimeUnit.SECONDS);
            assertThat(retried.getStatusCode().value()).isEqualTo(200);
            assertThat(retried.getBody()).isEqualTo(saved.getBody());
            assertSingleAttachment(concurrentKey);
        }
    }

    @Test
    void rejectsInvalidUploadsAndRollsBackAnAttachmentFailure() {
        assertThat(submit("btwe", "  一二三四  ", userToken, key()).getStatusCode().value()).isEqualTo(400);
        assertThat(submit("btwe", "测".repeat(2001), userToken, key()).getStatusCode().value()).isEqualTo(400);
        assertThat(submit("btwe", "一二三四五", userToken, key()).getStatusCode().value()).isEqualTo(200);
        assertThat(submit("btwe", "测".repeat(2000), userToken, key()).getStatusCode().value()).isEqualTo(200);
        assertThat(submit("btwe", "伪装图片测试", userToken, key(), new byte[100]).getStatusCode().value()).isEqualTo(400);
        assertThat(submit("btwe", "单张大小边界", userToken, key(), pngAtLimit()).getStatusCode().value())
            .isEqualTo(200);
        assertThat(submit("btwe", "四张图片测试", userToken, key(), png, png, png, png).getStatusCode().value())
            .isEqualTo(400);
        assertThat(submit("btwe", "单张过大测试", userToken, key(), new byte[5 * 1024 * 1024 + 1])
            .getStatusCode().value()).isEqualTo(413);
        byte[] fourMiB = new byte[4 * 1024 * 1024];
        var oversized = submit("btwe", "整体过大测试", userToken, key(), fourMiB, fourMiB, fourMiB, fourMiB);
        assertThat(oversized.getStatusCode().value()).isEqualTo(413);
        assertThat(oversized.getBody().get("code")).isEqualTo(413);

        UUID failing = key();
        db.execute("""
            CREATE FUNCTION feedback_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF EXISTS (SELECT 1 FROM feedback WHERE id = NEW.feedback_id
                         AND idempotency_key = '%s'::uuid) AND NEW.position = 1 THEN
                RAISE EXCEPTION 'isolated feedback test';
              END IF;
              RETURN NEW;
            END; $$
            """.formatted(failing));
        db.execute("""
            CREATE TRIGGER feedback_test_reject BEFORE INSERT ON feedback_attachments
            FOR EACH ROW EXECUTE FUNCTION feedback_test_reject()
            """);
        try {
            assertThat(submit("btwe", "附件回滚测试", userToken, failing, png, png)
                .getStatusCode().value()).isEqualTo(500);
            assertThat(db.queryForObject("SELECT count(*) FROM feedback WHERE idempotency_key = ?", Long.class, failing))
                .isZero();
        } finally {
            db.execute("DROP TRIGGER feedback_test_reject ON feedback_attachments");
            db.execute("DROP FUNCTION feedback_test_reject()");
        }
        assertThat(submit("btwe", "附件回滚测试", userToken, failing, png).getStatusCode().value()).isEqualTo(200);
        assertSingleAttachment(failing);
    }

    private byte[] pngAtLimit() {
        // Add a standard ancillary PNG chunk before IEND, with a valid checksum.
        byte[] data = new byte[5 * 1024 * 1024 - png.length - 12];
        byte[] chunk = "raNd".getBytes(StandardCharsets.US_ASCII);
        var crc = new CRC32();
        crc.update(chunk);
        crc.update(data);
        int end = png.length - 12;
        return ByteBuffer.allocate(5 * 1024 * 1024).put(png, 0, end)
            .putInt(data.length).put(chunk).put(data).putInt((int) crc.getValue()).put(png, end, 12).array();
    }

    private void assertSingleAttachment(UUID key) {
        assertThat(db.queryForObject("SELECT count(*) FROM feedback WHERE idempotency_key = ?", Long.class, key))
            .isEqualTo(1L);
        assertThat(db.queryForObject("""
            SELECT count(*) FROM feedback_attachments a JOIN feedback f ON a.feedback_id = f.id
            WHERE f.idempotency_key = ?
            """, Long.class, key)).isEqualTo(1L);
    }

    private static void assertUtc(Object value) {
        assertThat(value).isInstanceOf(String.class);
        assertThat((String) value).endsWith("Z");
        assertThat(Instant.parse((String) value)).isNotNull();
    }

    private UUID key() {
        UUID key = UUID.randomUUID();
        keys.add(key);
        return key;
    }

    private String admin(UUID id, String role) {
        db.update("""
            INSERT INTO admin_users (id, org_id, name, phone, password_hash, role)
            VALUES (?, ?, ?, ?, 'fixture', CAST(? AS "AdminRole"))
            """, id, org, role, id.toString(), role);
        return jwt.signAdmin(new AdminPayload(id.toString(), role, org.toString(), null, 0));
    }

    private ResponseEntity<Map> submit(String source, String text, String token, UUID key, byte[]... files) {
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("source", source);
        HttpHeaders utf8 = new HttpHeaders();
        utf8.setContentType(new MediaType("text", "plain", StandardCharsets.UTF_8));
        form.add("text", new HttpEntity<>(text, utf8));
        for (byte[] file : files) {
            form.add("images", new ByteArrayResource(file) {
                @Override public String getFilename() { return "image.png"; }
            });
        }
        HttpHeaders headers = headers(token);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.set("Idempotency-Key", key.toString());
        headers.set("X-Fitbest-Client-IP", clientIp);
        return http.exchange("/api/v1/feedback", HttpMethod.POST, new HttpEntity<>(form, headers), Map.class);
    }

    private ResponseEntity<Map> action(String path, String token, long version, String action) {
        return http.exchange(path + "/actions", HttpMethod.POST,
            new HttpEntity<>(Map.of("version", version, "action", action, "note", "隔离备注"), headers(token)), Map.class);
    }

    private <T> ResponseEntity<T> adminGet(String path, String token, Class<T> type) {
        return http.exchange(path, HttpMethod.GET, new HttpEntity<>(headers(token)), type);
    }

    private HttpHeaders headers(String token) {
        var headers = new HttpHeaders();
        if (token != null) headers.setBearerAuth(token);
        return headers;
    }
}
