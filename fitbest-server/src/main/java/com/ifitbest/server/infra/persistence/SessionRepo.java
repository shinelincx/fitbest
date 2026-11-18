package com.ifitbest.server.infra.persistence;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface SessionRepo extends JpaRepository<Session, UUID>, JpaSpecificationExecutor<Session> {

    Optional<Session> findByIdempotencyKey(String idempotencyKey);

    @Query("""
        select s from Session s where s.userId = :userId
        and (s.idempotencyKey = :reference or s.id = :id)
        order by case when s.idempotencyKey = :reference then 0 else 1 end
        """)
    List<Session> findOwnedReference(UUID userId, String reference, UUID id, Pageable limit);

    @Query(value = "select exists (select 1 from deleted_session_keys where user_id = :userId and client_key = :key)",
        nativeQuery = true)
    boolean isDeletedKey(UUID userId, String key);

    @Modifying
    @Query(value = "delete from deleted_session_keys where user_id = :userId and client_key = :key", nativeQuery = true)
    void allowRestoringKey(UUID userId, String key);

    @Modifying
    @Query(value = """
        insert into deleted_session_keys (user_id, client_key) values (:userId, :key)
        on conflict do nothing
        """, nativeQuery = true)
    void rememberDeletedKey(UUID userId, String key);

    @Modifying
    @Query(value = """
        insert into deleted_session_keys (user_id, client_key)
        select user_id, idempotency_key from sessions where user_id = :userId and idempotency_key is not null
        and cast(machine_type as text) in (:types)
        on conflict do nothing
        """, nativeQuery = true)
    void rememberDeletedCloudKeys(UUID userId, List<String> types);

    @Modifying
    @Query("delete from Session s where s.userId = :userId and s.machineType in :types")
    int deleteAllForUser(UUID userId, List<MachineType> types);

    List<Session> findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(UUID userId, LocalDateTime since);

    List<Session> findByUserIdOrderByStartedAtDesc(UUID userId, Pageable pageable);

    List<Session> findByUserIdAndGymIdInOrderByStartedAtDesc(UUID userId, List<UUID> gymIds, Pageable pageable);

    /** 门店范围内本周会话（管理端 byType 汇总用） */
    List<Session> findByGymIdInAndStartedAtGreaterThanEqual(List<UUID> gymIds, LocalDateTime since);

    List<Session> findByStartedAtGreaterThanEqual(LocalDateTime since);

    List<Session> findByUserId(UUID userId);
}
