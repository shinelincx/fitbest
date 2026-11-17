package com.ifitbest.server.module.user;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Masks;
import com.ifitbest.server.common.util.Profiles;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.integration.WechatGateway;
import com.ifitbest.server.infra.persistence.IdentityType;
import com.ifitbest.server.infra.persistence.User;
import com.ifitbest.server.infra.persistence.UserCredential;
import com.ifitbest.server.infra.persistence.UserCredentialRepo;
import com.ifitbest.server.infra.persistence.UserGoal;
import com.ifitbest.server.infra.persistence.UserGoalRepo;
import com.ifitbest.server.infra.persistence.UserIdentity;
import com.ifitbest.server.infra.persistence.UserIdentityRepo;
import com.ifitbest.server.infra.persistence.UserRepo;
import com.ifitbest.server.infra.redis.RedisCodeService;
import com.ifitbest.server.module.auth.TokenService;

/** 用户域服务 —— 资料 / 目标 / 身份绑定 / 密码 / 注销，契约与 NestJS UsersService 一致 */
@Service
public class UsersService {

    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    private final UserRepo users;
    private final UserIdentityRepo identities;
    private final UserCredentialRepo credentials;
    private final UserGoalRepo goals;
    private final RedisCodeService codes;
    private final TokenService tokens;
    private final WechatGateway wechat;

    public UsersService(UserRepo users, UserIdentityRepo identities, UserCredentialRepo credentials,
                        UserGoalRepo goals, RedisCodeService codes, TokenService tokens, WechatGateway wechat) {
        this.users = users;
        this.identities = identities;
        this.credentials = credentials;
        this.goals = goals;
        this.codes = codes;
        this.tokens = tokens;
        this.wechat = wechat;
    }

    private record Profile(User user, List<UserIdentity> identityList, boolean hasPassword, UserGoal goal) {
    }

    private Profile loadUser(UUID userId) {
        User user = users.findById(userId).orElse(null);
        if (user == null || !"active".equals(user.getStatus())) {
            throw BizException.notFound("账号不存在");
        }
        return new Profile(user, identities.findByUserIdOrderByCreatedAtAsc(userId),
            credentials.existsById(userId), goals.findById(userId).orElse(null));
    }

    private Map<String, Object> build(Profile profile) {
        return Profiles.build(profile.user(), profile.identityList(), profile.hasPassword(), profile.goal());
    }

    public Map<String, Object> getMe(UUID userId) {
        return build(loadUser(userId));
    }

    @Transactional
    public Map<String, Object> updateMe(UUID userId, String nickname, String avatar, String gender,
                                        Integer birthYear, java.math.BigDecimal heightCm, java.math.BigDecimal weightKg) {
        loadUser(userId);
        User user = users.findById(userId).orElseThrow();
        if (nickname != null) {
            user.setNickname(nickname);
        }
        if (avatar != null) {
            user.setAvatar(avatar);
        }
        if (gender != null) {
            user.setGender(gender);
        }
        if (birthYear != null) {
            user.setBirthYear(birthYear);
        }
        if (heightCm != null) {
            user.setHeightCm(heightCm);
        }
        if (weightKg != null) {
            user.setWeightKg(weightKg);
        }
        user.setUpdatedAt(Times.nowUtc());
        users.save(user);
        return build(loadUser(userId));
    }

    @Transactional
    public Map<String, Object> updateGoals(UUID userId, int weeklySessions, int weeklyMinutes) {
        loadUser(userId);
        UserGoal goal = goals.findById(userId).orElseGet(() -> {
            UserGoal g = new UserGoal();
            g.setUserId(userId);
            return g;
        });
        goal.setWeeklySessions(weeklySessions);
        goal.setWeeklyMinutes(weeklyMinutes);
        goal.setUpdatedAt(Times.nowUtc());
        goals.save(goal);
        return build(loadUser(userId));
    }

    public List<Map<String, Object>> listIdentities(UUID userId) {
        return identities.findByUserIdOrderByCreatedAtAsc(userId).stream()
            .map(item -> {
                Map<String, Object> out = new LinkedHashMap<String, Object>();
                out.put("type", item.getType());
                out.put("identifier", mask(item.getType(), item.getIdentifier()));
                out.put("verifiedAt", item.getVerifiedAt());
                out.put("createdAt", item.getCreatedAt());
                return out;
            })
            .toList();
    }

    private String mask(IdentityType type, String identifier) {
        return switch (type) {
            case phone -> Masks.phone(identifier);
            case email -> Masks.email(identifier);
            case wechat -> Masks.wechat(identifier);
        };
    }

