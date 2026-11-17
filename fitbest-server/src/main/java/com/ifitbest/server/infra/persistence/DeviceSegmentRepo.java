package com.ifitbest.server.infra.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeviceSegmentRepo extends JpaRepository<DeviceSegment, UUID> {

    List<DeviceSegment> findBySessionIdOrderBySeqAsc(UUID sessionId);

    interface SessionSegmentCount {
        UUID getSessionId();
        long getSegmentCount();
    }

    @Query("""
        select s.sessionId as sessionId, count(s) as segmentCount
        from DeviceSegment s where s.sessionId in :sessionIds group by s.sessionId
        """)
    List<SessionSegmentCount> countBySessionIds(@Param("sessionIds") List<UUID> sessionIds);

    List<DeviceSegment> findBySessionIdAndType(UUID sessionId, SegmentType type);
}
