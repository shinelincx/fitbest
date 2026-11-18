package com.ifitbest.server.module.auth;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Profiles;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.integration.EmailGateway;
import com.ifitbest.server.infra.integration.SmsGateway;
import com.ifitbest.server.infra.integration.WechatGateway;
import com.ifitbest.server.infra.persistence.IdentityType;
import com.ifitbest.server.infra.persistence.MessageLog;
import com.ifitbest.server.infra.persistence.MessageLogRepo;
import com.ifitbest.server.infra.persistence.User;
import com.ifitbest.server.infra.persistence.UserCredential;
import com.ifitbest.server.infra.persistence.UserCredentialRepo;
import com.ifitbest.server.infra.persistence.UserGoal;
import com.ifitbest.server.infra.persistence.UserGoalRepo;
import com.ifitbest.server.infra.persistence.UserIdentity;
import com.ifitbest.server.infra.persistence.UserIdentityRepo;
import com.ifitbest.server.infra.persistence.UserRepo;
import com.ifitbest.server.infra.redis.RedisCodeService;
import com.ifitbest.server.infra.redis.WechatTicketStore;

import jakarta.servlet.http.HttpServletRequest;

/** 认证服务 —— 短信 / 邮箱 / 密码 / 微信登录、注册、刷新、注销，契约与 NestJS AuthService 一致 */
@Service
public class AuthService {

    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    private final UserRepo users;
    private final UserIdentityRepo identities;
    private final UserCredentialRepo credentials;
    private final UserGoalRepo goals;
    private final MessageLogRepo messageLogs;
    private final RedisCodeService codes;
    private final TokenService tokens;
    private final SmsGateway sms;
    private final EmailGateway email;
    private final WechatGateway wechat;
    private final WechatTicketStore ticketStore;
    private final FitbestProperties props;

    public AuthService(UserRepo users, UserIdentityRepo identities,
                       UserCredentialRepo credentials,
                       UserGoalRepo goals, MessageLogRepo messageLogs,
                       RedisCodeService codes, TokenService tokens,
                       SmsGateway sms, EmailGateway email, WechatGateway wechat,
                       WechatTicketStore ticketStore, FitbestProperties props) {
        this.users = users;
        this.identities = identities;
        this.credentials = credentials;
        this.goals = goals;
        this.messageLogs = messageLogs;
        this.codes = codes;
        this.tokens = tokens;
        this.sms = sms;
        this.email = email;
        this.wechat = wechat;
        this.ticketStore = ticketStore;
        this.props = props;
    }

    // ---------- 验证码发送 ----------

    public Map<String, Object> sendSms(String phone, String scene) {
        return sendSms(phone, scene(scene));
    }

