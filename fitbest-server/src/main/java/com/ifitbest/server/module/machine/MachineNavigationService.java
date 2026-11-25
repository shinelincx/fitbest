package com.ifitbest.server.module.machine;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.module.admin.SystemAdminService;
import com.ifitbest.server.module.admin.SystemAudit;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MachineNavigationService {
    private static final String SELECT = "select config::text from machine_navigation where id = 1";
    private static final Comparator<Item> ITEM_ORDER = Comparator.comparingInt(Item::sortOrder)
        .thenComparing(item -> item.code().name());
    private static final Comparator<Rule> RULE_ORDER = Comparator.comparingInt(Rule::priority).thenComparing(Rule::id);

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final SystemAdminService accounts;
    private final SystemAudit audit;

    public MachineNavigationService(JdbcTemplate jdbc, ObjectMapper json, SystemAdminService accounts, SystemAudit audit) {
        this.jdbc = jdbc;
        this.json = json;
        this.accounts = accounts;
        this.audit = audit;
    }

    public enum Match { exact, prefix, contains }
    public enum Protocol { FTMS, PRIVATE }

    public record Item(MachineType code, Map<String, String> names, int sortOrder, boolean visible) {}
    public record Rule(UUID id, MachineType machineType, Match match, List<String> patterns,
                       Protocol preferredProtocol, int priority, boolean enabled) {}
    public record Config(List<Item> machineTypes, List<Rule> bleRules, List<String> resistanceDisabledPatterns) {}
    public record PublicItem(MachineType code, Map<String, String> names, int sortOrder) {}
    public record PublicRule(MachineType machineType, Match match, List<String> patterns,
                             Protocol preferredProtocol, int priority) {}
    public record PublicConfig(List<PublicItem> machineTypes, List<PublicRule> bleRules,
                               List<String> resistanceDisabledPatterns) {}
    public record Preview(List<Rule> matchedRules, boolean resistanceDisabled) {}

    public record ItemInput(
        @NotNull @Size(min = 1, max = 7) Map<String, @NotBlank @Size(max = 80) String> names,
        @NotNull @PositiveOrZero Integer sortOrder, @NotNull Boolean visible) {}
    public record RuleInput(@NotNull MachineType machineType, @NotNull Match match,
        @NotNull @Size(min = 1, max = 100) List<@NotBlank @Size(max = 128) String> patterns,
        @NotNull Protocol preferredProtocol, @NotNull @PositiveOrZero Integer priority, @NotNull Boolean enabled) {}
    public record ResistanceInput(@NotNull @Size(max = 500) List<@NotBlank @Size(max = 128) String> patterns) {}

    public PublicConfig publicConfig() {
        Config config = read(SELECT);
        return new PublicConfig(config.machineTypes().stream().filter(Item::visible).sorted(ITEM_ORDER)
            .map(item -> new PublicItem(item.code(), item.names(), item.sortOrder())).toList(),
            enabledRules(config).stream().map(rule -> new PublicRule(rule.machineType(), rule.match(),
                rule.patterns(), rule.preferredProtocol(), rule.priority())).toList(), config.resistanceDisabledPatterns());
    }

    public Config adminConfig(AdminPayload payload) {
        SystemAdminService.requirePlatform(accounts.current(payload));
        return sorted(read(SELECT));
    }

    public Preview preview(AdminPayload payload, String name) {
        SystemAdminService.requirePlatform(accounts.current(payload));
        Config config = read(SELECT);
        String normalizedName = normalize(name);
        return new Preview(enabledRules(config).stream().filter(rule -> rule.patterns().stream()
            .anyMatch(pattern -> matches(normalizedName, rule.match(), normalize(pattern)))).toList(),
            config.resistanceDisabledPatterns().stream().anyMatch(pattern -> normalizedName.contains(normalize(pattern))));
    }

    @Transactional
    public Config saveItem(AdminPayload payload, MachineType code, ItemInput input) {
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        Config config = read(SELECT + " for update");
        Item previous = config.machineTypes().stream().filter(item -> item.code() == code).findFirst()
            .orElseThrow(() -> BizException.notFound("未找到导航机型"));
        if (!input.names().containsKey("zh-CN") || !List.of("zh-CN", "en", "ja", "ko", "es", "de", "fr")
                .containsAll(input.names().keySet())) {
            throw BizException.badRequest("请填写简体中文名称并使用 App 支持的语言码");
        }
        Map<String, String> names = new LinkedHashMap<>();
        input.names().forEach((language, name) -> names.put(language, name.strip()));
        Item item = new Item(code, names, input.sortOrder(), input.visible());
        var items = config.machineTypes().stream().map(current -> current.code() == code ? item : current).toList();
        Config updated = store(new Config(items, config.bleRules(), config.resistanceDisabledPatterns()));
        audit.record(actor, null, null, "machine_navigation.item.update", "machine_navigation_item", code.name(),
            Map.of("before", previous, "after", item));
        return updated;
    }

    @Transactional
    public Config saveRule(AdminPayload payload, UUID id, RuleInput input) {
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        Config config = read(SELECT + " for update");
        Rule previous = id == null ? null : config.bleRules().stream().filter(rule -> rule.id().equals(id)).findFirst()
            .orElseThrow(() -> BizException.notFound("未找到蓝牙规则"));
        if (config.machineTypes().stream().noneMatch(item -> item.code() == input.machineType())) {
            throw BizException.badRequest("请选择受支持的导航机型");
        }
        UUID ruleId = previous == null ? UUID.randomUUID() : id;
        var patterns = cleanPatterns(input.patterns());
        var rule = new Rule(ruleId, input.machineType(), input.match(), patterns, input.preferredProtocol(),
            input.priority(), input.enabled());
        List<Rule> otherRules = config.bleRules().stream().filter(current -> !current.id().equals(ruleId)).toList();
        if (rule.enabled()) validateConflicts(rule, otherRules);
        var rules = new ArrayList<>(otherRules);
        rules.add(rule);
        Config updated = store(new Config(config.machineTypes(), rules, config.resistanceDisabledPatterns()));
        audit.record(actor, null, null,
            previous == null ? "machine_navigation.rule.create" : "machine_navigation.rule.update",
            "machine_navigation_rule", ruleId.toString(), previous == null ? Map.of("after", rule)
                : Map.of("before", previous, "after", rule));
        return updated;
    }

    @Transactional
    public Config saveResistance(AdminPayload payload, ResistanceInput input) {
        var actor = accounts.current(payload);
        SystemAdminService.requirePlatform(actor);
        Config config = read(SELECT + " for update");
        var patterns = cleanPatterns(input.patterns());
        Config updated = store(new Config(config.machineTypes(), config.bleRules(), patterns));
        audit.record(actor, null, null, "machine_navigation.resistance.update", "machine_navigation", "1",
            Map.of("before", config.resistanceDisabledPatterns(), "after", patterns));
        return updated;
    }

    private Config read(String sql) {
        try {
            return json.readValue(jdbc.queryForObject(sql, String.class), Config.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法读取器械导航配置", e);
        }
    }

    private Config store(Config config) {
        Config sorted = sorted(config);
        try {
            jdbc.update("update machine_navigation set config = cast(? as jsonb) where id = 1", json.writeValueAsString(sorted));
            return sorted;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("无法保存器械导航配置", e);
        }
    }

    private static Config sorted(Config config) {
        return new Config(config.machineTypes().stream().sorted(ITEM_ORDER).toList(),
            config.bleRules().stream().sorted(RULE_ORDER).toList(), config.resistanceDisabledPatterns());
    }

    private static List<Rule> enabledRules(Config config) {
        return config.bleRules().stream().filter(Rule::enabled).sorted(RULE_ORDER).toList();
    }

    private static void validateConflicts(Rule rule, List<Rule> otherRules) {
        var patterns = rule.patterns().stream().map(MachineNavigationService::normalize).toList();
        for (Rule other : otherRules) {
            if (!other.enabled()) continue;
            if (rule.priority() == other.priority()) throw BizException.conflict("已启用规则使用了该优先级");
            if (rule.machineType() == other.machineType() && rule.match() == other.match()
                    && other.patterns().stream().map(MachineNavigationService::normalize)
                    .anyMatch(patterns::contains)) {
                throw BizException.conflict("同机型已有启用规则使用相同的匹配方式和广播名");
            }
        }
    }

    private static List<String> cleanPatterns(List<String> input) {
        var patterns = input.stream().map(String::strip).toList();
        if (patterns.stream().anyMatch(String::isEmpty)) throw BizException.badRequest("广播名规则不能为空");
        if (patterns.stream().map(MachineNavigationService::normalize).distinct().count() != patterns.size()) {
            throw BizException.badRequest("同一规则内的广播名不能重复");
        }
        return patterns;
    }

    private static String normalize(String name) {
        return name.strip().toLowerCase(Locale.ROOT);
    }

    private static boolean matches(String name, Match mode, String pattern) {
        return switch (mode) {
            case exact -> name.equals(pattern);
            case prefix -> name.startsWith(pattern);
            case contains -> name.contains(pattern);
        };
    }
}
