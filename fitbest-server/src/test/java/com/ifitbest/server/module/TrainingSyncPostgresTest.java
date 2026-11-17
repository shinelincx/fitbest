package com.ifitbest.server.module;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.module.admin.AdminService;

/**
 * 用一次性 PostgreSQL 库执行，配置 FITBEST_SYNC_PG_URL、FITBEST_SYNC_PG_USER 和 FITBEST_SYNC_PG_PASSWORD。
 * 主训练端已安装依赖时，设置 FITBEST_SYNC_RUN_CLIENT=true 同时执行前端队列回归。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_PG_URL", matches = ".+")
class TrainingSyncPostgresTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("FITBEST_SYNC_PG_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("FITBEST_SYNC_PG_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("FITBEST_SYNC_PG_PASSWORD"));
        properties.add("fitbest.env", () -> "development");
        properties.add("server.address", () -> "127.0.0.1");
        if (System.getenv("FITBEST_SYNC_WEB_ROOT") != null) {
            properties.add("fitbest.web.root", () -> System.getenv("FITBEST_SYNC_WEB_ROOT"));
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtCodec tokens;
    @Autowired private TestRestTemplate http;
    @Autowired private AdminService admin;
    @Autowired private EntityManagerFactory entityManagers;
    @LocalServerPort private int port;

    private UUID userId;
    private String clientId;
    private String deviceSerial;
    private String token;

    @BeforeEach
    void registerFixture() {
        userId = UUID.randomUUID();
        clientId = UUID.randomUUID().toString();
        deviceSerial = "TEST-" + clientId;
        jdbc.update("insert into users (id, nickname, updated_at) values (?, ?, now())", userId, "同步回归");
        token = tokens.signAccess(userId.toString());
    }

    @AfterEach
    void removeFixture() {
        jdbc.update("delete from sessions where user_id = ?", userId);
        jdbc.update("delete from users where id = ?", userId);
        jdbc.update("delete from devices where serial_no = ?", deviceSerial);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_RUN_CLIENT", matches = "true")
    void offlineClientReplaysIntoOneCompleteDatabaseRow() throws Exception {
        Path client = Path.of("..", "fit-best-trainer").toAbsolutePath().normalize();
        ProcessBuilder test = new ProcessBuilder("node", "node_modules/vitest/vitest.mjs", "run",
            "tests/offline-machine-session.test.ts", "-t", "复网后");
        test.directory(client.toFile()).inheritIO();
        test.environment().put("FITBEST_SYNC_API_URL", "http://127.0.0.1:" + port + "/api/v1");
        test.environment().put("FITBEST_SYNC_ACCESS", token);
        test.environment().put("FITBEST_SYNC_CLIENT_ID", clientId);
        runClient(test);
        var rows = jdbc.queryForList("""
            select idempotency_key, duration_sec, distance_m, calories, avg_speed, cadence, power, avg_hr, target, completed
            from sessions where user_id = ?
            """, userId);
        assertThat(rows).singleElement().satisfies(row -> assertThat(row)
            .containsEntry("idempotency_key", clientId)
            .containsEntry("duration_sec", 390).containsEntry("distance_m", 1600).containsEntry("calories", 97)
            .containsEntry("avg_speed", new BigDecimal("14.8")).containsEntry("cadence", 25)
            .containsEntry("power", 176).containsEntry("avg_hr", 142)
            .containsEntry("target", 2000).containsEntry("completed", false));
    }

    @ParameterizedTest
    @ValueSource(strings = {"hyrox", "btwe"})
    @EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_RUN_CLIENT", matches = "true")
    void offlineRaceClientReplaysCompleteTrainingAndDeviceSegments(String app) throws Exception {
        Path client = Path.of("..", "fit-best-trainer").toAbsolutePath().normalize();
        ProcessBuilder test = new ProcessBuilder("node", "node_modules/vitest/vitest.mjs", "run",
            "tests/race-training-sync.test.ts", "-t", app + ".*断网训练结束");
        test.directory(client.toFile()).inheritIO();
        test.environment().put("FITBEST_SYNC_API_URL", "http://127.0.0.1:" + port + "/api/v1");
        test.environment().put("FITBEST_SYNC_ACCESS", token);
        test.environment().put("FITBEST_RACE_SYNC_APP", app);
        test.environment().put("FITBEST_SYNC_DEVICE_SERIAL", deviceSerial);
        runClient(test);

        boolean hyrox = "hyrox".equals(app);
        int modules = hyrox ? 8 : 4;
        int distance = hyrox ? 8000 : 3200;
        var records = jdbc.queryForList("""
            select id, app, client_key, plan_id, completed, total_time_sec, distance_m, avg_hr, max_hr,
                   module_times::text as module_times, run_splits::text as run_splits
            from training_records where user_id = ?
            """, userId);
        assertThat(records).singleElement().satisfies(row -> assertThat(row)
            .containsEntry("app", app).containsEntry("plan_id", app + "-test-plan")
            .containsEntry("completed", hyrox).containsEntry("total_time_sec", modules * 420)
            .containsEntry("distance_m", distance).containsEntry("avg_hr", 155).containsEntry("max_hr", 170)
            .containsEntry("module_times", "[" + String.join(", ", java.util.Collections.nCopies(modules, "420")) + "]")
            .containsEntry("run_splits", "[" + String.join(", ", java.util.Collections.nCopies(modules, "300")) + "]"));
        var sessions = jdbc.queryForList("""
            select app, client_session_id, training_record_id, duration_sec, distance_m, quality::text, close_reason
            from device_sessions where user_id = ?
            """, userId);
        assertThat(sessions).singleElement().satisfies(row -> assertThat(row)
            .containsEntry("app", app).containsEntry("client_session_id", records.get(0).get("client_key"))
            .containsEntry("training_record_id", records.get(0).get("id"))
            .containsEntry("duration_sec", modules * 420).containsEntry("distance_m", distance)
            .containsEntry("quality", hyrox ? "ok" : "partial").containsEntry("close_reason", hyrox ? "finish" : "abort"));
        var machineTypes = jdbc.queryForList("""
            select coalesce(segment.machine_type, segment.type::text)
            from device_segments segment join device_sessions device on device.id = segment.session_id
            where device.user_id = ? order by segment.seq
            """, String.class, userId);
        var expectedTypes = new java.util.ArrayList<String>();
        for (int i = 0; i < modules; i++) {
            expectedTypes.addAll(hyrox ? List.of("treadmill", "rower") : List.of("treadmill", "bike", "rep"));
        }
        if (hyrox) expectedTypes.add("finish");
        assertThat(machineTypes).containsExactlyElementsOf(expectedTypes);
    }

    private void runClient(ProcessBuilder test) throws Exception {
        Process child = test.start();
        try {
            assertThat(child.waitFor(45, TimeUnit.SECONDS)).isTrue();
            assertThat(child.exitValue()).isZero();
        } finally {
            if (child.isAlive()) child.destroyForcibly();
        }
    }

    @Test
    void exportsEveryFilteredDeviceSessionWithStablePagesAndBoundedQueries() {
        int total = 5_005;
        int pageSize = 500;
        UUID primaryDevice = UUID.randomUUID();
        UUID secondDevice = UUID.randomUUID();
        String secondSerial = "SECOND-" + clientId;
        jdbc.update("insert into devices (id, serial_no, label) values (?, ?, ?), (?, ?, ?)",
            primaryDevice, deviceSerial, "一号手环", secondDevice, secondSerial, "二号手环");
        try {
            jdbc.update("""
                insert into device_sessions (id, user_id, device_id, client_session_id, mode, app, started_at)
                select gen_random_uuid(), ?, case when num % 2 = 0 then ? else ? end, 'export-' || num,
                    'training', 'hyrox', '2026-11-17T03:00:00'
                from generate_series(1, ?) as num
                """, userId, primaryDevice, secondDevice, total);
            jdbc.update("""
                insert into device_segments (id, session_id, seq, type)
                select gen_random_uuid(), s.id, seq, 'station'
                from device_sessions s cross join generate_series(1, 2) as seq
                where s.user_id = ? and s.client_session_id <> 'export-1'
                """, userId);
            jdbc.update("""
                insert into device_sessions (id, user_id, device_id, client_session_id, mode, app, started_at)
                values (gen_random_uuid(), ?, ?, 'different-app', 'training', 'btwe', '2026-11-17T03:00:00')
                """, userId, primaryDevice);
            jdbc.update("""
                insert into device_sessions (id, user_id, device_id, client_session_id, mode, app, started_at)
                values (gen_random_uuid(), ?, ?, 'next-day', 'training', 'hyrox', '2026-11-18T00:00:00'),
                       (gen_random_uuid(), ?, ?, 'previous-day', 'training', 'hyrox', '2026-11-16T23:59:59.999')
                """, userId, primaryDevice, userId, primaryDevice);

            var stats = entityManagers.unwrap(SessionFactory.class).getStatistics();
            boolean previouslyEnabled = stats.isStatisticsEnabled();
            stats.setStatisticsEnabled(true);
            try {
                var superAdmin = new JwtCodec.AdminPayload(UUID.randomUUID().toString(), "super", null, null);
                long start = System.nanoTime();
                long before = stats.getPrepareStatementCount();
                admin.deviceSessions(superAdmin, "hyrox", "training", null, "2026-11-17", "2026-11-17", "1", "20");
                long queriesForList = stats.getPrepareStatementCount() - before;
                var exported = new HashSet<String>();
                long firstPageMillis = 0;
                int maxQueries = 0;
                for (int page = 1; page <= (total + pageSize - 1) / pageSize; page++) {
                    long pageStart = System.nanoTime();
                    before = stats.getPrepareStatementCount();
                    var response = admin.deviceSessions(superAdmin, "hyrox", "training", null,
                        "2026-11-17", "2026-11-17", Integer.toString(page), Integer.toString(pageSize));
                    long queries = stats.getPrepareStatementCount() - before;
                    maxQueries = Math.max(maxQueries, (int) queries);
                    if (page == 1) {
                        firstPageMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - pageStart);
                        assertThat(queries).isEqualTo(queriesForList);
                    }
                    assertThat(queries).isBetween(4L, 5L);
                    assertThat(response.get("total")).isEqualTo((long) total);
                    for (Object item : (List<?>) response.get("items")) {
                        var row = (Map<?, ?>) item;
                        String id = (String) row.get("clientSessionId");
                        int number = Integer.parseInt(id.substring("export-".length()));
                        assertThat(exported.add(id)).isTrue();
                        assertThat(number).isBetween(1, total);
                        assertThat(row.get("segmentCount")).isEqualTo(number == 1 ? 0L : 2L);
                        assertThat(row.get("deviceSerialNo")).isEqualTo(number % 2 == 0 ? deviceSerial : secondSerial);
                        assertThat(row.get("userNickname")).isEqualTo("同步回归");
                        assertThat(row.get("startedAt")).isEqualTo(LocalDateTime.of(2026, 11, 17, 3, 0));
                    }
                }
                assertThat(exported).hasSize(total);
                assertThat(admin.deviceSessions(superAdmin, "hyrox", "training", deviceSerial,
                    "2026-11-17T03:00:00Z", "2026-11-17T03:00:00Z", "1", "20"))
                    .containsEntry("total", (long) total / 2);
                System.out.printf("Admin device export: %,d sessions, %d SQL statements/page max, first page %d ms, total %d ms%n",
                    total, maxQueries, firstPageMillis, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
            } finally {
                stats.setStatisticsEnabled(previouslyEnabled);
            }
        } finally {
            jdbc.update("delete from devices where id = ?", secondDevice);
        }
    }

    @Test
    void simultaneousMachineRetriesReturnTheSameStoredRecord() throws Exception {
        String body = """
            {"machineType":"rower","durationSec":280,"distanceM":1450,"calories":80,
             "startedAt":"2026-11-17T03:00:00Z","endedAt":"2026-11-17T03:04:40Z","completed":false}
            """;
        String path = "/api/v1/sessions";
        var first = CompletableFuture.supplyAsync(() -> post(path, body, clientId));
        var second = CompletableFuture.supplyAsync(() -> post(path, body, clientId));
        assertThat(first.get(15, TimeUnit.SECONDS).get("id")).isEqualTo(second.get(15, TimeUnit.SECONDS).get("id"));
        assertThat(jdbc.queryForObject("select count(*) from sessions where user_id = ?", Long.class, userId)).isEqualTo(1L);
    }

    @Test
    void walksPastFiftySessionsEvenWhenStartTimesAreIdentical() {
        List<UUID> expectedIds = new java.util.ArrayList<>();
        for (int i = 0; i < 53; i++) {
            UUID id = UUID.randomUUID();
            expectedIds.add(id);
            jdbc.update("""
                insert into sessions (id, user_id, machine_type, started_at)
                values (?, ?, 'spin', '2026-11-17T03:00:00')
                """, id, userId);
        }
        var first = exchange("/api/v1/sessions?range=all&limit=50", HttpMethod.GET, null).getBody();
        assertThat(first).isNotNull();
        var firstPage = (List<?>) first.get("items");
        assertThat(firstPage).hasSize(50);
        String cursor = (String) first.get("nextCursor");
        assertThat(cursor).contains("~");
        var second = exchange("/api/v1/sessions?range=all&limit=50&cursor=" + cursor, HttpMethod.GET, null).getBody();
        assertThat(second).isNotNull();
        var secondPage = (List<?>) second.get("items");
        assertThat(secondPage).hasSize(3);
        assertThat(second.get("nextCursor")).isNull();
        var returned = new HashSet<String>();
        for (var row : firstPage) returned.add((String) ((Map<?, ?>) row).get("id"));
        for (var row : secondPage) returned.add((String) ((Map<?, ?>) row).get("id"));
        assertThat(returned).containsExactlyInAnyOrderElementsOf(expectedIds.stream().map(UUID::toString).toList());
        assertThat(exchange("/api/v1/sessions?cursor=invalid", HttpMethod.GET, null).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void deletionSuppressesDelayedRetriesAndExplicitBackupCanRestore() {
        String path = "/api/v1/sessions";
        String body = """
            {"machineType":"elliptical","durationSec":74,"distanceM":640,"calories":11}
            """;
        Map<?, ?> original = post(path, body, clientId);
        assertThat(exchange(path + "?ref=" + original.get("id"), HttpMethod.DELETE, null).getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(exchange(path, HttpMethod.POST, body, clientId).getStatusCode().value()).isEqualTo(410);
        assertThat(jdbc.queryForObject("select count(*) from sessions where user_id = ?", Long.class, userId)).isZero();

        Map<?, ?> restored = post(path + "/restore", body, clientId);
        assertThat(post(path + "/restore", body, clientId).get("id")).isEqualTo(restored.get("id"));
        assertThat(post(path + "/restore", body, (String) restored.get("id")).get("id")).isEqualTo(restored.get("id"));
        assertThat(jdbc.queryForObject("select count(*) from sessions where user_id = ?", Long.class, userId)).isEqualTo(1L);
        post(path, """
            {"machineType":"rep","durationSec":40,"distanceM":0,"calories":3}
            """, "archived-rep");
        var cleared = exchange(path + "/all", HttpMethod.DELETE, """
            {"pendingIds":["still-offline"],"machineTypes":["elliptical"]}
            """);
        assertThat(cleared.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(cleared.getBody().get("deleted")).isEqualTo(1);
        assertThat(exchange(path, HttpMethod.POST, body, clientId).getStatusCode().value()).isEqualTo(410);
        assertThat(exchange(path, HttpMethod.POST, body, "still-offline").getStatusCode().value()).isEqualTo(410);
        assertThat(jdbc.queryForObject("select idempotency_key from sessions where user_id = ?", String.class, userId))
            .isEqualTo("archived-rep");
    }

    @Test
    void repeatedRegistrationAndCancellationAreIdempotent() throws Exception {
        UUID eventId = UUID.randomUUID();
        jdbc.update("insert into event_links (id, title, external_url) values (?, ?, ?)", eventId,
            "报名回归", "https://example.test/event");
        String path = "/api/v1/events/" + eventId + "/registration";
        try {
            var first = CompletableFuture.supplyAsync(() -> post(path, null));
            var second = CompletableFuture.supplyAsync(() -> post(path, null));
            assertThat(first.get(15, TimeUnit.SECONDS).get("id")).isEqualTo(second.get(15, TimeUnit.SECONDS).get("id"));
            assertThat(jdbc.queryForObject("select count(*) from event_registrations where event_id = ?", Long.class, eventId))
                .isEqualTo(1L);
            assertThat(exchange(path, HttpMethod.DELETE, null).getBody().get("registered")).isEqualTo(false);
            assertThat(exchange(path, HttpMethod.DELETE, null).getBody().get("registered")).isEqualTo(false);
        } finally {
            jdbc.update("delete from event_links where id = ?", eventId);
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_WEB_ROOT", matches = ".+")
    void servesBundledSitesFromOneBackend() {
        for (String root : List.of("/fitbest", "/fitbest-hd", "/fit-best", "/hyrox", "/hyrox/HD", "/btwe", "/btwe/HD")) {
            var entry = http.getForEntity(root + "/", String.class);
            assertThat(entry.getStatusCode().is2xxSuccessful()).as(root).isTrue();
            var assets = java.util.regex.Pattern.compile("src=\"(?:\\./|/fit-best/)(assets/[^\"]+\\.js)\"")
                .matcher(entry.getBody());
            assertThat(assets.find()).as(root + " entry script").isTrue();
            assertThat(http.getForEntity(root + "/" + assets.group(1), byte[].class).getStatusCode().is2xxSuccessful())
                .as(root + " entry script").isTrue();
        }
        var website = http.getForEntity("/fitbestwebsite/", String.class);
        assertThat(website.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(website.getBody()).contains(
            "href=\"/fitbest/\"", "href=\"/fitbest-hd/\"", "href=\"/fitbest/#/train/treadmill\"",
            "href=\"/hyrox/#/train\"", "href=\"/btwe/#/train\"",
            "https://apps.apple.com/cn/app/fitbest/id6448613913",
            "https://play.google.com/store/apps/details?id=com.fitbest.www",
            "力量训练记录和智能插销绑定保存在当前设备")
            .doesNotContain("href=\"#\"");
        assertThat(http.getForEntity("/console/", String.class).getBody()).contains("src=\"/fitbest/\"");
    }

    @ParameterizedTest
    @ValueSource(strings = {"app-first", "device-first", "concurrent"})
    void mergesAppAndDeviceUploadsIntoOneTrainingRecord(String order) throws Exception {
        String appBody = """
            {"clientId":"%s","app":"hyrox","planId":"test-plan","completed":false,"totalTimeSec":300,
             "distanceM":3200,"startedAt":"2026-11-17","rpe":7,"moduleTimes":[300],"runSplits":[220]}
            """.formatted(clientId);
        String deviceBody = """
            {"clientSessionId":"%s","device":{"serialNo":"%s","kind":"band"},"app":"hyrox","mode":"training",
             "startedAt":"2026-11-17T03:00:00Z","endedAt":"2026-11-17T03:05:00Z",
             "durationSec":300,"distanceM":1250,"avgHr":146,"maxHr":171,"closeReason":"abort","quality":"partial",
             "segments":[{"seq":1,"type":"treadmill","durationSec":220,"distanceM":1250},
                         {"seq":2,"type":"station","durationSec":80,"distanceM":0}]}
            """.formatted(clientId, deviceSerial);
        String recordsPath = "/api/v1/me/training-records";
        String devicesPath = "/api/v1/me/device-sessions";
        Map<?, ?> summary;
        Map<?, ?> device;
        if ("concurrent".equals(order)) {
            var appResult = CompletableFuture.supplyAsync(() -> post(recordsPath, appBody));
            var deviceResult = CompletableFuture.supplyAsync(() -> post(devicesPath, deviceBody));
            summary = appResult.get(15, TimeUnit.SECONDS);
            device = deviceResult.get(15, TimeUnit.SECONDS);
        } else if ("device-first".equals(order)) {
            device = post(devicesPath, deviceBody);
            summary = post(recordsPath, appBody);
        } else {
            summary = post(recordsPath, appBody);
            device = post(devicesPath, deviceBody);
        }
        Map<?, ?> retryDevice = post(devicesPath, deviceBody);
        assertThat(retryDevice.get("duplicate")).isEqualTo(true);
        assertThat(retryDevice.get("id")).isEqualTo(device.get("id"));
        Map<?, ?> canonical = post(recordsPath, appBody);
        assertThat(canonical.get("id")).isEqualTo(summary.get("id")).isEqualTo(device.get("trainingRecordId"));
        assertThat(canonical.get("distanceM")).isEqualTo(1250);
        assertThat(canonical.get("moduleTimes")).isEqualTo(java.util.List.of(300));
        assertThat(canonical.get("runSplits")).isEqualTo(java.util.List.of(220));
        assertThat(canonical.get("planId")).isEqualTo("test-plan");
        assertThat(canonical.get("rpe")).isEqualTo(7);
        assertThat(canonical.get("avgHr")).isEqualTo(146);
        assertThat(canonical.get("maxHr")).isEqualTo(171);
        assertThat(canonical.get("startedAt")).isEqualTo("2026-11-17T03:00:00.000Z");
        assertThat(jdbc.queryForObject("select count(*) from training_records where user_id = ?", Long.class, userId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from device_sessions where user_id = ?", Long.class, userId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("""
            select count(*) from device_segments join device_sessions on device_segments.session_id = device_sessions.id
            where device_sessions.user_id = ?
            """, Long.class, userId)).isEqualTo(2L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"hyrox", "btwe"})
    void deletesRaceHistoryAndRejectsLateAppAndDeviceUploads(String app) {
        String recordsPath = "/api/v1/me/training-records";
        String devicesPath = "/api/v1/me/device-sessions";
        String appBody = """
            {"app":"%s","clientId":"%s","totalTimeSec":70,"startedAt":"2026-11-17T03:00:00.000Z"}
            """.formatted(app, clientId);
        String deviceBody = """
            {"app":"%s","clientSessionId":"%s","device":{"serialNo":"%s","kind":"band"},"mode":"training",
             "startedAt":"2026-11-17T03:00:00.000Z","durationSec":70,"distanceM":100,"quality":"partial",
             "segments":[{"seq":1,"type":"treadmill","durationSec":70,"distanceM":100}]}
            """.formatted(app, clientId, deviceSerial);
        post(recordsPath, appBody);
        post(devicesPath, deviceBody);
        String deletion = """
            {"app":"%s","clientId":"%s"}
            """.formatted(app, clientId);
        assertThat(post(recordsPath + "/deletions", deletion).get("id")).isEqualTo(clientId);
        assertThat(post(recordsPath + "/deletions", deletion).get("id")).isEqualTo(clientId);
        assertThat(exchange(recordsPath, HttpMethod.POST, appBody).getStatusCode().value()).isEqualTo(410);
        assertThat(exchange(devicesPath, HttpMethod.POST, deviceBody).getStatusCode().value()).isEqualTo(410);
        assertThat(jdbc.queryForObject("select count(*) from training_records where user_id = ?", Long.class, userId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from device_sessions where user_id = ?", Long.class, userId)).isZero();

        String offline = clientId + "-offline";
        post(recordsPath + "/deletions", deletion.replace(clientId, offline));
        assertThat(exchange(devicesPath, HttpMethod.POST, deviceBody.replace(clientId, offline)).getStatusCode().value())
            .isEqualTo(410);
        assertThat(jdbc.queryForObject("select count(*) from training_records where user_id = ?", Long.class, userId)).isZero();
    }

    @Test
    void pagesAllRaceRecordsWithIdenticalCreatedAtAndKeepsOtherAppsOut() {
        jdbc.update("""
            insert into training_records (id, user_id, app, created_at, total_time_sec)
            select gen_random_uuid(), ?, 'hyrox', '2026-11-17T03:00:00', 80 from generate_series(1, 203)
            """, userId);
        jdbc.update("""
            insert into training_records (id, user_id, app, total_time_sec) values (gen_random_uuid(), ?, 'btwe', 90)
            """, userId);
        String path = "/api/v1/me/training-records/page?app=hyrox&limit=100";
        var seen = new HashSet<>();
        String cursor = "";
        int pages = 0;
        do {
            var result = exchange(path + (cursor.isEmpty() ? "" : "&cursor=" + cursor), HttpMethod.GET, null);
            assertThat(result.getStatusCode().is2xxSuccessful()).isTrue();
            for (Object item : (List<?>) result.getBody().get("items")) {
                var row = (Map<?, ?>) item;
                assertThat(row.get("app")).isEqualTo("hyrox");
                assertThat(seen.add(row.get("id"))).isTrue();
            }
            cursor = (String) result.getBody().get("nextCursor");
            pages++;
            assertThat(pages).isLessThanOrEqualTo(3);
        } while (!cursor.isEmpty());
        assertThat(seen).hasSize(203);
    }

    @Test
    void administratorLoginReadWriteAndViewerPermissions() {
        UUID orgId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID viewerId = UUID.randomUUID();
        String suffix = orgId.toString().substring(0, 8);
        String password = "test-password";
        String hash = new BCryptPasswordEncoder().encode(password);
        jdbc.update("insert into orgs (id, name, code) values (?, ?, ?)", orgId, "测试组织", "test-" + suffix);
        jdbc.update("""
            insert into admin_users (id, org_id, name, phone, password_hash, role)
            values (?, ?, ?, ?, ?, 'super'), (?, ?, ?, ?, ?, 'viewer')
            """, adminId, orgId, "测试管理员", "admin-" + suffix, hash,
            viewerId, orgId, "测试只读", "viewer-" + suffix, hash);
        try {
            String adminToken = adminLogin("admin-" + suffix, password);
            for (String path : List.of("overview", "users", "sessions", "training-records",
                    "device-sessions", "machines", "machine-models", "gyms", "event-links",
                    "event-registrations", "audit-logs")) {
                assertThat(adminExchange(adminToken, HttpMethod.GET, "/api/v1/admin/" + path, null)
                    .getStatusCode().is2xxSuccessful()).as(path).isTrue();
            }
            String body = """
                {"title":"测试赛事","externalUrl":"https://example.test/event","status":"draft"}
                """;
            var created = adminExchange(adminToken, HttpMethod.POST, "/api/v1/admin/event-links", body);
            assertThat(created.getStatusCode().is2xxSuccessful()).as("create event").isTrue();
            String eventId = (String) ((Map<?, ?>) created.getBody()).get("id");
            assertThat(adminExchange(adminToken, HttpMethod.PATCH, "/api/v1/admin/event-links/" + eventId,
                "{\"title\":\"更新赛事\"}").getStatusCode().is2xxSuccessful()).isTrue();

            String viewerToken = adminLogin("viewer-" + suffix, password);
            assertThat(adminExchange(viewerToken, HttpMethod.GET, "/api/v1/admin/event-links", null)
                .getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(adminExchange(viewerToken, HttpMethod.DELETE, "/api/v1/admin/event-links/" + eventId, null)
                .getStatusCode().value()).isEqualTo(403);
            assertThat(adminExchange(adminToken, HttpMethod.DELETE, "/api/v1/admin/event-links/" + eventId, null)
                .getStatusCode().is2xxSuccessful()).isTrue();
        } finally {
            jdbc.update("delete from audit_logs where org_id = ?", orgId);
            jdbc.update("delete from event_links where org_id = ?", orgId);
            jdbc.update("delete from admin_users where org_id = ?", orgId);
            jdbc.update("delete from orgs where id = ?", orgId);
        }
    }

    private String adminLogin(String phone, String password) {
        var response = http.postForEntity("/api/v1/admin/auth/login",
            Map.of("phone", phone, "password", password), Map.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        return (String) response.getBody().get("token");
    }

    private org.springframework.http.ResponseEntity<Object> adminExchange(
        String adminToken, HttpMethod method, String path, String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(adminToken);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return http.exchange(path, method, new HttpEntity<>(body, headers), Object.class);
    }

    private Map<?, ?> post(String path, String body) {
        return post(path, body, null);
    }

    private Map<?, ?> post(String path, String body, String idempotencyKey) {
        var response = exchange(path, HttpMethod.POST, body, idempotencyKey);
        assertThat(response.getStatusCode().is2xxSuccessful()).as("%s: %s", path, response.getBody()).isTrue();
        return response.getBody();
    }

    private org.springframework.http.ResponseEntity<Map> exchange(String path, HttpMethod method, String body) {
        return exchange(path, method, body, null);
    }

    private org.springframework.http.ResponseEntity<Map> exchange(String path, HttpMethod method, String body, String idempotencyKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (idempotencyKey != null) headers.set("Idempotency-Key", idempotencyKey);
        return http.exchange(path, method, new HttpEntity<>(body, headers), Map.class);
    }
}
