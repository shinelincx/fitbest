package com.ifitbest.server.module.admin;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.infra.persistence.WriteLocks;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {
    private final JdbcTemplate jdbc;
    private final WriteLocks locks;
    private final SystemAdminService accounts;
    private final SystemAudit audit;

    public CatalogService(JdbcTemplate jdbc, WriteLocks locks, SystemAdminService accounts, SystemAudit audit) {
        this.jdbc = jdbc;
        this.locks = locks;
        this.accounts = accounts;
        this.audit = audit;
    }

    public record MachineTypeItem(String code, String label, int sortOrder, boolean selectable) {}
    public record BusinessSettings(String defaultGymTimezone) {}

    public List<MachineTypeItem> machineTypes() {
        return jdbc.query("select code, label, sort_order, selectable from machine_type_dictionary order by sort_order, code",
            (rs, row) -> new MachineTypeItem(rs.getString(1), rs.getString(2), rs.getInt(3), rs.getBoolean(4)));
    }

    @Transactional
    public void updateMachineType(AdminPayload payload, MachineType code, String label, int order, boolean selectable) {
        SystemAdminService.lockAccounts(locks);
        locks.acquire("admin-catalog", code.name());
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        int updated = jdbc.update("""
            update machine_type_dictionary set label = ?, sort_order = ?, selectable = ?
            where code = cast(? as "MachineType")
            """, label.trim(), order, selectable, code.name());
        if (updated == 0) throw BizException.notFound("器械类型字典项不存在");
        audit.record(actor, null, null, "dictionary.update", "machine_type", code.name(),
            Map.of("label", label.trim(), "sortOrder", order, "selectable", selectable));
    }

    public void requireSelectable(MachineType code) {
        locks.acquire("admin-catalog", code.name());
        if (machineTypes().stream().noneMatch(type -> type.code().equals(code.name()) && type.selectable())) {
            throw BizException.badRequest("该器械类型已停止用于新增型号");
        }
    }

    public BusinessSettings settings() {
        return new BusinessSettings(jdbc.queryForObject(
            "select default_gym_timezone from admin_business_settings where id = 1", String.class));
    }

    @Transactional
    public BusinessSettings updateSettings(AdminPayload payload, String timezone) {
        SystemAdminService.lockAccounts(locks);
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        String value = validateTimezone(timezone);
        jdbc.update("update admin_business_settings set default_gym_timezone = ? where id = 1", value);
        audit.record(actor, null, null, "settings.update", "business_settings", "1", Map.of("defaultGymTimezone", value));
        return new BusinessSettings(value);
    }

    public String gymTimezone(String supplied) {
        return supplied == null || supplied.isBlank() ? settings().defaultGymTimezone() : validateTimezone(supplied);
    }

    private static String validateTimezone(String timezone) {
        if (!ZoneId.getAvailableZoneIds().contains(timezone)) {
            throw BizException.badRequest("请输入有效的 IANA 时区，例如 Asia/Shanghai");
        }
        return timezone;
    }
}
