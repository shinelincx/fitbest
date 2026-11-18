package com.ifitbest.server.module.auth;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.UserSession;
import com.ifitbest.server.infra.persistence.UserSessionRepo;

/** 令牌服务 —— refresh 轮换 / 撤销，与 NestJS TokenService 行为一致 */
@Service
public class TokenService {

    public record TokenPair(String accessToken, String refreshToken) {
    }

    private final JwtCodec jwt;
    private final FitbestProperties props;
    private final UserSessionRepo sessions;

    public TokenService(JwtCodec jwt, FitbestProperties props, UserSessionRepo sessions) {
        this.jwt = jwt;
        this.props = props;
        this.sessions = sessions;
    }

    @Transactional
    public TokenPair issue(UUID userId, String device, String ip) {
        UserSession session = new UserSession();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setRefreshHash("");
        session.setDevice(device);
        session.setIp(ip);
        session.setExpiresAt(Times.nowUtc().plusSeconds(
            Times.parseDurationSeconds(props.getJwt().getRefreshTtl(), 30L * 86400)));
        session.setCreatedAt(Times.nowUtc());
        sessions.save(session);

        String refreshToken = jwt.signRefresh(userId.toString(), session.getId().toString());
        session.setRefreshHash(Times.sha256Hex(refreshToken));
        sessions.save(session);
        return new TokenPair(jwt.signAccess(userId.toString()), refreshToken);
    }

    /** 刷新令牌并轮换 refresh token */
    @Transactional
    public TokenPair rotate(String refreshToken) {
        Map<String, Object> payload;
        try {
            payload = jwt.verify(refreshToken, JwtCodec.TYP_REFRESH, props.getJwt().getRefreshSecret());
        } catch (Exception e) {
            throw BizException.unauthorized("登录已过期，请重新登录");
        }

        String sub = String.valueOf(payload.get("sub"));
        UUID sid = UUID.fromString(String.valueOf(payload.get("sid")));

        UserSession session = sessions.findForUpdate(sid).orElse(null);
        if (session == null || !session.getUserId().toString().equals(sub)) {
            throw BizException.unauthorized("登录已过期，请重新登录");
        }
        if (session.getRevokedAt() != null || !session.getExpiresAt().isAfter(Times.nowUtc())) {
            throw BizException.unauthorized("登录已过期，请重新登录");
        }
        if (!session.getRefreshHash().equals(Times.sha256Hex(refreshToken))) {
            throw BizException.unauthorized("登录凭证已失效，请重新登录");
        }

        String nextRefresh = jwt.signRefresh(sub, sid.toString());
        session.setRefreshHash(Times.sha256Hex(nextRefresh));
        sessions.save(session);
        return new TokenPair(jwt.signAccess(sub), nextRefresh);
    }

    @Transactional
    public void revokeByToken(String refreshToken) {
        try {
            Map<String, Object> payload = jwt.verify(refreshToken, JwtCodec.TYP_REFRESH, props.getJwt().getRefreshSecret());
            sessions.revokeBySessionId(UUID.fromString(String.valueOf(payload.get("sid"))), LocalDateTime.now(java.time.ZoneOffset.UTC));
        } catch (Exception e) {
            // 令牌已失效时忽略
        }
    }

    @Transactional
    public void revokeAll(UUID userId) {
        sessions.revokeAll(userId, Times.nowUtc());
    }

    /** 唯一约束冲突（P2002 对应）判断工具 */
    public static boolean isUniqueViolation(Exception e) {
        return e instanceof DataIntegrityViolationException;
    }
}
