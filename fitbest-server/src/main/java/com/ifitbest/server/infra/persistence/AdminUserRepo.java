package com.ifitbest.server.infra.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminUserRepo extends JpaRepository<AdminUser, UUID> {

    Optional<AdminUser> findByPhone(String phone);
}
