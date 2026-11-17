package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserIdentityRepo extends JpaRepository<UserIdentity, UUID> {

    List<UserIdentity> findByUserIdOrderByCreatedAtAsc(UUID userId);

    Optional<UserIdentity> findByTypeAndIdentifier(IdentityType type, String identifier);

    List<UserIdentity> findByIdentifierContaining(String keyword);

    long countByUserId(UUID userId);

    long deleteByUserIdAndType(UUID userId, IdentityType type);

    List<UserIdentity> findByUserIdInOrderByCreatedAtAsc(List<UUID> userIds);
}
