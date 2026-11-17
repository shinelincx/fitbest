package com.ifitbest.server.module.event;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.auth.OptionalUser;

/** 赛事端点 —— /api/v1/events（可选登录）、/api/v1/me/registrations */
@RestController
@RequestMapping("/api/v1")
public class EventsController {

    private final EventsService events;

    public EventsController(EventsService events) {
        this.events = events;
    }

    @OptionalUser
    @GetMapping("events")
    public List<Map<String, Object>> list(@CurrentUser(required = false) String userId) {
        return events.listPublished(userId == null ? null : UUID.fromString(userId));
    }

    @Authed
    @PostMapping("events/{id}/registration")
    public Map<String, Object> register(@CurrentUser UUID userId, @PathVariable UUID id) {
        return events.register(userId, id);
    }

    @Authed
    @DeleteMapping("events/{id}/registration")
    public Map<String, Object> unregister(@CurrentUser UUID userId, @PathVariable UUID id) {
        return events.unregister(userId, id);
    }

    @Authed
    @GetMapping("me/registrations")
    public List<Map<String, Object>> myRegistrations(@CurrentUser UUID userId) {
        return events.myRegistrations(userId);
    }
}
