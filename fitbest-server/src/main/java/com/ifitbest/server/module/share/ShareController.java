package com.ifitbest.server.module.share;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;

/** 分享端点 —— /api/v1/share（登录）+ /s/{code}（公开 SSR） */
@RestController
public class ShareController {

    private final ShareService share;

    public ShareController(ShareService share) {
        this.share = share;
    }

    public record ShareBody(UUID sessionId, Map<String, Object> weeklyPayload) {
    }

    @Authed
    @PostMapping("/api/v1/share")
    public Map<String, Object> create(@CurrentUser UUID userId, @RequestBody ShareBody body) {
        if (body.sessionId() == null && body.weeklyPayload() == null) {
            throw BizException.badRequest("请提供训练记录或周报数据");
        }
        return share.create(userId, body.sessionId(), body.weeklyPayload());
    }

    @GetMapping("/s/{code}")
    public ResponseEntity<String> view(@PathVariable String code) {
        // 与 Express res.type('html') 行为一致：text/html; charset=utf-8
        org.springframework.http.MediaType htmlUtf8 =
            org.springframework.http.MediaType.parseMediaType("text/html;charset=UTF-8");
        String html = share.view(code);
        if (html == null) {
            return ResponseEntity.status(404).contentType(htmlUtf8).body("<h1>分享已失效</h1>");
        }
        return ResponseEntity.ok().contentType(htmlUtf8).body(html);
    }
}
