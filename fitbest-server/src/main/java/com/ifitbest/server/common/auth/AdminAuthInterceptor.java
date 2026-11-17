package com.ifitbest.server.common.auth;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.AdminUserRepo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 管理端认证拦截器（对应 NestJS AdminGuard），错误文案一致。
 */
@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_ADMIN = "fitbest.admin";

    private final JwtCodec jwt;
    private final FitbestProperties props;
    private final AdminUserRepo admins;

    public AdminAuthInterceptor(JwtCodec jwt, FitbestProperties props, AdminUserRepo admins) {
        this.jwt = jwt;
        this.props = props;
        this.admins = admins;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }
        boolean authed = AnnotatedElementUtils.hasAnnotation(hm.getBeanType(), AuthedAdmin.class)
            || hm.hasMethodAnnotation(AuthedAdmin.class);
        if (!authed) {
            return true;
        }
        String token = UserAuthInterceptor.bearer(request);
        if (token == null) {
            throw BizException.unauthorized("请先登录管理后台");
        }
        JwtCodec.AdminPayload payload;
        UUID adminId;
        try {
            Map<String, Object> claims = jwt.verify(token, JwtCodec.TYP_ADMIN, props.getJwt().getAdminSecret());
            payload = JwtCodec.AdminPayload.fromClaims(claims);
            adminId = UUID.fromString(payload.aid());
        } catch (IllegalArgumentException e) {
            throw BizException.unauthorized("后台登录已过期");
        }
        AdminUser admin = admins.findById(adminId).orElse(null);
        if (admin == null || !"active".equals(admin.getStatus())
            || !Objects.equals(admin.getRole(), payload.role())
            || !Objects.equals(Objects.toString(admin.getOrgId(), null), payload.orgId())
            || !Objects.equals(Objects.toString(admin.getGymId(), null), payload.gymId())) {
            throw BizException.unauthorized("后台登录已过期");
        }
        if ("viewer".equals(admin.getRole()) && !("GET".equals(request.getMethod())
            || "HEAD".equals(request.getMethod()) || "OPTIONS".equals(request.getMethod()))) {
            throw BizException.forbidden("只读账号不能修改数据");
        }
        request.setAttribute(ATTR_ADMIN, payload);
        return true;
    }
}
