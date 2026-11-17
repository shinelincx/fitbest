package com.ifitbest.server.infra.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MessageLogRepo extends JpaRepository<MessageLog, String> {
}
