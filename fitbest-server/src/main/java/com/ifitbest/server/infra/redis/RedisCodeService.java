package com.ifitbest.server.infra.redis;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
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
    private static final DefaultRedisScript<Long> VERIFY = new DefaultRedisScript<>("""
        for i, key in ipairs(KEYS) do
            local raw = redis.call('GET', key)
            if not raw then return 1 end
            local state = cjson.decode(raw)
            if state.a >= tonumber(ARGV[1]) then
                redis.call('DEL', key)
                return 2
            end
            if state.h ~= ARGV[i + 1] then
                state.a = state.a + 1
                redis.call('SET', key, cjson.encode(state), 'KEEPTTL')
                return 3
            end
        end
        for _, key in ipairs(KEYS) do redis.call('DEL', key) end
        return 0
        """, Long.class);

    private final StringRedisTemplate redis;
    private final FitbestProperties props;

    public RedisCodeService(StringRedisTemplate redis, FitbestProperties props) {
        this.redis = redis;
        this.props = props;
    }

    public enum Channel { sms, email }

    public enum Scene { login, bind, security }
    public record Proof(Channel channel, Scene scene, String target, String code) {}

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
        verifyTogether(new Proof(channel, scene, target, code));
    }

    public void verifyTogether(Proof... proofs) {
        List<String> keys = new ArrayList<>(proofs.length);
        List<String> args = new ArrayList<>(proofs.length + 1);
        args.add(Integer.toString(MAX_ATTEMPTS));
        for (Proof proof : proofs) {
            keys.add(codeKey(proof.channel(), proof.scene(), proof.target()));
            args.add(hash(proof.channel(), proof.scene(), proof.target(), proof.code()));
        }
        Long result = redis.execute(VERIFY, keys, args.toArray());
        if (Long.valueOf(0).equals(result)) return;
        if (Long.valueOf(2).equals(result)) throw BizException.badRequest("验证码错误次数过多，请重新获取");
        if (Long.valueOf(3).equals(result)) throw BizException.badRequest("验证码错误");
        throw BizException.badRequest("验证码已失效，请重新获取");
    }

    private String codeKey(Channel channel, Scene scene, String target) {
        return "code:" + channel + ":" + scene + ":" + target;
    }

    private String hash(Channel channel, Scene scene, String target, String code) {
        return Times.sha256Hex(channel + ":" + scene + ":" + target + ":" + code + ":" + props.getQr().getSecret());
    }
}
