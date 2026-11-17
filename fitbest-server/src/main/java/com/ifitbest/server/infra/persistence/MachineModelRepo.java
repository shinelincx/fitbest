package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MachineModelRepo extends JpaRepository<MachineModel, UUID> {

    List<MachineModel> findByOrgId(UUID orgId);
}
