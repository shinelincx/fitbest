package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 器械型号，表 machine_models，唯一约束 (org_id, type, model) */
@Getter
@Setter
@Entity
@Table(name = "machine_models")
public class MachineModel {

    @Id
    private UUID id;

    @Column(name = "org_id", nullable = false)
    private UUID orgId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MachineType type;

    @Column(nullable = false)
    private String model;

    private String brand;

    /** JSON（跑带宽度 / 阻力档等） */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String specs;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
