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

/** 器械实例，表 machines，serialNo 全局唯一 */
@Getter
@Setter
@Entity
@Table(name = "machines")
public class Machine {

    @Id
    private UUID id;

    @Column(name = "model_id", nullable = false)
    private UUID modelId;

    @Column(name = "org_id", nullable = false)
    private UUID orgId;

    @Column(name = "gym_id", nullable = false)
    private UUID gymId;

    @Column(name = "serial_no", nullable = false, unique = true)
    private String serialNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MachineStatus status = MachineStatus.active;

    private String firmware;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
