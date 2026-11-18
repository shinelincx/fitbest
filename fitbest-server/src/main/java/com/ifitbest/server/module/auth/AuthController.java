package com.ifitbest.server.module.auth;

import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 认证端点 —— /api/v1/auth/*，请求校验与错误文案与 NestJS auth.controller 一致 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    // ---------- 请求体 ----------

    public record SendSmsBody(
        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        String scene) {
    }

    public record SendEmailBody(
        @Email(message = "邮箱格式不正确") String email,
        String scene) {
    }

    public record SmsLoginBody(
        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code,
        @Size(max = 120) String device, boolean existingOnly) {
    }

    public record EmailLoginBody(
        @Email(message = "邮箱格式不正确") String email,
        @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code,
        @Size(max = 120) String device, boolean existingOnly) {
    }

    public record PasswordLoginBody(
        @NotBlank(message = "请填写账号") String account,
        @Size(min = 6, max = 32, message = "密码至少 6 位") String password,
        @Size(max = 120) String device) {
    }

    public record RegisterBody(
        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @Email(message = "邮箱格式不正确") String email,
        @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code,
        @Size(min = 6, max = 32, message = "密码至少 6 位") String password,
        @Size(max = 120) String device) {
    }

    public record WechatLoginBody(
        @NotBlank String code,
        String client,
        @Size(max = 120) String device) {
    }

    public record WechatPhoneBody(
        @NotBlank String bindTicket,
        @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code,
        @Size(max = 120) String device) {
    }

    public record RefreshBody(@NotBlank String refreshToken) {
    }

    public record LogoutBody(String refreshToken) {
    }

    // ---------- 端点 ----------

    @PostMapping("sms/send")
    public Map<String, Object> sendSms(@Valid @RequestBody SendSmsBody body) {
        return auth.sendSms(body.phone(), body.scene() == null ? "login" : body.scene());
    }

    @PostMapping("email/send")
    public Map<String, Object> sendEmail(@Valid @RequestBody SendEmailBody body) {
        return auth.sendEmail(body.email(), body.scene() == null ? "login" : body.scene());
    }

    @PostMapping("sms/login")
    public Map<String, Object> smsLogin(@Valid @RequestBody SmsLoginBody body, HttpServletRequest request) {
        return auth.loginWithSms(body.phone(), body.code(), body.device(), AuthService.clientIp(request), body.existingOnly());
    }

    @PostMapping("email/login")
    public Map<String, Object> emailLogin(@Valid @RequestBody EmailLoginBody body, HttpServletRequest request) {
        return auth.loginWithEmail(body.email(), body.code(), body.device(), AuthService.clientIp(request), body.existingOnly());
    }

    @PostMapping("password/login")
    public Map<String, Object> passwordLogin(@Valid @RequestBody PasswordLoginBody body, HttpServletRequest request) {
        return auth.loginWithPassword(body.account(), body.password(), body.device(), AuthService.clientIp(request));
    }

    @PostMapping("password/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterBody body, HttpServletRequest request) {
        // 跨字段规则（对应 zod refine）：手机号与邮箱需且仅需填写一个
        if ((body.phone() != null) == (body.email() != null)) {
            throw BizException.badRequest("手机号与邮箱需且仅需填写一个");
        }
        return auth.register(body.phone(), body.email(), body.code(), body.password(), body.device(), AuthService.clientIp(request));
    }

    @PostMapping("wechat/login")
    public Map<String, Object> wechatLogin(@Valid @RequestBody WechatLoginBody body, HttpServletRequest request) {
        return auth.loginWithWechat(body.code(),
            body.client() == null ? "app" : body.client(), body.device(), AuthService.clientIp(request));
    }

    @PostMapping("wechat/phone")
    public Map<String, Object> wechatPhone(@Valid @RequestBody WechatPhoneBody body, HttpServletRequest request) {
        return auth.bindWechatPhone(body.bindTicket(), body.phone(), body.code(), body.device(), AuthService.clientIp(request));
    }

    @PostMapping("refresh")
    public TokenService.TokenPair refresh(@Valid @RequestBody RefreshBody body) {
        return auth.refresh(body.refreshToken());
    }

    @PostMapping("logout")
    @Authed
    public Map<String, Object> logout(@CurrentUser UUID userId,
                                      @RequestBody(required = false) LogoutBody body) {
        return auth.logout(userId, body == null ? null : body.refreshToken());
    }
}
