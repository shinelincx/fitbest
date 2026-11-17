package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TrainingRecordRepo extends JpaRepository<TrainingRecord, UUID>, JpaSpecificationExecutor<TrainingRecord> {

    Optional<TrainingRecord> findByUserIdAndAppAndClientKey(UUID userId, String app, String clientKey);

    List<TrainingRecord> findByUserId(UUID userId, Pageable pageable);

    List<TrainingRecord> findByUserIdAndApp(UUID userId, String app, Pageable pageable);

    List<TrainingRecord> findByApp(String app);

    @Query(value = """
        select exists(select 1 from deleted_training_record_keys
                      where user_id = :userId and app = :app and client_key = :clientKey)
        """, nativeQuery = true)
    boolean isDeletedKey(@Param("userId") UUID userId, @Param("app") String app, @Param("clientKey") String clientKey);

    @Modifying
    @Query(value = """
        insert into deleted_training_record_keys (user_id, app, client_key)
        values (:userId, :app, :clientKey) on conflict do nothing
        """, nativeQuery = true)
    void markDeletedKey(@Param("userId") UUID userId, @Param("app") String app, @Param("clientKey") String clientKey);
}
