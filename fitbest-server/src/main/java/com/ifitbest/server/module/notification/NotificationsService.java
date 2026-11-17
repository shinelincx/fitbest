package com.ifitbest.server.module.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.Notification;
import com.ifitbest.server.infra.persistence.NotificationRepo;

/** 站内通知 —— 列表（含未读数）/ 标记已读 */
@Service
public class NotificationsService {

    private final NotificationRepo notifications;

    public NotificationsService(NotificationRepo notifications) {
        this.notifications = notifications;
    }

    public Map<String, Object> list(UUID userId, int limit) {
        int size = Math.min(Math.max(limit, 1), 50);
        List<Notification> items = notifications.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, size));
        long unreadCount = notifications.countByUserIdAndReadAtIsNull(userId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items.stream().map(NotificationsService::serialize).toList());
        out.put("unreadCount", unreadCount);
        return out;
    }

    public static Map<String, Object> serialize(Notification n) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", n.getId().toString());
        out.put("userId", n.getUserId().toString());
        out.put("type", n.getType());
        out.put("title", n.getTitle());
        out.put("body", n.getBody());
        out.put("link", n.getLink());
        out.put("readAt", n.getReadAt());
        out.put("createdAt", n.getCreatedAt());
        return out;
    }

    @Transactional
    public Map<String, Object> markRead(UUID userId, UUID id) {
        Notification notification = notifications.findByIdAndUserId(id, userId).orElse(null);
        if (notification == null) {
            throw BizException.notFound("通知不存在");
        }
        if (notification.getReadAt() == null) {
            notification.setReadAt(Times.nowUtc());
            notifications.save(notification);
        }
        return Map.of("ok", true);
    }
}
