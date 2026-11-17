package com.ifitbest.server.infra.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ShareLinkRepo extends JpaRepository<ShareLink, String> {

    Optional<ShareLink> findBySessionId(UUID sessionId);
}
