package com.ifitbest.server.module.user;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.Authed;
import com.ifitbest.server.common.auth.CurrentUser;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.IdentityType;
import com.ifitbest.server.module.user.UsersService.Verification;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 用户域端点 —— /api/v1/me/**，校验与文案与 NestJS users.controller 一致 */
@RestController
@RequestMapping("/api/v1/me")
@Authed
public class MeController {

    private final UsersService users;

    public MeController(UsersService users) {
        this.users = users;
    }

    // ---------- 请求体 ----------

    public enum ProfileField { avatar, gender, birthYear, heightCm, weightKg }

    public record UpdateMeBody(
        @Size(min = 1, max = 20, message = "昵称不能为空") String nickname,
        @Size(max = 64 * 1024) String avatar,
        @Pattern(regexp = "male|female|other") String gender,
        @Min(1900) @Max(value = 2100) BigDecimal birthYear,
        @DecimalMin("50") @DecimalMax("250") BigDecimal heightCm,
        @DecimalMin("20") @DecimalMax("300") BigDecimal weightKg,
        Set<@NotNull ProfileField> clear) {
    }

    public record GoalsBody(
        @Min(0) @Max(100) BigDecimal weeklySessions,
        @Min(0) @Max(10000) BigDecimal weeklyMinutes) {
    }

    public record BindPhoneBody(
        @NotBlank @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确") String phone,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code,
        @Valid Verification verification) {
    }

    public record BindEmailBody(
        @NotBlank @Email(message = "邮箱格式不正确") String email,
        @NotBlank @Pattern(regexp = "^\\d{6}$", message = "验证码应为 6 位数字") String code) {
    }

    public record BindWechatBody(@NotBlank String code, String client) {
    }

    public record PasswordBody(
        @NotBlank @Size(min = 6, max = 32, message = "密码长度为 6 至 32 位") String password,
        @Size(min = 6, max = 32) String oldPassword) {
    }

    public record DeleteBody(
        @Size(min = 6, max = 32, message = "密码长度为 6 至 32 位") String password,
        @Valid Verification verification) {
    }

    public record RecoveryBody(
        @NotBlank @Size(min = 6, max = 32, message = "密码长度为 6 至 32 位") String password,
        @NotNull @Valid Verification verification) {
    }

    public record SecurityCodeBody(@NotNull IdentityType channel) {
    }

    @PostMapping("security/code")
    public Map<String, Object> sendSecurityCode(@CurrentUser UUID userId, @Valid @RequestBody SecurityCodeBody body) {
        return users.sendSecurityCode(userId, body.channel());
    }

    // ---------- 端点 ----------

    @GetMapping
    public Map<String, Object> getMe(@CurrentUser UUID userId) {
        return users.getMe(userId);
    }

    @PatchMapping
    public Map<String, Object> updateMe(@CurrentUser UUID userId, @Valid @RequestBody UpdateMeBody body) {
        return users.updateMe(userId, body.nickname(), body.avatar(), body.gender(),
            wholeNumber(body.birthYear()), oneDecimal(body.heightCm()), oneDecimal(body.weightKg()),
            body.clear() == null ? Set.of() : body.clear());
    }

    @PatchMapping("goals")
    public Map<String, Object> updateGoals(@CurrentUser UUID userId, @Valid @RequestBody GoalsBody body) {
        return users.updateGoals(userId, wholeNumber(body.weeklySessions()), wholeNumber(body.weeklyMinutes()));
    }

    private static Integer wholeNumber(BigDecimal value) {
        if (value == null) return null;
        try {
            return value.intValueExact();
        } catch (ArithmeticException e) {
            throw BizException.badRequest("请填写整数");
        }
    }

    private static BigDecimal oneDecimal(BigDecimal value) {
        if (value != null && value.stripTrailingZeros().scale() > 1) {
            throw BizException.badRequest("身高和体重最多保留一位小数");
        }
        return value;
    }

    @GetMapping("identities")
    public List<Map<String, Object>> listIdentities(@CurrentUser UUID userId) {
        return users.listIdentities(userId);
    }

    @PostMapping("identities/phone")
    public Map<String, Object> bindPhone(@CurrentUser UUID userId, @Valid @RequestBody BindPhoneBody body) {
        return users.bindPhone(userId, body.phone(), body.code(), body.verification());
    }

    @PutMapping("identities/phone")
    public Map<String, Object> replacePhone(@CurrentUser UUID userId, @Valid @RequestBody BindPhoneBody body) {
        return users.replacePhone(userId, body.phone(), body.code(), body.verification());
    }

    @PostMapping("identities/email")
    public Map<String, Object> bindEmail(@CurrentUser UUID userId, @Valid @RequestBody BindEmailBody body) {
        return users.bindEmail(userId, body.email(), body.code());
    }

    @PostMapping("identities/wechat")
    public Map<String, Object> bindWechat(@CurrentUser UUID userId, @Valid @RequestBody BindWechatBody body) {
        return users.bindWechat(userId, body.code(), body.client());
    }

    @DeleteMapping("identities/{type}")
    public Map<String, Object> unbind(@CurrentUser UUID userId, @PathVariable String type,
                                     @Valid @RequestBody(required = false) Verification verification) {
        return users.unbind(userId, type, verification);
    }

    @PutMapping("password")
    public Map<String, Object> setPassword(@CurrentUser UUID userId, @Valid @RequestBody PasswordBody body) {
        return users.setPassword(userId, body.password(), body.oldPassword());
    }

    @PutMapping("password/recovery")
    public Map<String, Object> recoverPassword(@CurrentUser UUID userId, @Valid @RequestBody RecoveryBody body) {
        return users.recoverPassword(userId, body.password(), body.verification());
    }

    @DeleteMapping
    public Map<String, Object> deleteAccount(@CurrentUser UUID userId,
                                             @Valid @RequestBody(required = false) DeleteBody body) {
        return users.deleteAccount(userId, body == null ? null : body.password(),
            body == null ? null : body.verification());
    }
}
