package com.ifitbest.server.module.admin;

import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.MachineType;
import org.springframework.dao.DataIntegrityViolationException;
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

    public record Region(String code, String name, String parentCode, int level) {}

    public List<Region> regions() {
        return jdbc.query("select code, name, parent_code, level from regions order by code",
            (rs, row) -> new Region(rs.getString(1), rs.getString(2), rs.getString(3), rs.getInt(4)));
    }

    private AdminUser regionEditor(AdminPayload payload) {
        SystemAdminService.lockAccounts(locks);
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        return actor;
    }

    @Transactional
    public void createRegion(AdminPayload payload, String code, String name, String parentCode) {
        var actor = regionEditor(payload);
        int level = 1;
        if (parentCode != null) {
            var parents = jdbc.queryForList("select level from regions where code = ?", Integer.class, parentCode);
            if (parents.isEmpty() || parents.get(0) >= 3) throw BizException.badRequest("请选择省或市作为上级地区");
            level = parents.get(0) + 1;
        }
        int inserted = jdbc.update("insert into regions(code, name, parent_code, level) values (?,?,?,?) on conflict (code) do nothing",
            code, name.trim(), parentCode, level);
        if (inserted == 0) throw BizException.conflict("地区编码已存在");
        audit.record(actor, null, null, "region.create", "region", code, Map.of("name", name.trim()));
    }

    @Transactional
    public void renameRegion(AdminPayload payload, String code, String name) {
        var actor = regionEditor(payload);
        if (jdbc.update("update regions set name = ? where code = ?", name.trim(), code) == 0) {
            throw BizException.notFound("地区不存在");
        }
        audit.record(actor, null, null, "region.rename", "region", code, Map.of("name", name.trim()));
    }

    @Transactional
    public void deleteRegion(AdminPayload payload, String code) {
        var actor = regionEditor(payload);
        try {
            if (jdbc.update("delete from regions where code = ?", code) == 0) throw BizException.notFound("地区不存在");
        } catch (DataIntegrityViolationException ex) {
            throw BizException.conflict("地区下仍有子地区或关联门店，无法删除");
        }
        audit.record(actor, null, null, "region.delete", "region", code, Map.of());
    }

    public String districtCode(String code) {
        if (code == null || code.isBlank()) return null;
        if (!Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from regions where code = ? and level = 3)", Boolean.class, code))) {
            throw BizException.badRequest("请选择有效的区/县");
        }
        return code;
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
