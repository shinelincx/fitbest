package com.ifitbest.server.module.notification;

import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;

/** 通知端点 —— /api/v1/me/notifications */
@RestController
@RequestMapping("/api/v1/me/notifications")
@Authed
public class NotificationsController {

    private final NotificationsService notifications;

    public NotificationsController(NotificationsService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public Map<String, Object> list(@CurrentUser UUID userId,
                                    @RequestParam(required = false) Integer limit) {
        return notifications.list(userId, limit == null ? 20 : limit);
    }

    @PostMapping("{id}/read")
    public Map<String, Object> markRead(@CurrentUser UUID userId, @PathVariable UUID id) {
        return notifications.markRead(userId, id);
    }
}
