package com.ifitbest.server.module.website;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.WriteLocks;
import com.ifitbest.server.module.admin.SystemAdminService;
import com.ifitbest.server.module.admin.SystemAudit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

@Service
public class WebsiteService {
    private static final Pattern SLOT = Pattern.compile("\\{\\{site\\.([A-Za-z]+)}}");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final SystemAdminService accounts;
    private final WriteLocks locks;
    private final SystemAudit audit;
    private final Path template;

    public WebsiteService(JdbcTemplate jdbc, ObjectMapper json, SystemAdminService accounts, WriteLocks locks,
                          SystemAudit audit, @Value("${fitbest.web.root}") String webRoot) {
        this.jdbc = jdbc;
        this.json = json;
        this.accounts = accounts;
        this.locks = locks;
        this.audit = audit;
        this.template = Path.of(webRoot, "fitbestwebsite", "index.html");
    }

    public record Draft(long revision, WebsiteContent content) {}
    public record Publication(long version, LocalDateTime publishedAt, UUID publishedBy, Long restoredFrom) {}
    public record State(Draft draft, List<Publication> versions) {}

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public State state(AdminPayload payload) {
        requireAccess(accounts.current(payload));
        List<Publication> versions = jdbc.query("""
            select version, published_at, published_by, restored_from
            from website_publications order by version desc limit 50
            """, (rs, row) -> new Publication(rs.getLong(1), rs.getObject(2, LocalDateTime.class),
                rs.getObject(3, UUID.class), rs.getObject(4, Long.class)));
        return new State(readDraft(), versions);
    }

    @Transactional
    public Draft save(AdminPayload payload, long revision, WebsiteContent content) {
        SystemAdminService.lockAccounts(locks);
        AdminUser actor = accounts.current(payload);
        if (!SystemAdminService.platform(actor) && !actor.isSiteEditor()) {
            throw BizException.forbidden("没有官网编辑权限");
        }
        checkRevision(revision);
        content.validateLinks();
        jdbc.update("update website_draft set content = cast(? as jsonb), revision = revision + 1 where id = 1",
            toJson(content));
        audit.record(actor, null, null, "website.save-draft", "website", "homepage", Map.of("revision", revision + 1));
        return new Draft(revision + 1, content);
    }

    public String preview(AdminPayload payload, WebsiteContent content) {
        requireAccess(accounts.current(payload));
        content.validateLinks();
        return render(content);
    }

    @Transactional
    public long publish(AdminPayload payload, long revision, Long restoreVersion) {
        SystemAdminService.lockAccounts(locks);
        AdminUser actor = accounts.current(payload);
        if (!SystemAdminService.platform(actor) && !actor.isSitePublisher()) {
            throw BizException.forbidden("没有官网发布权限");
        }
        Draft draft = checkRevision(revision);
        WebsiteContent content = restoreVersion == null ? draft.content() : contentAt(restoreVersion);
        content.validateLinks();
        render(content);
        Long version = jdbc.queryForObject("""
            insert into website_publications (content, published_by, restored_from)
            values (cast(? as jsonb), ?, ?) returning version
            """, Long.class, toJson(content), actor.getId(), restoreVersion);
        jdbc.update("update website_draft set revision = revision + 1 where id = 1");
        Map<String, ?> details = restoreVersion == null ? Map.of("draftRevision", revision)
            : Map.of("restoredFrom", restoreVersion);
        audit.record(actor, null, null, restoreVersion == null ? "website.publish" : "website.restore",
            "website_publication", version.toString(), details);
        return version;
    }

    public String publicPage() {
        String content = jdbc.queryForObject(
            "select content::text from website_publications order by version desc limit 1", String.class);
        return render(readContent(content));
    }

    private static void requireAccess(AdminUser actor) {
        if (!SystemAdminService.platform(actor) && !actor.isSiteEditor() && !actor.isSitePublisher()) {
            throw BizException.forbidden("没有官网管理权限");
        }
    }

    private Draft readDraft() {
        return jdbc.queryForObject("select revision, content::text from website_draft where id = 1",
            (rs, row) -> new Draft(rs.getLong(1), readContent(rs.getString(2))));
    }

    private Draft checkRevision(long expected) {
        Draft draft = readDraft();
        if (draft.revision() != expected) throw BizException.conflict("官网内容已更新，请重新加载后操作");
        return draft;
    }

    private WebsiteContent contentAt(long version) {
        return jdbc.query("select content::text from website_publications where version = ?",
            (rs, row) -> readContent(rs.getString(1)), version).stream().findFirst()
            .orElseThrow(() -> BizException.notFound("发布版本不存在"));
    }

    private String toJson(WebsiteContent content) {
        return json.valueToTree(content).toString();
    }

    private WebsiteContent readContent(String content) {
        try {
            return json.readValue(content, WebsiteContent.class);
        } catch (IOException e) {
            throw new IllegalStateException("官网内容无法读取", e);
        }
    }

    private String render(WebsiteContent content) {
        try {
            JsonNode fields = json.valueToTree(content);
            return SLOT.matcher(Files.readString(template, StandardCharsets.UTF_8)).replaceAll(match -> {
                JsonNode field = fields.get(match.group(1));
                if (field == null || !field.isTextual()) throw new IllegalStateException("官网模板字段缺失");
                return Matcher.quoteReplacement(HtmlUtils.htmlEscape(field.asText()));
            });
        } catch (IOException e) {
            throw new BizException(HttpStatus.SERVICE_UNAVAILABLE.value(), "官网模板暂时不可用");
        }
    }
}
