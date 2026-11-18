package com.ifitbest.server.module.admin;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.AuditLog;
import com.ifitbest.server.infra.persistence.AuditLogRepo;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class SystemAudit {
    private final AuditLogRepo logs;
    private final ObjectMapper json;
    private final HttpServletRequest request;

    public SystemAudit(AuditLogRepo logs, ObjectMapper json, HttpServletRequest request) {
        this.logs = logs;
        this.json = json;
        this.request = request;
    }

    public void record(AdminUser actor, UUID orgId, UUID gymId, String action, String type, String id,
                       Map<String, ?> changes) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("actorOrgId", actor.getOrgId());
        metadata.put("result", "success");
        metadata.put("changes", changes);
        var log = new AuditLog();
        log.setId(UUID.randomUUID().toString());
        log.setAdminId(actor.getId());
        log.setOrgId(orgId);
        log.setGymId(gymId);
        log.setAction(action);
        log.setTargetType(type);
        log.setTargetId(id);
        log.setPayload(json.valueToTree(metadata).toString());
        log.setIp(request.getRemoteAddr());
        log.setCreatedAt(Times.nowUtc());
        logs.save(log);
    }
}
