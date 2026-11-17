package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 分享短链，表 share_links，code 为主键，session 1:1 可空 */
@Getter
@Setter
@Entity
@Table(name = "share_links")
public class ShareLink {

    @Id
    private String code;

    @Column(name = "session_id", unique = true)
    private UUID sessionId;

    /** 周报 payload JSON */
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "weekly_payload")
    private String weeklyPayload;

    @Column(name = "og_title")
    private String ogTitle;

    @Column(name = "og_desc")
    private String ogDesc;

    @Column(name = "og_image_url")
    private String ogImageUrl;

    @Column(nullable = false)
    private int views = 0;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