    private Map<String, Object> sendSms(String phone, RedisCodeService.Scene purpose) {
        String code = codes.issue(RedisCodeService.Channel.sms, purpose, phone);
        String scene = purpose.name();
        String templateScene = purpose == RedisCodeService.Scene.login ? "login" : "bind";
        String template = "bind".equals(templateScene) ? props.getAliyun().getSmsTemplateBind() : props.getAliyun().getSmsTemplateLogin();
        try {
            SmsGateway.SendResult result = sms.sendCode(phone, code, templateScene);
            logMessage("sms", phone, scene, template, result.providerMsgId(), result.dev() ? "dev" : "sent", null);
            if (result.dev() && !devCodeVisible(phone)) {
                throw BizException.badRequest("短信服务尚未配置，当前仅支持测试号码登录");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("sent", true);
            out.put("cooldown", props.getAuth().getCooldown());
            out.put("expiresIn", props.getAuth().getCodeTtl());
            if (result.dev() && devCodeVisible(phone)) {
                out.put("devCode", code);
            }
            return out;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            logMessage("sms", phone, scene, template, null, "failed", e.getMessage());
            throw BizException.badRequest("短信发送失败，请稍后重试");
        }
    }

    public Map<String, Object> sendEmail(String emailAddr, String scene) {
        return sendEmail(emailAddr, scene(scene));
    }

    private Map<String, Object> sendEmail(String emailAddr, RedisCodeService.Scene purpose) {
        String code = codes.issue(RedisCodeService.Channel.email, purpose, emailAddr);
        String scene = purpose.name();
        try {
            EmailGateway.SendResult result = email.sendCode(emailAddr, code);
            logMessage("email", emailAddr, scene, "FITBEST_LOGIN_CODE", result.providerMsgId(), result.dev() ? "dev" : "sent", null);
            if (result.dev() && !devCodeVisible(emailAddr)) {
                throw BizException.badRequest("邮件服务尚未配置，请使用其他登录方式");
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("sent", true);
            out.put("cooldown", props.getAuth().getCooldown());
            out.put("expiresIn", props.getAuth().getCodeTtl());
            if (result.dev() && devCodeVisible(emailAddr)) {
                out.put("devCode", code);
            }
            return out;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            logMessage("email", emailAddr, scene, "FITBEST_LOGIN_CODE", null, "failed", e.getMessage());
            throw BizException.badRequest("邮件发送失败，请稍后重试");
        }
    }

    public Map<String, Object> sendSecurityCode(IdentityType type, String target) {
        return switch (type) {
            case phone -> sendSms(target, RedisCodeService.Scene.security);
            case email -> sendEmail(target, RedisCodeService.Scene.security);
            default -> throw BizException.badRequest("请选择已验证的手机号或邮箱");
        };
    }

    private boolean devCodeVisible(String target) {
        if (props.isProd()) return false;
        if (props.getAuth().isDevReturnCode()) {
            return true;
        }
        return props.getAuth().getDevPhoneAllowlist().contains(target);
    }

    private void logMessage(String channel, String target, String scene, String template,
                           String providerMsgId, String status, String error) {
        try {
            MessageLog log = new MessageLog();
            log.setId(UUID.randomUUID().toString());
            log.setChannel(channel);
            log.setTarget(target);
            log.setScene(scene);
            log.setTemplate(template);
            log.setProviderMsgId(providerMsgId);
            log.setStatus(status);
            log.setError(error);
            log.setCreatedAt(Times.nowUtc());
            messageLogs.save(log);
        } catch (Exception ignored) {
            // 日志失败不影响主流程
        }
    }

    // ---------- 用户查找 / 创建 ----------

    private record UserWithProfile(User user, List<UserIdentity> identities, boolean hasPassword, UserGoal goal) {
    }

    private UserWithProfile loadProfile(UUID userId) {
        User user = users.findById(userId).orElse(null);
        if (user == null) {
            return null;
        }
        List<UserIdentity> ids = identities.findByUserIdOrderByCreatedAtAsc(userId);
        boolean hasPassword = credentials.existsById(userId);
        UserGoal goal = goals.findById(userId).orElse(null);
        return new UserWithProfile(user, ids, hasPassword, goal);
    }

    private UserWithProfile findUser(IdentityType type, String identifier) {
        Optional<UserIdentity> identity = identities.findByTypeAndIdentifier(type, identifier);
        if (identity.isEmpty()) {
            return null;
        }
        UserWithProfile profile = loadProfile(identity.get().getUserId());
        if (profile == null) {
            return null;
        }
        if (!"active".equals(profile.user().getStatus())) {
            throw BizException.unauthorized("该账号已注销");
        }
        return profile;
    }

    @Transactional
    public UserWithProfile ensureUser(IdentityType type, String identifier, String nickname) {
        UserWithProfile found = findUser(type, identifier);
        if (found != null) {
            return found;
        }
        try {
            User user = createUser(nickname, List.of(newIdentity(type, identifier)), null);
            return loadProfile(user.getId());
        } catch (DataIntegrityViolationException e) {
            UserWithProfile retry = findUser(type, identifier);
            if (retry != null) {
                return retry;
            }
            throw e;
        }
    }

    private User createUser(String nickname, List<UserIdentity> identityList, String passwordHash) {
        Times.nowUtc();
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setNickname(nickname);
        user.setCreatedAt(Times.nowUtc());
        user.setUpdatedAt(Times.nowUtc());
        users.save(user);

        for (UserIdentity identity : identityList) {
            identity.setUserId(user.getId());
            identity.setCreatedAt(Times.nowUtc());
            identities.save(identity);
        }
        if (passwordHash != null) {
            UserCredential credential = new UserCredential();
            credential.setUserId(user.getId());
            credential.setPasswordHash(passwordHash);
            credential.setUpdatedAt(Times.nowUtc());
            credentials.save(credential);
        }
        UserGoal goal = new UserGoal();
        goal.setUserId(user.getId());
        goal.setUpdatedAt(Times.nowUtc());
        goals.save(goal);
        return user;
    }

    private UserIdentity newIdentity(IdentityType type, String identifier) {
        UserIdentity identity = new UserIdentity();
        identity.setId(UUID.randomUUID());
        identity.setType(type);
        identity.setIdentifier(identifier);
        identity.setVerifiedAt(Times.nowUtc());
        return identity;
    }

    // ---------- 登录 / 注册 ----------

    private Map<String, Object> finishLogin(UUID userId, String device, String ip) {
        TokenService.TokenPair pair = tokens.issue(userId, device, ip);
        UserWithProfile profile = loadProfile(userId);
        if (profile == null) {
            throw BizException.unauthorized("账号不存在");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("accessToken", pair.accessToken());
        out.put("refreshToken", pair.refreshToken());
        out.put("user", Profiles.build(profile.user(), profile.identities(), profile.hasPassword(), profile.goal()));
        return out;
    }

    @Transactional
    public Map<String, Object> loginWithSms(String phone, String code, String device, String ip) {
        codes.verify(RedisCodeService.Channel.sms, RedisCodeService.Scene.login, phone, code);
        UserWithProfile user = ensureUser(IdentityType.phone, phone, "训练者" + phone.substring(phone.length() - 4));
        return finishLogin(user.user().getId(), device, ip);
    }

    @Transactional
    public Map<String, Object> loginWithEmail(String emailAddr, String code, String device, String ip) {
        codes.verify(RedisCodeService.Channel.email, RedisCodeService.Scene.login, emailAddr, code);
        String nickname = emailAddr.split("@")[0];
        if (nickname.isBlank()) {
            nickname = "训练者";
        }
        UserWithProfile user = ensureUser(IdentityType.email, emailAddr, nickname);
        return finishLogin(user.user().getId(), device, ip);
    }

    @Transactional
    public Map<String, Object> loginWithPassword(String account, String password, String device, String ip) {
        IdentityType type = account.contains("@") ? IdentityType.email : IdentityType.phone;
        UserWithProfile user = findUser(type, account);
        if (user == null) {
            throw BizException.unauthorized("账号或密码错误");
        }
        UserCredential credential = credentials.findById(user.user().getId()).orElse(null);
        if (credential == null) {
            throw BizException.badRequest("该账号未设置密码，请使用验证码登录");
        }
        if (!BCRYPT.matches(password, credential.getPasswordHash())) {
            throw BizException.unauthorized("账号或密码错误");
        }
        return finishLogin(user.user().getId(), device, ip);
    }

    @Transactional
    public Map<String, Object> register(String phone, String emailAddr, String code, String password, String device, String ip) {
        IdentityType type = phone != null ? IdentityType.phone : IdentityType.email;
        String identifier = phone != null ? phone : emailAddr;
        if (identifier == null || identifier.isBlank()) {
            throw BizException.badRequest("请填写手机号或邮箱");
        }
        codes.verify(type == IdentityType.phone ? RedisCodeService.Channel.sms : RedisCodeService.Channel.email,
            RedisCodeService.Scene.login, identifier, code);
        if (findUser(type, identifier) != null) {
            throw BizException.conflict("该账号已注册，请直接登录");
        }
        String nickname = type == IdentityType.phone
            ? "训练者" + identifier.substring(identifier.length() - 4)
            : (identifier.split("@")[0].isBlank() ? "训练者" : identifier.split("@")[0]);
        try {
            User user = createUser(nickname, List.of(newIdentity(type, identifier)), BCRYPT.encode(password));
            return finishLogin(user.getId(), device, ip);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该账号已注册，请直接登录");
        }
    }

    @Transactional
    public Map<String, Object> loginWithWechat(String code, String client, String device, String ip) {
        WechatGateway.WechatIdentity identity = wechat.exchange(code, client);
        String identifier = identity.unionid() != null ? identity.unionid() : identity.openid();
        UserWithProfile user = findUser(IdentityType.wechat, identifier);
        if (user != null) {
            return finishLogin(user.user().getId(), device, ip);
        }
        String bindTicket = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        ticketStore.save(bindTicket, new WechatTicketStore.Ticket(identifier, identity.nickname()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("needBindPhone", true);
        out.put("bindTicket", bindTicket);
        return out;
    }

    @Transactional
    public Map<String, Object> bindWechatPhone(String bindTicket, String phone, String code, String device, String ip) {
        codes.verify(RedisCodeService.Channel.sms, RedisCodeService.Scene.bind, phone, code);
        WechatTicketStore.Ticket ticket = ticketStore.get(bindTicket);
        if (ticket == null) {
            throw BizException.badRequest("绑定已过期，请重新授权微信登录");
        }

        UserWithProfile existingWechat = findUser(IdentityType.wechat, ticket.identifier());
        if (existingWechat != null) {
            ticketStore.delete(bindTicket);
            return finishLogin(existingWechat.user().getId(), device, ip);
        }

        UserWithProfile phoneUser = findUser(IdentityType.phone, phone);
        if (phoneUser != null) {
            boolean hasWechat = phoneUser.identities().stream().anyMatch(i -> i.getType() == IdentityType.wechat);
            if (hasWechat) {
                throw BizException.conflict("该手机号已绑定其他微信账号");
            }
            try {
                UserIdentity identity = newIdentity(IdentityType.wechat, ticket.identifier());
                identity.setUserId(phoneUser.user().getId());
                identities.save(identity);
            } catch (DataIntegrityViolationException e) {
                throw BizException.conflict("该微信已绑定其他账号");
            }
            ticketStore.delete(bindTicket);
            return finishLogin(phoneUser.user().getId(), device, ip);
        }

        try {
            String nickname = ticket.nickname() != null && !ticket.nickname().trim().isEmpty()
                ? ticket.nickname().trim()
                : "训练者" + phone.substring(phone.length() - 4);
            List<UserIdentity> identityList = new ArrayList<>();
            identityList.add(newIdentity(IdentityType.phone, phone));
            identityList.add(newIdentity(IdentityType.wechat, ticket.identifier()));
            User user = createUser(nickname, identityList, null);
            ticketStore.delete(bindTicket);
            return finishLogin(user.getId(), device, ip);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该账号已被绑定，请重新登录");
        }
    }

    public TokenService.TokenPair refresh(String refreshToken) {
        return tokens.rotate(refreshToken);
    }

    @Transactional
    public Map<String, Object> logout(UUID userId, String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            tokens.revokeByToken(refreshToken);
        } else {
            tokens.revokeAll(userId);
        }
        return Map.of("ok", true);
    }

    public Map<String, Object> me(UUID userId) {
        UserWithProfile profile = loadProfile(userId);
        if (profile == null) {
            throw BizException.unauthorized("账号不存在");
        }
        if (!"active".equals(profile.user().getStatus())) {
            throw BizException.unauthorized("该账号已注销");
        }
        return Profiles.build(profile.user(), profile.identities(), profile.hasPassword(), profile.goal());
    }

    private RedisCodeService.Scene scene(String scene) {
        return "bind".equals(scene) ? RedisCodeService.Scene.bind : RedisCodeService.Scene.login;
    }

    public static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
