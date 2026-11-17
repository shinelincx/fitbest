package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface EventLinkRepo extends JpaRepository<EventLink, UUID> {

    List<EventLink> findByStatusOrderBySortAscCreatedAtDesc(String status);

    List<EventLink> findByOrgIdOrderBySortAscCreatedAtDesc(UUID orgId);

    List<EventLink> findAllByOrderBySortAscCreatedAtDesc();
}
