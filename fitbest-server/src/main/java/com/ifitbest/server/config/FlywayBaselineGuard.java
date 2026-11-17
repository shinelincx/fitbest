package com.ifitbest.server.config;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.stereotype.Component;

/** 仅在 Flyway 建立 V5 基线前核对被跳过的旧库结构和已有 Prisma 历史。 */
@Component
public class FlywayBaselineGuard implements Callback {
    private static final List<String> REQUIRED_COLUMNS = List.of(
        "orgs:id,code,name", "gyms:id,org_id,code,timezone", "users:id,status,updated_at",
        "user_identities:id,user_id,type,identifier", "user_credentials:user_id",
        "user_goals:user_id,weekly_sessions,weekly_minutes", "user_sessions:id,user_id,refresh_hash,expires_at",
        "machine_models:id,org_id,type,model", "machines:id,gym_id,model_id,serial_no",
        "machine_tags:id,machine_id,tag_value", "sessions:id,user_id,started_at,ended_at,idempotency_key",
        "share_links:code,session_id", "event_links:id,org_id,status",
        "notifications:id,user_id", "admin_users:id,org_id,role,status", "audit_logs:id,admin_id", "message_logs:id",
        "event_registrations:id,user_id,event_id,status,created_at",
        "training_records:id,user_id,app,client_key,plan_id,completed,total_time_sec,distance_m,module_times,run_splits,avg_hr,max_hr,rpe,weakest_station,started_at,created_at",
        "devices:id,serial_no,kind,label,last_seen_at,created_at",
        "device_sessions:id,user_id,device_id,client_session_id,mode,app,started_at,ended_at,duration_sec,distance_m,avg_hr,max_hr,metrics,close_reason,quality,training_record_id,created_at",
        "device_segments:id,session_id,seq,type,machine_serial,machine_type,connect_tick,disconnect_tick,duration_sec,distance_m,metrics,created_at"
    );
    private static final List<String> REQUIRED_KEYS = List.of(
        "orgs_code_key", "gyms_org_id_code_key", "user_identities_type_identifier_key",
        "machine_models_org_id_type_model_key", "machines_serial_no_key", "machine_tags_tag_value_key",
        "sessions_idempotency_key_key", "share_links_session_id_key", "admin_users_phone_key",
        "event_registrations_user_id_event_id_key", "training_records_user_id_app_client_key_key",
        "devices_serial_no_key", "device_sessions_user_id_client_session_id_key", "device_segments_session_id_seq_key"
    );
    private static final List<String> REQUIRED_FOREIGN_KEYS = List.of(
        "sessions_user_id_fkey", "share_links_session_id_fkey", "event_registrations_user_id_fkey",
        "event_registrations_event_id_fkey", "training_records_user_id_fkey", "device_sessions_user_id_fkey",
        "device_sessions_device_id_fkey", "device_sessions_training_record_id_fkey", "device_segments_session_id_fkey"
    );
    private static final List<String> PRISMA_VERSIONS = List.of(
        "20261102000000_init", "20261103090000_event_registrations", "20261103110000_training_records",
        "20261103120000_training_record_client_key", "20261104100000_device_sessions"
    );

    @Override
    public boolean supports(Event event, Context context) {
        return event == Event.BEFORE_BASELINE;
    }

    @Override
    public boolean canHandleInTransaction(Event event, Context context) {
        return true;
    }

    @Override
    public String getCallbackName() {
        return "fitbest-v5-baseline-guard";
    }

    @Override
    public void handle(Event event, Context context) {
        if (!"5".equals(context.getConfiguration().getBaselineVersion().getVersion())) {
            throw new FlywayException("FitBest 仅支持接管已经验证的 V5 基线");
        }
        Connection connection = context.getConnection();
        try {
            String schema = context.getConfiguration().getDefaultSchema();
            if (schema == null) schema = connection.getSchema();
            validateSchema(connection, schema);
        } catch (SQLException error) {
            throw new FlywayException("无法核对旧库结构，已中止 Flyway 基线接管", error);
        }
    }

    private static void validateSchema(Connection connection, String schema) throws SQLException {
        Set<String> columns = values(connection, """
            select c.relname || '.' || a.attname from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid
            where n.nspname = ? and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
            """, schema);
        Set<String> uniqueKeys = values(connection, """
            select c.relname from pg_index i
            join pg_class c on c.oid = i.indexrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = ? and i.indisunique and i.indisvalid and i.indpred is null
            """, schema);
        Set<String> foreignKeys = values(connection, """
            select c.conname from pg_constraint c join pg_namespace n on n.oid = c.connamespace
            where n.nspname = ? and c.contype = 'f' and c.convalidated
            """, schema);

        List<String> missing = new ArrayList<>();
        for (String definition : REQUIRED_COLUMNS) {
            String[] parts = definition.split(":", 2);
            for (String column : parts[1].split(",")) {
                String field = parts[0] + "." + column;
                if (!columns.contains(field)) missing.add(field);
            }
        }
        REQUIRED_KEYS.stream().filter(key -> !uniqueKeys.contains(key)).forEach(missing::add);
        REQUIRED_FOREIGN_KEYS.stream().filter(key -> !foreignKeys.contains(key)).forEach(missing::add);

        if (columns.contains("_prisma_migrations.migration_name")) {
            String qualified = "\"" + schema.replace("\"", "\"\"") + "\".\"_prisma_migrations\"";
            Set<String> applied = values(connection, "select migration_name from " + qualified
                + " where finished_at is not null and rolled_back_at is null");
            PRISMA_VERSIONS.stream().filter(version -> !applied.contains(version)).forEach(missing::add);
        }
        if (!missing.isEmpty()) {
            throw new FlywayException("旧库未达到 V5，已中止基线接管；请补齐 Prisma 迁移并核对以下对象："
                + String.join(", ", missing));
        }
    }

    private static Set<String> values(Connection connection, String sql, String... parameters) throws SQLException {
        Set<String> result = new HashSet<>();
        try (var statement = connection.prepareStatement(sql)) {
            for (int i = 0; i < parameters.length; i++) statement.setString(i + 1, parameters[i]);
            try (var rows = statement.executeQuery()) {
                while (rows.next()) result.add(rows.getString(1));
            }
        }
        return result;
    }
}
