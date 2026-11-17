package com.ifitbest.server.infra.persistence;

import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** PostgreSQL 事务锁，串行化同一业务键的查询和写入。 */
@Component
public class WriteLocks {
    private final JdbcTemplate jdbc;

    public WriteLocks(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void acquire(String scope, String key) {
        jdbc.query("select pg_advisory_xact_lock(hashtext(?), hashtext(?))", row -> {}, scope, key);
    }

    public void trainingRecord(UUID userId, String clientId) {
        acquire("training-record", userId + ":" + clientId);
    }
}
