package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 管理端审计日志，表 audit_logs（id 原为 cuid，这里用 UUID 字符串） */
@Getter
@Setter
@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    private String id;

    @Column(name = "admin_id")
    private UUID adminId;

    @Column(name = "org_id")
    private UUID orgId;

    @Column(name = "gym_id")
    private UUID gymId;

    @Column(nullable = false)
    private String action;

    @Column(name = "target_type")
    private String targetType;

    @Column(name = "target_id")
    private String targetId;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String payload;

    private String ip;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
