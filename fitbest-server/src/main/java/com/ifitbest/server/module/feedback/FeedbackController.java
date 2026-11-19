package com.ifitbest.server.module.feedback;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.auth.OptionalUser;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.module.feedback.FeedbackService.*;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {
    private static final int IMAGE_LIMIT = 5 * 1024 * 1024;
    private static final Map<String, String> IMAGE_TYPES = Map.of(
        "jpeg", "image/jpeg", "png", "image/png", "webp", "image/webp");
    private static final DefaultRedisScript<Long> RATE_LIMIT = new DefaultRedisScript<>("""
        local clock = redis.call('TIME')
        local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 60000)
        if redis.call('ZCARD', KEYS[1]) >= 5 then return 0 end
        redis.call('ZADD', KEYS[1], now, ARGV[1])
        redis.call('PEXPIRE', KEYS[1], 60000)
        return 1
        """, Long.class);

    private final FeedbackService feedback;
    private final StringRedisTemplate redis;
    private final Set<String> trustedProxies;

    public FeedbackController(FeedbackService feedback, StringRedisTemplate redis,
                              @Value("${fitbest.feedback.trusted-proxies:}") String trustedProxies) {
        this.feedback = feedback;
        this.redis = redis;
        this.trustedProxies = Set.copyOf(List.of(trustedProxies.trim().split("\\s*,\\s*")));
    }

    @OptionalUser
    @PostMapping(value = "/feedback", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Receipt> submit(@RequestHeader(value = "Idempotency-Key", required = false) String rawKey,
                                         @CurrentUser(required = false) UUID user,
                                         HttpServletRequest request) throws IOException, ServletException {
        if (user == null && request.getHeader("Authorization") != null) {
            throw BizException.unauthorized("登录已过期，请重新登录");
        }
        if (user == null) {
            Long allowed = redis.execute(RATE_LIMIT, List.of("fitbest:feedback:ip:" + sourceIp(request)),
                UUID.randomUUID().toString());
            if (!Long.valueOf(1).equals(allowed)) {
                throw new BizException(429, "提交过于频繁，请稍后再试");
            }
        }
        UUID key;
        try {
            if (rawKey == null || rawKey.length() != 36) {
                throw new IllegalArgumentException();
            }
            key = UUID.fromString(rawKey);
        } catch (IllegalArgumentException e) {
            throw BizException.badRequest("提交编号格式不正确");
        }

        String source = null;
        String content = null;
        List<Part> attachments = new ArrayList<>();
        for (Part part : request.getParts()) {
            switch (part.getName()) {
                case "source" -> {
                    if (source != null) throw BizException.badRequest("重复的应用来源");
                    source = text(part, 32);
                }
                case "text" -> {
                    if (content != null) throw BizException.badRequest("重复的反馈内容");
                    content = text(part, 32 * 1024).replaceAll("(?U)^[\\s\\x{FEFF}]+|[\\s\\x{FEFF}]+$", "");
                }
                case "images" -> attachments.add(part);
                default -> throw BizException.badRequest("无法识别的反馈字段");
            }
        }
        if (source == null || !FeedbackService.SOURCES.contains(source)) {
            throw BizException.badRequest("应用来源不正确");
        }
        if (content == null || content.indexOf(0) >= 0 || content.codePointCount(0, content.length()) < 5
            || content.codePointCount(0, content.length()) > 2000) {
            throw BizException.badRequest("反馈内容须为 5–2000 字");
        }
        if (attachments.size() > 3) {
            throw BizException.badRequest("最多添加 3 张图片");
        }
        List<Image> images = new ArrayList<>();
        for (Part part : attachments) {
            images.add(image(part));
        }
        return privateResponse().body(feedback.submit(source, user, key, content, images));
    }

    @AuthedAdmin
    @GetMapping("/admin/feedback")
    public ResponseEntity<Page> list(@CurrentAdmin AdminPayload actor,
            @RequestParam(required = false) String source, @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return privateResponse().body(feedback.list(actor, source, status, from, to, page, size));
    }

    @AuthedAdmin
    @GetMapping("/admin/feedback/{id}")
    public ResponseEntity<Detail> detail(@CurrentAdmin AdminPayload actor, @PathVariable UUID id) {
        return privateResponse().body(feedback.detail(actor, id));
    }

    @AuthedAdmin
    @GetMapping("/admin/feedback/{id}/attachments/{attachmentId}")
    public ResponseEntity<byte[]> attachment(@CurrentAdmin AdminPayload actor, @PathVariable UUID id,
                                             @PathVariable UUID attachmentId) {
        Image image = feedback.attachment(actor, id, attachmentId);
        return privateResponse().contentType(MediaType.parseMediaType(image.mediaType()))
            .header("X-Content-Type-Options", "nosniff").body(image.bytes());
    }

    @AuthedAdmin
    @PostMapping("/admin/feedback/{id}/actions")
    public ResponseEntity<Map<String, Long>> change(@CurrentAdmin AdminPayload actor, @PathVariable UUID id,
                                                     @RequestBody Change input) {
        return privateResponse().body(feedback.change(actor, id, input));
    }

    private static ResponseEntity.BodyBuilder privateResponse() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore());
    }

    private String sourceIp(HttpServletRequest request) {
        ServletRequest connection = request;
        while (connection instanceof ServletRequestWrapper wrapper) {
            connection = wrapper.getRequest();
        }
        String peer = connection.getRemoteAddr();
        String forwarded = request.getHeader("X-Fitbest-Client-IP");
        if (trustedProxies.contains(peer) && forwarded != null
            && forwarded.length() <= 45 && forwarded.matches("[0-9a-fA-F:.]+")) {
            return forwarded;
        }
        return peer;
    }

    private static String text(Part part, int limit) throws IOException {
        if (part.getSubmittedFileName() != null || part.getSize() > limit) {
            throw BizException.badRequest("反馈字段格式或长度不正确");
        }
        try (var stream = part.getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static Image image(Part part) throws IOException {
        if (part.getSubmittedFileName() == null || part.getSize() < 1 || part.getSize() > IMAGE_LIMIT) {
            throw BizException.badRequest("每张图片不得超过 5 MiB，且不能为空");
        }
        byte[] data;
        try (var stream = part.getInputStream()) {
            data = stream.readAllBytes();
        }
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(data))) {
            var readers = ImageIO.getImageReaders(input);
            if (readers.hasNext()) {
                var reader = readers.next();
                try {
                    String type = IMAGE_TYPES.get(reader.getFormatName().toLowerCase(Locale.ROOT));
                    if (type != null) {
                        reader.setInput(input, false, true);
                        int width = reader.getWidth(0);
                        int height = reader.getHeight(0);
                        if (width < 1 || height < 1 || (long) width * height > 25_000_000) {
                            throw BizException.badRequest("图片像素数不能超过 2500 万");
                        }
                        AtomicBoolean warning = new AtomicBoolean();
                        reader.addIIOReadWarningListener((source, message) -> warning.set(true));
                        if (reader.read(0) != null && !warning.get()) return new Image(type, data);
                    }
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException | IllegalArgumentException | IndexOutOfBoundsException e) {
            throw BizException.badRequest("图片损坏或格式不正确");
        }
        throw BizException.badRequest("仅支持有效的 JPEG、PNG 或 WebP 图片");
    }
}
