package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/**
 * 管理员，表 admin_users。
 * 注意：role 是 PG 枚举 AdminRole，含值 'super'（Java 关键字），
 * 因此用 String 映射（JDBC URL 已加 stringtype=unspecified），取值：super/org_admin/gym_admin/ops/viewer。
 */
@Getter
@Setter
@Entity
@Table(name = "admin_users")
public class AdminUser {

    @Id
    private UUID id;

    @Column(name = "org_id", nullable = false)
    private UUID orgId;

    @Column(name = "gym_id")
    private UUID gymId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String role = "viewer";

    @Column(nullable = false)
    private String status = "active";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
