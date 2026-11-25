package com.ifitbest.server.module;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_PG_URL", matches = ".+")
class MachineNavigationPostgresTest {
    private static final String PUBLIC = "/api/v1/machine-navigation";
    private static final String ADMIN = "/api/v1/admin/system/machine-navigation";

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> System.getenv("FITBEST_SYNC_PG_URL"));
        properties.add("spring.datasource.username", () -> System.getenv("FITBEST_SYNC_PG_USER"));
        properties.add("spring.datasource.password", () -> System.getenv("FITBEST_SYNC_PG_PASSWORD"));
    }

    @Autowired JdbcTemplate db;
    @Autowired JwtCodec jwt;
    @Autowired TestRestTemplate http;

    @Test
    void seededConfigIsPublicAndPlatformUpdatesAreValidatedAuditedAndVisibleOnRefresh() {
        String original = db.queryForObject("select config::text from machine_navigation where id = 1", String.class);
        UUID org = UUID.randomUUID();
        UUID platformId = UUID.randomUUID();
        UUID orgAdminId = UUID.randomUUID();
        db.update("insert into orgs (id, name, code) values (?, 'Navigation test', ?)", org, org.toString());
        try {
            String platform = admin(org, platformId, "super");
            String orgAdmin = admin(org, orgAdminId, "org_admin");
            var initial = http.getForEntity(PUBLIC, JsonNode.class);
            assertThat(initial.getStatusCode().value()).isEqualTo(200);
            assertThat(initial.getHeaders().getCacheControl()).isEqualTo("no-cache");
            var body = initial.getBody();
            assertThat(body.path("machineTypes").size()).isEqualTo(8);
            assertThat(body.at("/machineTypes/0/names/en").asText()).isEqualTo("Treadmill");
            assertThat(body.at("/bleRules/0/patterns/0").asText()).isEqualTo("YJ01-S7Pro-000007");
            assertThat(body.at("/bleRules/0/preferredProtocol").asText()).isEqualTo("PRIVATE");
            assertThat(body.at("/bleRules/1/machineType").asText()).isEqualTo("ski");
            assertThat(body.at("/bleRules/1/id").isMissingNode()).isTrue();
            int patterns = 0;
            for (var rule : body.path("bleRules")) {
                int size = rule.path("patterns").size();
                assertThat(size).isBetween(1, 100);
                patterns += size;
            }
            assertThat(patterns).isEqualTo(1185);
            assertThat(body.path("resistanceDisabledPatterns").size()).isEqualTo(15);
            assertThat(db.queryForObject("select count(*) from legacy_machine_navigation_rules", Integer.class)).isEqualTo(1361);
            assertThat(http.getForEntity(ADMIN, JsonNode.class).getStatusCode().value()).isEqualTo(401);
            assertThat(request(HttpMethod.GET, ADMIN, orgAdmin, null).getStatusCode().value()).isEqualTo(403);
            assertMatch(platform, "yj01-s7pro-000019", "treadmill", "contains", "PRIVATE");
            assertMatch(platform, "kPOWER-00029", "ski", "prefix", "FTMS");
            assertMatch(platform, "tf-tripro-000001", "treadmill", "contains", "PRIVATE");
            var ambiguous = preview(platform, "CNKW-727-000001");
            assertThat(ambiguous.at("/matchedRules/0/machineType").asText()).isEqualTo("spin");
            assertThat(ambiguous.at("/matchedRules/1/machineType").asText()).isEqualTo("elliptical");
            assertThat(ambiguous.path("resistanceDisabled").asBoolean()).isTrue();

            String rules = ADMIN + "/ble-rules";
            assertThat(request(HttpMethod.POST, rules, orgAdmin, rule("prefix", "Demo", 3000)).getStatusCode().value())
                .isEqualTo(403);
            assertThat(request(HttpMethod.POST, rules, platform, rule("exact", " kpower-00028 ", 3000)).getStatusCode().value())
                .isEqualTo(409);
            assertThat(request(HttpMethod.POST, rules, platform, rule("prefix", "Demo", 10)).getStatusCode().value())
                .isEqualTo(409);
            assertThat(request(HttpMethod.POST, rules, platform, rule("prefix", "Kpower-", 3000)).getStatusCode().value())
                .isEqualTo(200);
            assertThat(request(HttpMethod.PUT, ADMIN + "/resistance-disabled-patterns", platform,
                Map.of("patterns", List.of("POWER"))).getStatusCode().value()).isEqualTo(200);

            var preview = preview(platform, "kPOWER-00028");
            assertThat(preview.path("matchedRules").size()).isEqualTo(3);
            assertThat(preview.at("/matchedRules/0/match").asText()).isEqualTo("exact");
            assertThat(preview.at("/matchedRules/1/match").asText()).isEqualTo("prefix");
            assertThat(preview.path("resistanceDisabled").asBoolean()).isTrue();

            String prefixId = preview.at("/matchedRules/2/id").asText();
            var disabled = new java.util.HashMap<>(rule("prefix", "Kpower-", 3000));
            disabled.put("enabled", false);
            assertThat(request(HttpMethod.PUT, rules + "/" + prefixId, platform, disabled).getStatusCode().value())
                .isEqualTo(200);
            assertThat(request(HttpMethod.PUT, ADMIN + "/items/ski", platform,
                Map.of("names", Map.of("en", "Ski"), "sortOrder", 0, "visible", false)).getStatusCode().value())
                .isEqualTo(400);
            assertThat(request(HttpMethod.PUT, ADMIN + "/items/ski", platform,
                Map.of("names", Map.of("zh-CN", "滑雪机"), "sortOrder", 0, "visible", false)).getStatusCode().value())
                .isEqualTo(200);

            var refreshed = http.getForEntity(PUBLIC, JsonNode.class).getBody();
            assertThat(refreshed.path("machineTypes").size()).isEqualTo(7);
            assertThat(refreshed.path("bleRules").size()).isEqualTo(body.path("bleRules").size());
            assertThat(refreshed.at("/bleRules/1/machineType").asText()).isEqualTo("ski");
            assertThat(refreshed.at("/resistanceDisabledPatterns/0").asText()).isEqualTo("POWER");
            assertThat(db.queryForObject("select count(*) from audit_logs where admin_id = ?", Integer.class, platformId))
                .isEqualTo(4);
        } finally {
            db.update("update machine_navigation set config = cast(? as jsonb) where id = 1", original);
            db.update("delete from audit_logs where admin_id = ?", platformId);
            db.update("delete from admin_users where id in (?, ?)", platformId, orgAdminId);
            db.update("delete from orgs where id = ?", org);
        }
    }

    private String admin(UUID org, UUID id, String role) {
        db.update("""
            insert into admin_users (id, org_id, name, phone, password_hash, role)
            values (?, ?, ?, ?, 'fixture', cast(? as "AdminRole"))
            """, id, org, role, id.toString(), role);
        return jwt.signAdmin(new AdminPayload(id.toString(), role, org.toString(), null, 0));
    }

    private ResponseEntity<JsonNode> request(HttpMethod method, String path, String token, Object data) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return http.exchange(path, method, new HttpEntity<>(data, headers), JsonNode.class);
    }

    private JsonNode preview(String token, String name) {
        return request(HttpMethod.GET, ADMIN + "/preview?name=" + name, token, null).getBody();
    }

    private void assertMatch(String token, String name, String type, String match, String protocol) {
        var first = preview(token, name).at("/matchedRules/0");
        assertThat(first.path("machineType").asText()).isEqualTo(type);
        assertThat(first.path("match").asText()).isEqualTo(match);
        assertThat(first.path("preferredProtocol").asText()).isEqualTo(protocol);
    }

    private static Map<String, Object> rule(String match, String pattern, int priority) {
        return Map.of("machineType", "ski", "match", match, "patterns", List.of(pattern),
            "preferredProtocol", "FTMS", "priority", priority, "enabled", true);
    }
}
