package com.ifitbest.server.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.DriverManager;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named = "FITBEST_SYNC_PG_URL", matches = ".+")
class FlywayBaselinePostgresTest {
    private final String url = System.getenv("FITBEST_SYNC_PG_URL");
    private final String user = System.getenv("FITBEST_SYNC_PG_USER");
    private final String password = System.getenv("FITBEST_SYNC_PG_PASSWORD");

    @Test
    void rejectsOlderSchemaBeforeRecordingTheBaseline() throws Exception {
        String schema = testSchema();
        try {
            prepareLegacy(schema, "4");
            assertThatThrownBy(() -> guarded(schema).migrate())
                .isInstanceOf(FlywayException.class).hasStackTraceContaining("旧库未达到 V5")
                .hasStackTraceContaining("device_sessions.id");
            assertThat(exists(schema, "flyway_schema_history")).isFalse();
        } finally {
            dropFixture(schema);
        }
    }

    @Test
    void completeLegacySchemaBaselinesAndRunsLaterMigrations() throws Exception {
        String schema = testSchema();
        try {
            prepareLegacy(schema, "5");
            guarded(schema).migrate();
            assertThat(exists(schema, "deleted_session_keys")).isTrue();
            assertThat(guarded(schema).info().current().getVersion().getVersion()).isEqualTo("9");
        } finally {
            dropFixture(schema);
        }
    }

    private void prepareLegacy(String schema, String version) {
        Flyway.configure().dataSource(url, user, password).defaultSchema(schema)
            .table("fixture_migrations").target(version).load().migrate();
    }

    private Flyway guarded(String schema) {
        return Flyway.configure().dataSource(url, user, password).defaultSchema(schema)
            .baselineOnMigrate(true).baselineVersion("5").callbacks(new FlywayBaselineGuard()).load();
    }

    private static String testSchema() {
        return "fitbest_test_" + UUID.randomUUID().toString().replace("-", "");
    }

    private boolean exists(String schema, String table) throws Exception {
        try (var connection = DriverManager.getConnection(url, user, password);
             var statement = connection.prepareStatement("select to_regclass(?) is not null")) {
            statement.setString(1, schema + "." + table);
            try (var result = statement.executeQuery()) {
                result.next();
                return result.getBoolean(1);
            }
        }
    }

    private void dropFixture(String schema) throws Exception {
        try (var connection = DriverManager.getConnection(url, user, password); var statement = connection.createStatement()) {
            statement.executeUpdate("drop schema if exists " + schema + " cascade");
        }
    }
}
