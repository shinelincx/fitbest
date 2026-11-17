package com.ifitbest.server.infra.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MachineTagRepo extends JpaRepository<MachineTag, UUID> {

    Optional<MachineTag> findByTagValue(String tagValue);

    Optional<MachineTag> findFirstByMachineIdAndTagTypeAndStatus(UUID machineId, TagType tagType, TagStatus status);
}
