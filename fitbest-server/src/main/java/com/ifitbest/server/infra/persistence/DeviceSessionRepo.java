package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface DeviceSessionRepo extends JpaRepository<DeviceSession, UUID>, JpaSpecificationExecutor<DeviceSession> {

    Optional<DeviceSession> findByUserIdAndClientSessionId(UUID userId, String clientSessionId);

    boolean existsByTrainingRecordId(UUID trainingRecordId);

    void deleteByTrainingRecordId(UUID trainingRecordId);

    List<DeviceSession> findByUserId(UUID userId, Pageable pageable);

    List<DeviceSession> findByUserIdAndMode(UUID userId, WorkoutMode mode, Pageable pageable);

    /** AI 教练跑步机摘要：训练模式最近 N 场 */
    List<DeviceSession> findByUserIdAndAppAndModeOrderByStartedAtDesc(UUID userId, String app, WorkoutMode mode, Pageable pageable);
}
