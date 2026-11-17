package com.ifitbest.server.infra.redis;

import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;

/**
 * 验证码服务 —— 与原 NestJS CodeService 键结构 / 节流策略 / 错误文案完全一致：
 *   code:{channel}:{scene}:{target}  = {h, a}（TTL 300s，最多错 5 次）
 *   cool:{channel}:{scene}:{target}  = 冷却 60s（NX）
 *   daily:{channel}:{target}:{date}  = 日限 10 条
 * 哈希算法：sha256("{channel}:{scene}:{target}:{code}:{QR_SECRET}")
 */
@Service
public class RedisCodeService {

    private static final int MAX_ATTEMPTS = 5;

    private final StringRedisTemplate redis;
    private final FitbestProperties props;

    public RedisCodeService(StringRedisTemplate redis, FitbestProperties props) {
        this.redis = redis;
        this.props = props;
    }

    public enum Channel { sms, email }

    public enum Scene { login, bind }

    public String issue(Channel channel, Scene scene, String target) {
        String cooldownKey = "cool:" + channel + ":" + scene + ":" + target;
        Boolean acquired = redis.opsForValue().setIfAbsent(cooldownKey, "1", Duration.ofSeconds(props.getAuth().getCooldown()));
        if (!Boolean.TRUE.equals(acquired)) {
            throw BizException.badRequest("验证码发送过于频繁，请稍后再试");
        }

        String dailyKey = "daily:" + channel + ":" + target + ":" + Times.shanghaiDateKey(Times.nowUtc());
        Long used = redis.opsForValue().increment(dailyKey);
        if (used != null && used == 1) {
            redis.expire(dailyKey, Duration.ofSeconds(86400));
        }
        if (used != null && used > props.getAuth().getDailyLimit()) {
            redis.delete(cooldownKey);
            throw BizException.badRequest("今日验证码发送次数已达上限");
        }

        String code = String.format("%06d", ThreadLocalRandom.current().nextInt(1000000));
        redis.opsForValue().set(
            codeKey(channel, scene, target),
            "{\"h\":\"" + hash(channel, scene, target, code) + "\",\"a\":0}",
            Duration.ofSeconds(props.getAuth().getCodeTtl()));
        return code;
    }

    public void verify(Channel channel, Scene scene, String target, String code) {
        String key = codeKey(channel, scene, target);
        String raw = redis.opsForValue().get(key);
        if (raw == null) {
            throw BizException.badRequest("验证码已失效，请重新获取");
        }
        int attempts = raw.contains("\"a\":") ? Integer.parseInt(raw.replaceAll(".*\"a\":(\\d+).*", "$1")) : 0;
        String h = raw.replaceAll(".*\"h\":\"([0-9a-f]+)\".*", "$1");

        if (attempts >= MAX_ATTEMPTS) {
            redis.delete(key);
            throw BizException.badRequest("验证码错误次数过多，请重新获取");
        }
        if (!h.equals(hash(channel, scene, target, code))) {
            Long ttl = redis.getExpire(key);
            redis.opsForValue().set(key, "{\"h\":\"" + h + "\",\"a\":" + (attempts + 1) + "}",
                Duration.ofSeconds(ttl == null || ttl < 0 ? props.getAuth().getCodeTtl() : ttl));
            throw BizException.badRequest("验证码错误");
        }
        redis.delete(key);
    }

    private String codeKey(Channel channel, Scene scene, String target) {
        return "code:" + channel + ":" + scene + ":" + target;
    }

    private String hash(Channel channel, Scene scene, String target, String code) {
        return Times.sha256Hex(channel + ":" + scene + ":" + target + ":" + code + ":" + props.getQr().getSecret());
    }
}
