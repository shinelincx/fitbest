package com.ifitbest.server.infra.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface AuditLogRepo extends JpaRepository<AuditLog, String>, JpaSpecificationExecutor<AuditLog> {
}
