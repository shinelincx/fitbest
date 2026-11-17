package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

/** 组织（租户根），表 orgs */
@Getter
@Setter
@Entity
@Table(name = "orgs")
public class Org {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String status = "active";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
