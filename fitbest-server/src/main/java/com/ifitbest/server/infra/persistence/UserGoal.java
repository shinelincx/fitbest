package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 用户周目标（1:1），表 user_goals */
@Getter
@Setter
@Entity
@Table(name = "user_goals")
public class UserGoal {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "weekly_sessions", nullable = false)
    private int weeklySessions = 0;

    @Column(name = "weekly_minutes", nullable = false)
    private int weeklyMinutes = 0;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
