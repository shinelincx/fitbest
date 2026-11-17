package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 短信 / 邮件发送日志，表 message_logs */
@Getter
@Setter
@Entity
@Table(name = "message_logs")
public class MessageLog {

    @Id
    private String id;

    @Column(nullable = false)
    private String channel;

    @Column(nullable = false)
    private String target;

    @Column(nullable = false)
    private String scene;

    private String template;

    @Column(name = "provider_msg_id")
    private String providerMsgId;

    @Column(nullable = false)
    private String status;

    private String error;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
