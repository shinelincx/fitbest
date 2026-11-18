package com.ifitbest.server.infra.persistence;

import java.util.UUID;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrgRepo extends JpaRepository<Org, UUID> {
    Optional<Org> findByCode(String code);
}
