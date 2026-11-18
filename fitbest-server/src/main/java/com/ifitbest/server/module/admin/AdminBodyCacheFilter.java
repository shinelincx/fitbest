package com.ifitbest.server.module.admin;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** 管理端写请求体缓存 —— 供审计拦截器读取（控制器消费后仍可获取 body） */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AdminBodyCacheFilter extends OncePerRequestFilter {

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String method = request.getMethod();
        boolean write = "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method);
        String path = request.getRequestURI();
        return !write || !path.startsWith("/api/v1/admin/")
            || path.startsWith("/api/v1/admin/system/") || path.startsWith("/api/v1/admin/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(new ContentCachingRequestWrapper(request), response);
    }
}
