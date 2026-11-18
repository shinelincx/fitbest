package com.ifitbest.server.common.auth;

import java.util.Map;
import java.util.UUID;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.UserRepo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 用户端认证拦截器（对应 NestJS JwtAuthGuard）：
 * 按 @Authed / @OptionalUser 注解驱动；错误文案与原实现一致。
 */
@Component
public class UserAuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_USER_ID = "fitbest.userId";

    private final JwtCodec jwt;
    private final FitbestProperties props;
    private final UserRepo users;

    public UserAuthInterceptor(JwtCodec jwt, FitbestProperties props, UserRepo users) {
        this.jwt = jwt;
        this.props = props;
        this.users = users;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }
        boolean authed = AnnotatedElementUtils.hasAnnotation(hm.getBeanType(), Authed.class)
            || hm.hasMethodAnnotation(Authed.class);
        boolean optional = hm.hasMethodAnnotation(OptionalUser.class)
            || AnnotatedElementUtils.hasAnnotation(hm.getBeanType(), OptionalUser.class);
        if (!authed && !optional) {
            return true;
        }

        String token = bearer(request);
        if (token == null) {
            if (optional) {
                return true;
            }
            throw BizException.unauthorized("请先登录");
        }
        UUID userId;
        try {
            Map<String, Object> claims = jwt.verify(token, JwtCodec.TYP_ACCESS, props.getJwt().getAccessSecret());
            userId = UUID.fromString(String.valueOf(claims.get("sub")));
        } catch (Exception e) {
            if (optional) {
                return true;
            }
            throw BizException.unauthorized("登录已过期，请重新登录");
        }
        if (!users.existsByIdAndStatus(userId, "active")) {
            if (optional) {
                return true;
            }
            throw BizException.unauthorized("登录已过期，请重新登录");
        }
        request.setAttribute(ATTR_USER_ID, userId.toString());
        return true;
    }

    public static String bearer(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        return header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
    }
}
