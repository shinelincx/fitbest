package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 门店，表 gyms */
@Getter
@Setter
@Entity
@Table(name = "gyms", uniqueConstraints = @jakarta.persistence.UniqueConstraint(name = "gyms_org_id_code_key", columnNames = {"org_id", "code"}))
public class Gym {

    @Id
    private UUID id;

    @Column(name = "org_id", nullable = false)
    private UUID orgId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String code;

    private String address;

    @Column(nullable = false)
    private String timezone = "Asia/Shanghai";

    @Column(nullable = false)
    private String status = "active";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
