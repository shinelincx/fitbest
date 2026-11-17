package com.ifitbest.server.module.admin;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

/** 管理端登录端点 —— POST /api/v1/admin/auth/login（公开）、GET /api/v1/admin/me（需登录） */
@RestController
public class AdminAuthController {

    private final AdminAuthService auth;

    public AdminAuthController(AdminAuthService auth) {
        this.auth = auth;
    }

    public record LoginBody(@NotBlank String phone, @NotBlank String password) {
    }

    @PostMapping("/api/v1/admin/auth/login")
    public Map<String, Object> login(@Valid @RequestBody LoginBody body) {
        return auth.login(body.phone(), body.password());
    }

    @AuthedAdmin
    @GetMapping("/api/v1/admin/me")
    public Map<String, Object> me(@CurrentAdmin JwtCodec.AdminPayload payload) {
        return auth.me(payload);
    }
}
