package com.ifitbest.server.module.feedback;

import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.module.admin.SystemAdminService;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FeedbackService {
    static final Set<String> SOURCES = Set.of("fitbest", "hyrox", "btwe");
    private static final Set<String> STATUSES = Set.of("pending", "in_progress", "resolved");
    private static final String ROW = """
        SELECT f.id, f.source, f.content, f.submitter_id, u.nickname, f.status, f.version, f.created_at
          FROM feedback f LEFT JOIN users u ON u.id = f.submitter_id
        """;

    private final JdbcTemplate db;
    private final SystemAdminService admins;

    public FeedbackService(JdbcTemplate db, SystemAdminService admins) {
        this.db = db;
        this.admins = admins;
    }

    public record Image(String mediaType, byte[] bytes) {}
    public record Receipt(UUID id, String createdAt) {}
    public record Summary(UUID id, String source, String content, UUID submitterId, String submitterName,
                          String status, long version, String createdAt) {}
    public record History(long version, UUID actorId, String actorName, String fromStatus, String toStatus,
                          String note, String createdAt) {}
    public record Detail(Summary feedback, List<UUID> attachments, List<History> history, boolean canWrite) {}
    public record Page(List<Summary> items, long total, boolean canWrite) {}
    public record Change(Long version, String action, String note) {}

    @Transactional
    public Receipt submit(String source, UUID user, UUID key, String content, List<Image> images) {
        String scope = user == null ? "guest" : user.toString();
        String hash = hash(content, images);
        UUID id = UUID.randomUUID();
        var inserted = db.query("""
            INSERT INTO feedback (id, source, submitter_id, submission_scope, idempotency_key, content, request_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (submission_scope, source, idempotency_key) DO NOTHING RETURNING id, created_at
            """, (rs, row) -> new Receipt(id, time(rs)), id, source, user, scope, key, content, hash);
        if (inserted.isEmpty()) {
            return db.queryForObject("""
                SELECT id, created_at, request_hash FROM feedback
                WHERE submission_scope = ? AND source = ? AND idempotency_key = ?
                """, (rs, row) -> {
                    if (!hash.equals(rs.getString("request_hash"))) {
                        throw BizException.conflict("此提交编号已用于其他反馈内容");
                    }
                    return new Receipt(rs.getObject("id", UUID.class), time(rs));
                }, scope, source, key);
        }
        for (int i = 0; i < images.size(); i++) {
            Image image = images.get(i);
            db.update("""
                INSERT INTO feedback_attachments (id, feedback_id, position, media_type, content)
                VALUES (?, ?, ?, ?, ?)
                """, UUID.randomUUID(), id, i, image.mediaType(), image.bytes());
        }
        return inserted.get(0);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Page list(AdminPayload actor, String source, String status, OffsetDateTime from, OffsetDateTime to,
                     int page, int size) {
        requireFeedbackMenu(actor);
        if ((source != null && !SOURCES.contains(source)) || (status != null && !STATUSES.contains(status))
            || (from != null && to != null && !from.isBefore(to)) || page < 1 || size < 1 || size > 100) {
            throw BizException.badRequest("筛选条件或分页参数不正确");
        }
        String where = """
            WHERE (CAST(? AS text) IS NULL OR f.source = ?)
              AND (CAST(? AS text) IS NULL OR f.status = ?)
              AND (CAST(? AS timestamptz) IS NULL OR f.created_at >= ?)
              AND (CAST(? AS timestamptz) IS NULL OR f.created_at < ?)
            """;
        long total = db.queryForObject("SELECT count(*) FROM feedback f " + where, Long.class,
            source, source, status, status, from, from, to, to);
        var items = db.query(ROW + where + " ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?",
            FeedbackService::summary, source, source, status, status, from, from, to, to, size, (long) (page - 1) * size);
        return new Page(items, total, true);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Detail detail(AdminPayload actor, UUID id) {
        requireFeedbackMenu(actor);
        Summary feedback = find(id);
        var attachments = db.queryForList(
            "SELECT id FROM feedback_attachments WHERE feedback_id = ? ORDER BY position", UUID.class, id);
        var history = db.query("SELECT * FROM feedback_history WHERE feedback_id = ? ORDER BY version",
            (rs, row) -> new History(rs.getLong("version"), rs.getObject("actor_id", UUID.class),
                rs.getString("actor_name"), rs.getString("from_status"), rs.getString("to_status"),
                rs.getString("note"), time(rs)), id);
        return new Detail(feedback, attachments, history, true);
    }

    public Image attachment(AdminPayload actor, UUID id, UUID attachmentId) {
        requireFeedbackMenu(actor);
        return db.query("SELECT media_type, content FROM feedback_attachments WHERE feedback_id = ? AND id = ?",
            (rs, row) -> new Image(rs.getString("media_type"), rs.getBytes("content")), id, attachmentId)
            .stream().findFirst().orElseThrow(() -> BizException.notFound("图片不存在"));
    }

    @Transactional
    public Map<String, Long> change(AdminPayload actor, UUID id, Change input) {
        requireFeedbackMenu(actor);
        String note = input.note() == null ? "" : input.note().strip();
        if (input.version() == null || input.version() < 0 || input.action() == null || note.length() > 2000) {
            throw BizException.badRequest("处理参数不正确");
        }
        Summary current = find(id);
        if (current.version() != input.version()) {
            throw BizException.conflict("反馈已被更新，请刷新详情");
        }
        String target = switch (input.action()) {
            case "start" -> "pending".equals(current.status()) ? "in_progress" : null;
            case "resolve" -> !"resolved".equals(current.status()) ? "resolved" : null;
            case "reopen" -> "resolved".equals(current.status()) ? "pending" : null;
            case "note" -> note.isEmpty() ? null : current.status();
            default -> null;
        };
        if (target == null) {
            throw BizException.badRequest("当前状态不支持此操作，或备注为空");
        }
        if (db.update("UPDATE feedback SET status = ?, version = version + 1 WHERE id = ? AND version = ?",
            target, id, input.version()) != 1) {
            throw BizException.conflict("反馈已被更新，请刷新详情");
        }
        long version = input.version() + 1;
        int recorded = db.update("""
            INSERT INTO feedback_history (feedback_id, version, actor_id, actor_name, from_status, to_status, note)
            SELECT ?, ?, id, name, ?, ?, ? FROM admin_users WHERE id = ?
            """, id, version, current.status(), target, note.isEmpty() ? null : note, UUID.fromString(actor.aid()));
        if (recorded != 1) {
            throw BizException.forbidden("处理账号已不可用");
        }
        return Map.of("version", version);
    }

    private Summary find(UUID id) {
        return db.query(ROW + " WHERE f.id = ?", FeedbackService::summary, id)
            .stream().findFirst().orElseThrow(() -> BizException.notFound("反馈不存在"));
    }

    private void requireFeedbackMenu(AdminPayload actor) {
        var admin = admins.current(actor);
        if (!SystemAdminService.platform(admin) && !admin.isFeedbackManager()) {
            throw BizException.forbidden("当前账号无反馈数据权限");
        }
    }

    private static Summary summary(ResultSet rs, int row) throws SQLException {
        return new Summary(rs.getObject("id", UUID.class), rs.getString("source"), rs.getString("content"),
            rs.getObject("submitter_id", UUID.class), rs.getString("nickname"), rs.getString("status"),
            rs.getLong("version"), time(rs));
    }

    private static String time(ResultSet rs) throws SQLException {
        return rs.getObject("created_at", OffsetDateTime.class).toInstant().toString();
    }

    private static String hash(String content, List<Image> images) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            hashPart(digest, content.getBytes(StandardCharsets.UTF_8));
            for (Image image : images) {
                hashPart(digest, image.bytes());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void hashPart(MessageDigest digest, byte[] bytes) {
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(bytes.length).array());
        digest.update(bytes);
    }
}
