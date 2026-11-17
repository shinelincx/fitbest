package com.ifitbest.server.module.share;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.Session;
import com.ifitbest.server.infra.persistence.SessionRepo;
import com.ifitbest.server.infra.persistence.ShareLink;
import com.ifitbest.server.infra.persistence.ShareLinkRepo;
import com.ifitbest.server.infra.persistence.UserRepo;

/** 分享服务 —— 短码生成 + OG 落地页 SSR（HTML 与 NestJS ShareService 输出一致） */
@Service
public class ShareService {

    private static final String ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final Map<String, String> TYPE_LABEL = Map.of(
        "treadmill", "跑步机",
        "rower", "划船机",
        "ski", "滑雪机",
        "bike", "风阻车",
        "sled", "雪橇机",
        "rep", "力量训练");

    private final ShareLinkRepo links;
    private final SessionRepo sessions;
    private final UserRepo users;
    private final FitbestProperties props;

    public ShareService(ShareLinkRepo links, SessionRepo sessions, UserRepo users, FitbestProperties props) {
        this.links = links;
        this.sessions = sessions;
        this.users = users;
        this.props = props;
    }

    private String url(String code) {
        String base = props.getPublicBaseUrl();
        return (base.endsWith("/") ? base.substring(0, base.length() - 1) : base) + "/s/" + code;
    }

    private Map<String, Object> serialize(ShareLink link) {
        Map<String, Object> og = new LinkedHashMap<>();
        og.put("title", link.getOgTitle());
        og.put("description", link.getOgDesc());
        og.put("image", link.getOgImageUrl());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", link.getCode());
        out.put("url", url(link.getCode()));
        out.put("sessionId", link.getSessionId() == null ? null : link.getSessionId().toString());
        out.put("views", link.getViews());
        out.put("createdAt", link.getCreatedAt());
        out.put("og", og);
        return out;
    }

    @Transactional
    public Map<String, Object> create(UUID userId, UUID sessionId, Map<String, Object> weeklyPayload) {
        if (sessionId == null && weeklyPayload == null) {
            throw BizException.badRequest("请提供训练记录或周报数据");
        }

        String ogTitle = "我的 FITBEST 训练";
        String ogDesc = "一起动起来，练出更好的自己";
        String ogImageUrl = null;

        if (sessionId != null) {
            Session session = sessions.findById(sessionId).filter(s -> s.getUserId().equals(userId)).orElse(null);
            if (session == null) {
                throw BizException.notFound("训练记录不存在");
            }
            ShareLink existing = links.findBySessionId(session.getId()).orElse(null);
            if (existing != null) {
                return serialize(existing);
            }

            String nickname = users.findById(session.getUserId()).map(u -> u.getNickname()).orElse("");
            long minutes = Math.round(session.getDurationSec() / 60.0);
            String label = TYPE_LABEL.getOrDefault(session.getMachineType().name(), "器械");
            ogTitle = nickname + " 完成了一次" + label + "训练";
            ogDesc = minutes + " 分钟 · " + session.getCalories() + " 千卡 · "
                + String.format("%.2f", session.getDistanceM() / 1000.0) + " 公里";
            ogImageUrl = users.findById(session.getUserId()).map(u -> u.getAvatar()).orElse(null);
        } else if (weeklyPayload != null) {
            double sessions = toFinite(weeklyPayload.getOrDefault("sessions",
                weeklyPayload.getOrDefault("totalSessions", 0)));
            double minutes = toFinite(weeklyPayload.getOrDefault("minutes",
                weeklyPayload.getOrDefault("totalMinutes", 0)));
            ogTitle = "我的本周训练战报";
            ogDesc = "本周完成 " + (long) sessions + " 次训练，累计 " + (long) minutes + " 分钟";
        }

        for (int attempt = 0; attempt < 5; attempt++) {
            String code = makeCode();
            try {
                ShareLink link = new ShareLink();
                link.setCode(code);
                link.setSessionId(sessionId);
                link.setWeeklyPayload(writeJson(weeklyPayload));
                link.setOgTitle(ogTitle);
                link.setOgDesc(ogDesc);
                link.setOgImageUrl(ogImageUrl);
                link.setCreatedAt(Times.nowUtc());
                links.save(link);
                return serialize(link);
            } catch (DataIntegrityViolationException e) {
                // 短码碰撞重试
            }
        }
        throw BizException.badRequest("分享码生成失败，请稍后重试");
    }

    @Transactional
    public String view(String code) {
        ShareLink link = links.findById(code).orElse(null);
        if (link == null) {
            return null;
        }
        if (link.getExpiresAt() != null && link.getExpiresAt().isBefore(Times.nowUtc())) {
            return null;
        }

        try {
            link.setViews(link.getViews() + 1);
            links.save(link);
        } catch (Exception ignored) {
            // 计数失败忽略
        }

        String title = escapeHtml(link.getOgTitle() == null ? "FITBEST 训练分享" : link.getOgTitle());
        String desc = escapeHtml(link.getOgDesc() == null ? "一起动起来，练出更好的自己" : link.getOgDesc());
        String image = link.getOgImageUrl() == null ? "" : escapeHtml(link.getOgImageUrl());

        return "<!doctype html>\n"
            + "<html lang=\"zh-CN\">\n"
            + "<head>\n"
            + "<meta charset=\"utf-8\">\n"
            + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            + "<title>" + title + "</title>\n"
            + "<meta property=\"og:type\" content=\"website\">\n"
            + "<meta property=\"og:title\" content=\"" + title + "\">\n"
            + "<meta property=\"og:description\" content=\"" + desc + "\">\n"
            + (image.isEmpty() ? "" : "<meta property=\"og:image\" content=\"" + image + "\">\n")
            + "<style>\n"
            + "*{box-sizing:border-box}\n"
            + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif}\n"
            + "main{width:min(90vw,420px);padding:32px;border-radius:24px;background:linear-gradient(160deg,#151b24,#0b0f14);border:1px solid #232b36;text-align:center}\n"
            + ".brand{margin:0 0 20px;font-size:13px;letter-spacing:4px;color:#5fd0a0;font-weight:600}\n"
            + "h1{margin:0 0 12px;font-size:24px;line-height:1.35}\n"
            + "p.desc{margin:0 0 24px;color:#9aa7b5;font-size:15px;line-height:1.6}\n"
            + ".tip{margin:0;font-size:12px;color:#5c6878}\n"
            + "</style>\n"
            + "</head>\n"
            + "<body>\n"
            + "<main>\n"
            + "<p class=\"brand\">FITBEST</p>\n"
            + "<h1>" + title + "</h1>\n"
            + "<p class=\"desc\">" + desc + "</p>\n"
            + "<p class=\"tip\">打开 FITBEST App 查看完整训练数据</p>\n"
            + "</main>\n"
            + "</body>\n"
            + "</html>";
    }

    private static double toFinite(Object value) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }

    private static String makeCode() {
        StringBuilder code = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    private static String escapeHtml(String value) {
        return value
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
    }

    private static String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }
}
