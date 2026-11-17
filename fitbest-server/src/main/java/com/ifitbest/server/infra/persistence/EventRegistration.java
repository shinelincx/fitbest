package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 赛事报名，表 event_registrations，唯一约束 (user_id, event_id) */
@Getter
@Setter
@Entity
@Table(name = "event_registrations")
public class EventRegistration {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(nullable = false)
    private String status = "registered";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
