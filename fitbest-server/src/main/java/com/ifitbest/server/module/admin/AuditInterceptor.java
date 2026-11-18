package com.ifitbest.server.module.admin;

import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.auth.AdminAuthInterceptor;
import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.AuditLog;
import com.ifitbest.server.infra.persistence.AuditLogRepo;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 管理端写操作审计 —— 对应 NestJS AuditInterceptor：
 * POST/PUT/PATCH/DELETE + 已登录管理员 → 落 audit_logs（敏感字段脱敏，失败不影响响应）。
 */
@Component
public class AuditInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuditInterceptor.class);
    private static final Map<String, String> SENSITIVE = Map.of(
        "password", "[redacted]", "oldPassword", "[redacted]", "code", "[redacted]", "refreshToken", "[redacted]");
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final AuditLogRepo auditLogs;

    public AuditInterceptor(AuditLogRepo auditLogs) {
        this.auditLogs = auditLogs;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        String method = request.getMethod();
        if (!("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method))) {
            return;
        }
        if (request.getRequestURI().startsWith("/api/v1/admin/system/")) {
            return; // 系统维护操作在业务事务内写入结构化审计。
        }
        Object payloadObj = request.getAttribute(AdminAuthInterceptor.ATTR_ADMIN);
        if (!(payloadObj instanceof JwtCodec.AdminPayload admin)) {
            return;
        }

        try {
            Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String action = method + " " + (pattern == null ? request.getRequestURI() : pattern.toString());

            AuditLog auditLog = new AuditLog();
            auditLog.setId(UUID.randomUUID().toString());
            auditLog.setAdminId(UUID.fromString(admin.aid()));
            auditLog.setOrgId(UUID.fromString(admin.orgId()));
            auditLog.setGymId(admin.gymId() == null ? null : UUID.fromString(admin.gymId()));
            auditLog.setAction(action);
            auditLog.setPayload(sanitize(readBody(request)));
            auditLog.setIp(request.getRemoteAddr());
            auditLog.setCreatedAt(Times.nowUtc());
            auditLogs.save(auditLog);
        } catch (Exception e) {
            log.warn("审计日志写入失败：{}", e.getMessage());
        }
    }

    private Object readBody(HttpServletRequest request) {
        if (request instanceof org.springframework.web.util.ContentCachingRequestWrapper wrapper) {
            byte[] content = wrapper.getContentAsByteArray();
            if (content.length > 0) {
                try {
                    return MAPPER.readValue(new String(content, java.nio.charset.StandardCharsets.UTF_8), Object.class);
                } catch (Exception e) {
                    return Map.of();
                }
            }
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    private String sanitize(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : ((Map<Object, Object>) map).entrySet()) {
                String key = String.valueOf(entry.getKey());
                out.put(key, SENSITIVE.containsKey(key) ? SENSITIVE.get(key) : sanitize(entry.getValue()));
            }
            try {
                return MAPPER.writeValueAsString(out);
            } catch (Exception e) {
                return "{}";
            }
        }
        if (value instanceof java.util.List<?> list) {
            return list.stream().map(this::sanitizeValue).toList().toString();
        }
        return String.valueOf(value);
    }

    private Object sanitizeValue(Object value) {
        if (value instanceof Map<?, ?>) {
            return sanitize(value);
        }
        return value;
    }
}
