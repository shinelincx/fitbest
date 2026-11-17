package com.ifitbest.server.infra.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceRepo extends JpaRepository<Device, UUID> {

    Optional<Device> findBySerialNo(String serialNo);
}
