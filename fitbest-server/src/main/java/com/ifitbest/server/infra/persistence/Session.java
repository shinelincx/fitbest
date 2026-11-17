package com.ifitbest.server.infra.persistence;

import java.math.BigDecimal;
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

/** 器械训练会话，表 sessions，idempotencyKey 唯一 */
@Getter
@Setter
@Entity
@Table(name = "sessions")
public class Session {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "gym_id")
    private UUID gymId;

    @Column(name = "machine_id")
    private UUID machineId;

    @Enumerated(EnumType.STRING)
    @Column(name = "machine_type", nullable = false)
    private MachineType machineType;

    @Column(name = "machine_model")
    private String machineModel;

    @Column(nullable = false)
    private String mode = "free";

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "distance_m", nullable = false)
    private int distanceM;

    @Column(nullable = false)
    private int calories;

    @Column(name = "avg_hr")
    private Integer avgHr;

    @Column(name = "avg_speed", precision = 4, scale = 1)
    private BigDecimal avgSpeed;

    private Integer cadence;

    private Integer power;

    private Integer target;

    private Boolean completed;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SessionSource source = SessionSource.ble;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "idempotency_key", unique = true)
    private String idempotencyKey;
}
