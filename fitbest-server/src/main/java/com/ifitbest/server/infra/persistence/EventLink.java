package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 赛事外链，表 event_links */
@Getter
@Setter
@Entity
@Table(name = "event_links")
public class EventLink {

    @Id
    private UUID id;

    @Column(name = "org_id")
    private UUID orgId;

    @Column(nullable = false)
    private String title;

    private String subtitle;

    @Column(name = "cover_url")
    private String coverUrl;

    @Column(name = "external_url", nullable = false)
    private String externalUrl;

    @Column(name = "start_at")
    private LocalDateTime startAt;

    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(nullable = false)
    private int sort = 0;

    @Column(nullable = false)
    private String status = "published";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