    @Transactional
    public Map<String, Object> bindPhone(UUID userId, String phone, String code) {
        codes.verify(RedisCodeService.Channel.sms, RedisCodeService.Scene.bind, phone, code);
        assertIdentifierFree(IdentityType.phone, phone, "该手机号已被其他账号绑定");
        try {
            UserIdentity identity = new UserIdentity();
            identity.setId(UUID.randomUUID());
            identity.setUserId(userId);
            identity.setType(IdentityType.phone);
            identity.setIdentifier(phone);
            identity.setVerifiedAt(Times.nowUtc());
            identity.setCreatedAt(Times.nowUtc());
            identities.save(identity);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该手机号已被其他账号绑定");
        }
        return getMe(userId);
    }

    @Transactional
    public Map<String, Object> bindEmail(UUID userId, String email, String code) {
        codes.verify(RedisCodeService.Channel.email, RedisCodeService.Scene.bind, email, code);
        assertIdentifierFree(IdentityType.email, email, "该账号已被其他用户绑定");
        try {
            UserIdentity identity = new UserIdentity();
            identity.setId(UUID.randomUUID());
            identity.setUserId(userId);
            identity.setType(IdentityType.email);
            identity.setIdentifier(email);
            identity.setVerifiedAt(Times.nowUtc());
            identity.setCreatedAt(Times.nowUtc());
            identities.save(identity);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该邮箱已被其他用户绑定");
        }
        return getMe(userId);
    }

    @Transactional
    public Map<String, Object> bindWechat(UUID userId, String code, String client) {
        WechatGateway.WechatIdentity identity = wechat.exchange(code, client == null ? "app" : client);
        String identifier = identity.unionid() != null ? identity.unionid() : identity.openid();
        UserIdentity existing = identities.findByTypeAndIdentifier(IdentityType.wechat, identifier).orElse(null);
        if (existing != null) {
            if (existing.getUserId().equals(userId)) {
                return getMe(userId);
            }
            throw BizException.conflict("该微信已绑定其他账号");
        }
        try {
            UserIdentity identityRow = new UserIdentity();
            identityRow.setId(UUID.randomUUID());
            identityRow.setUserId(userId);
            identityRow.setType(IdentityType.wechat);
            identityRow.setIdentifier(identifier);
            identityRow.setVerifiedAt(Times.nowUtc());
            identityRow.setCreatedAt(Times.nowUtc());
            identities.save(identityRow);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该微信已绑定其他账号");
        }
        return getMe(userId);
    }

    @Transactional
    public Map<String, Object> unbind(UUID userId, String type) {
        if (!"email".equals(type) && !"wechat".equals(type)) {
            throw BizException.badRequest("仅支持解绑邮箱或微信");
        }
        long total = identities.countByUserId(userId);
        if (total <= 1) {
            throw BizException.badRequest("至少保留一种登录方式");
        }
        IdentityType identityType = IdentityType.valueOf(type);
        long deleted = identities.deleteByUserIdAndType(userId, identityType);
        if (deleted == 0) {
            throw BizException.badRequest("尚未绑定该账号");
        }
        return getMe(userId);
    }

    @Transactional
    public Map<String, Object> setPassword(UUID userId, String password, String oldPassword) {
        UserCredential credential = credentials.findById(userId).orElse(null);
        if (credential != null) {
            if (oldPassword == null || oldPassword.isBlank()) {
                throw BizException.badRequest("请填写原密码");
            }
            if (!BCRYPT.matches(oldPassword, credential.getPasswordHash())) {
                throw BizException.badRequest("原密码不正确");
            }
        }
        if (credential == null) {
            credential = new UserCredential();
            credential.setUserId(userId);
        }
        credential.setPasswordHash(BCRYPT.encode(password));
        credential.setUpdatedAt(Times.nowUtc());
        credentials.save(credential);
        return Map.of("ok", true);
    }

    @Transactional
    public Map<String, Object> deleteAccount(UUID userId, String password) {
        UserCredential credential = credentials.findById(userId).orElse(null);
        if (credential != null) {
            if (password == null || password.isBlank()) {
                throw BizException.badRequest("请填写密码以确认注销");
            }
            if (!BCRYPT.matches(password, credential.getPasswordHash())) {
                throw BizException.badRequest("密码不正确");
            }
        }
        User user = users.findById(userId).orElseThrow();
        user.setStatus("deleted");
        user.setDeletedAt(Times.nowUtc());
        user.setUpdatedAt(Times.nowUtc());
        users.save(user);
        tokens.revokeAll(userId);
        return Map.of("ok", true);
    }

    private void assertIdentifierFree(IdentityType type, String identifier, String phoneMessage) {
        if (identities.findByTypeAndIdentifier(type, identifier).isPresent()) {
            throw BizException.conflict(type == IdentityType.phone ? phoneMessage : "该账号已被其他用户绑定");
        }
    }
}
