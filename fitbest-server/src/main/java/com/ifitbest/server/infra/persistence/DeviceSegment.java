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

/** 设备会话分段，表 device_segments，唯一约束 (session_id, seq)。注意 machineType 为普通字符串 */
@Getter
@Setter
@Entity
@Table(name = "device_segments")
public class DeviceSegment {

    @Id
    private UUID id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(nullable = false)
    private int seq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SegmentType type;

    @Column(name = "machine_serial")
    private String machineSerial;

    @Column(name = "machine_type")
    private String machineType;

    @Column(name = "connect_tick")
    private Integer connectTick;

    @Column(name = "disconnect_tick")
    private Integer disconnectTick;

    @Column(name = "duration_sec", nullable = false)
    private int durationSec;

    @Column(name = "distance_m", nullable = false)
    private int distanceM;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private String metrics;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
