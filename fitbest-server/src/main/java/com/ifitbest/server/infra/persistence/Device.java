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

/** 物理设备登记（手环 / 器械），表 devices，serialNo 唯一 */
@Getter
@Setter
@Entity
@Table(name = "devices")
public class Device {

    @Id
    private UUID id;

    @Column(name = "serial_no", nullable = false, unique = true)
    private String serialNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DeviceKind kind = DeviceKind.band;

    private String label;

    @Column(name = "last_seen_at")
    private LocalDateTime lastSeenAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
