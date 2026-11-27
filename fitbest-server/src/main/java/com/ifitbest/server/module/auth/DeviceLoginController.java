package com.ifitbest.server.module.auth;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth/device-login")
public class DeviceLoginController {
    private static final DefaultRedisScript<Long> RATE_LIMIT = new DefaultRedisScript<>("""
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
        if count <= tonumber(ARGV[2]) then return 0 end
        return math.max(1, math.ceil(redis.call('PTTL', KEYS[1]) / 1000))
        """, Long.class);
    private static final String SCAN_ID_PATTERN = "[a-f0-9]{32}";
    private static final int STARTS_PER_MINUTE = 120;
    private static final int POLLS_PER_SOURCE = 120;

    public record StartBody(@Size(max = 120) @Pattern(regexp = "[^\\p{Cc}]*") String deviceName) {}
    public record MobileBody(String scanId) {}
    public record DeviceBody(String scanId, String deviceSecret) {}

    private final DeviceLoginService login;
    private final StringRedisTemplate redis;
    private final Set<String> trustedProxies;

    public DeviceLoginController(DeviceLoginService login, StringRedisTemplate redis,
                                 @Value("${FITBEST_DEVICE_LOGIN_TRUSTED_PROXIES:}") String trustedProxies) {
        this.login = login;
        this.redis = redis;
        this.trustedProxies = Set.copyOf(List.of(trustedProxies.trim().split("\\s*,\\s*")));
    }

    @PostMapping("/start")
    public ResponseEntity<?> start(@Valid @RequestBody(required = false) StartBody body, HttpServletRequest request) {
        long retry = limit("start:" + clientIp(request), 60, STARTS_PER_MINUTE);
        if (retry > 0) return throttled(retry);
        return privateResponse(login.start(body == null ? null : body.deviceName()));
    }

    @Authed
    @PostMapping("/inspect")
    public ResponseEntity<DeviceLoginService.Preview> inspect(@CurrentUser UUID user, @RequestBody MobileBody body) {
        validateId(body.scanId());
        return privateResponse(login.inspect(body.scanId(), user));
    }

    @Authed
    @PostMapping("/confirm")
    public ResponseEntity<Map<String, Boolean>> confirm(@CurrentUser UUID user, @RequestBody MobileBody body) {
        validateId(body.scanId());
        return privateResponse(login.confirm(body.scanId(), user));
    }

    @PostMapping("/poll")
    public ResponseEntity<?> poll(@RequestBody DeviceBody body, HttpServletRequest request) {
        validateDevice(body);
        String ip = clientIp(request);
        int interval = DeviceLoginService.POLL_INTERVAL_SECONDS;
        long retry = limit("poll:ip:" + ip, interval, POLLS_PER_SOURCE);
        if (retry > 0) return throttled(retry);
        String secretHash = Times.sha256Hex(body.deviceSecret());
        retry = limit("poll:request:" + body.scanId() + ":" + secretHash, interval, 3);
        if (retry > 0) return throttled(retry);
        return privateResponse(login.poll(body.scanId(), secretHash, ip));
    }

    @PostMapping("/cancel")
    public ResponseEntity<Map<String, Object>> cancel(@RequestBody DeviceBody body) {
        validateDevice(body);
        return privateResponse(login.cancel(body.scanId(), Times.sha256Hex(body.deviceSecret())));
    }

    private long limit(String name, int seconds, int count) {
        Long retry = redis.execute(RATE_LIMIT, List.of("fitbest:device-login:" + name),
            Integer.toString(seconds), Integer.toString(count));
        if (retry == null) throw new IllegalStateException("设备登录限流服务不可用");
        return retry;
    }

    private static ResponseEntity<Map<String, Object>> throttled(long retrySeconds) {
        return ResponseEntity.status(429).cacheControl(CacheControl.noStore())
            .header(HttpHeaders.RETRY_AFTER, Long.toString(retrySeconds))
            .body(Map.of("code", 429, "message", "请求过于频繁，请稍后再试"));
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private static void validateDevice(DeviceBody body) {
        validateId(body.scanId());
        if (body.deviceSecret() == null || !body.deviceSecret().matches("[a-f0-9]{64}")) {
            throw BizException.notFound("设备登录请求不存在");
        }
    }

    private static void validateId(String scanId) {
        if (scanId == null || !scanId.matches(SCAN_ID_PATTERN)) throw BizException.notFound("设备登录请求不存在");
    }

    private String clientIp(HttpServletRequest request) {
        ServletRequest connection = request;
        while (connection instanceof ServletRequestWrapper wrapper) connection = wrapper.getRequest();
        String peer = connection.getRemoteAddr();
        // The trusted Nginx overwrites X-Real-IP with its client address.
        String forwarded = request.getHeader("X-Real-IP");
        if (trustedProxies.contains(peer) && forwarded != null && forwarded.length() <= 45
            && forwarded.matches("[0-9a-fA-F:.]+")) {
            return forwarded;
        }
        return peer;
    }
}
