package com.ifitbest.server.module.event;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.EventLink;
import com.ifitbest.server.infra.persistence.EventLinkRepo;
import com.ifitbest.server.infra.persistence.EventRegistration;
import com.ifitbest.server.infra.persistence.EventRegistrationRepo;
import com.ifitbest.server.infra.persistence.WriteLocks;

/** 赛事服务 —— 列表（含报名态）/ 报名 / 取消 / 我的报名 */
@Service
public class EventsService {

    private final EventLinkRepo events;
    private final EventRegistrationRepo registrations;
    private final WriteLocks locks;

    public EventsService(EventLinkRepo events, EventRegistrationRepo registrations, WriteLocks locks) {
        this.events = events;
        this.registrations = registrations;
        this.locks = locks;
    }

    public List<Map<String, Object>> listPublished(UUID userId) {
        List<EventLink> rows = events.findByStatusOrderBySortAscCreatedAtDesc("published");
        Set<UUID> registered = new HashSet<>();
        if (userId != null) {
            List<UUID> eventIds = rows.stream().map(EventLink::getId).toList();
            if (!eventIds.isEmpty()) {
                registrations.findByUserIdAndEventIdIn(userId, eventIds)
                    .forEach(r -> registered.add(r.getEventId()));
            }
        }
        return rows.stream().map(e -> withRegistered(e, registered.contains(e.getId()))).toList();
    }

    public static Map<String, Object> serializeEvent(EventLink e) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", e.getId().toString());
        out.put("orgId", e.getOrgId() == null ? null : e.getOrgId().toString());
        out.put("title", e.getTitle());
        out.put("subtitle", e.getSubtitle());
        out.put("coverUrl", e.getCoverUrl());
        out.put("externalUrl", e.getExternalUrl());
        out.put("startAt", e.getStartAt());
        out.put("endAt", e.getEndAt());
        out.put("sort", e.getSort());
        out.put("status", e.getStatus());
        out.put("createdAt", e.getCreatedAt());
        return out;
    }

    private static Map<String, Object> withRegistered(EventLink e, boolean registered) {
        Map<String, Object> out = serializeEvent(e);
        out.put("registered", registered);
        return out;
    }

    @Transactional
    public Map<String, Object> register(UUID userId, UUID eventId) {
        lockRegistration(userId, eventId);
        EventLink event = events.findById(eventId).orElse(null);
        if (event == null) {
            throw BizException.notFound("赛事不存在");
        }
        if (!"published".equals(event.getStatus())) {
            throw BizException.conflict("该赛事暂未开放报名");
        }
        EventRegistration registration = registrations.findByUserIdAndEventId(userId, eventId).orElse(null);
        if (registration == null) {
            registration = new EventRegistration();
            registration.setId(UUID.randomUUID());
            registration.setUserId(userId);
            registration.setEventId(eventId);
            registration.setCreatedAt(Times.nowUtc());
            registrations.save(registration);
        }
        return Map.of("id", registration.getId().toString(), "eventId", eventId.toString(), "registered", true);
    }

    @Transactional
    public Map<String, Object> unregister(UUID userId, UUID eventId) {
        lockRegistration(userId, eventId);
        registrations.deleteByUserIdAndEventId(userId, eventId);
        return Map.of("eventId", eventId.toString(), "registered", false);
    }

    private void lockRegistration(UUID userId, UUID eventId) {
        locks.acquire("event-registration", userId + ":" + eventId);
    }

    public List<Map<String, Object>> myRegistrations(UUID userId) {
        List<EventRegistration> rows = registrations.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 200));
        return rows.stream()
            .map(r -> {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("id", r.getId().toString());
                out.put("eventId", r.getEventId().toString());
                out.put("status", r.getStatus());
                out.put("createdAt", r.getCreatedAt());
                out.put("event", events.findById(r.getEventId()).map(EventsService::serializeEvent).orElse(null));
                return out;
            })
            .toList();
    }
}
