package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 赛事训练整场记录，表 training_records，唯一约束 (user_id, app, client_key) */
@Getter
@Setter
@Entity
@Table(name = "training_records")
public class TrainingRecord {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String app;

    @Column(name = "client_key")
    private String clientKey;

    @Column(name = "plan_id")
    private String planId;

    @Column(nullable = false)
    private boolean completed = false;

    @Column(name = "total_time_sec", nullable = false)
    private int totalTimeSec;

    @Column(name = "distance_m", nullable = false)
    private int distanceM = 0;

    /** JSON 数组 */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "module_times")
    private String moduleTimes;

    /** JSON 数组 */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "run_splits")
    private String runSplits;

    @Column(name = "avg_hr")
    private Integer avgHr;

    @Column(name = "max_hr")
    private Integer maxHr;

    private Integer rpe;

    @Column(name = "weakest_station")
    private String weakestStation;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
