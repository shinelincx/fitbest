package com.ifitbest.server.infra.redis;

import java.time.Duration;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

/** 微信登录绑定票据（对应 NestJS wx:bind:{ticket}，TTL 600s） */
@Service
public class WechatTicketStore {

    public record Ticket(String identifier, String nickname) {
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final StringRedisTemplate redis;

    public WechatTicketStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void save(String ticket, Ticket data) {
        try {
            redis.opsForValue().set("wx:bind:" + ticket, MAPPER.writeValueAsString(data), Duration.ofSeconds(600));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public Ticket get(String ticket) {
        String raw = redis.opsForValue().get("wx:bind:" + ticket);
        if (raw == null) {
            return null;
        }
        try {
            return MAPPER.readValue(raw, Ticket.class);
        } catch (Exception e) {
            return null;
        }
    }

    public void delete(String ticket) {
        redis.delete("wx:bind:" + ticket);
    }
}
