package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface EventRegistrationRepo extends JpaRepository<EventRegistration, UUID>, JpaSpecificationExecutor<EventRegistration> {

    List<EventRegistration> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    List<EventRegistration> findByUserIdAndEventIdIn(UUID userId, List<UUID> eventIds);

    List<EventRegistration> findByUserIdAndEventIdIn(UUID userId, List<UUID> eventIds, Pageable pageable);

    Optional<EventRegistration> findByUserIdAndEventId(UUID userId, UUID eventId);

    long deleteByUserIdAndEventId(UUID userId, UUID eventId);

    List<EventRegistration> findByEventIdIn(List<UUID> eventIds);
}
