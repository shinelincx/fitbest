package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MachineRepo extends JpaRepository<Machine, UUID> {

    List<Machine> findByStatusOrderByCreatedAtAsc(MachineStatus status);

    List<Machine> findByStatusAndGymIdOrderByCreatedAtAsc(MachineStatus status, UUID gymId);

    Optional<Machine> findBySerialNo(String serialNo);

    List<Machine> findByGymIdIn(List<UUID> gymIds);

    long countByGymId(UUID gymId);
}
