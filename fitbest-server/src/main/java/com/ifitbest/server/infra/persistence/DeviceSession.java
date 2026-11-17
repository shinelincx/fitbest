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

/** 设备同步会话，表 device_sessions，唯一约束 (user_id, client_session_id) */
@Getter
@Setter
@Entity
@Table(name = "device_sessions")
public class DeviceSession {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "device_id", nullable = false)
    private UUID deviceId;

    @Column(name = "client_session_id", nullable = false)
    private String clientSessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WorkoutMode mode;

    @Column(nullable = false)
    private String app = "hyrox";

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "distance_m", nullable = false)
    private int distanceM;

    @Column(name = "avg_hr")
    private Integer avgHr;

    @Column(name = "max_hr")
    private Integer maxHr;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String metrics;

    @Column(name = "close_reason")
    private String closeReason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DeviceSessionQuality quality = DeviceSessionQuality.ok;

    @Column(name = "training_record_id")
    private UUID trainingRecordId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
