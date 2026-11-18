package com.ifitbest.server.infra.persistence;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminUserRepo extends JpaRepository<AdminUser, UUID> {

    Optional<AdminUser> findByPhone(String phone);

    Optional<AdminUser> findBySetupHash(String setupHash);

    boolean existsBySetupHash(String setupHash);

    List<AdminUser> findByOrgId(UUID orgId);

    boolean existsByGymId(UUID gymId);

    boolean existsByOrgIdAndStatusIn(UUID orgId, List<String> statuses);

    long countByRoleAndStatus(String role, String status);
}
