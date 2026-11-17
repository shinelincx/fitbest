package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserSessionRepo extends JpaRepository<UserSession, UUID> {

    /** 撤销用户全部会话（注销 / 全端登出） */
    @Modifying
    @Query("update UserSession s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
    int revokeAll(@Param("userId") UUID userId, @Param("now") LocalDateTime now);

    /** 按 refresh 会话 ID 撤销 */
    @Modifying
    @Query("update UserSession s set s.revokedAt = :now where s.id = :sessionId and s.revokedAt is null")
    int revokeBySessionId(@Param("sessionId") UUID sessionId, @Param("now") LocalDateTime now);
}
