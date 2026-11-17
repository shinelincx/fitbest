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

/** 器械 QR / NFC 标签，表 machine_tags，tagValue 唯一 */
@Getter
@Setter
@Entity
@Table(name = "machine_tags")
public class MachineTag {

    @Id
    private UUID id;

    @Column(name = "machine_id", nullable = false)
    private UUID machineId;

    @Enumerated(EnumType.STRING)
    @Column(name = "tag_type", nullable = false)
    private TagType tagType;

    @Column(name = "tag_value", nullable = false, unique = true)
    private String tagValue;

    private String secret;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TagStatus status = TagStatus.active;

    @Column(name = "printed_at")
    private LocalDateTime printedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
