package com.ifitbest.server.module.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.ifitbest.server.common.auth.AdminAuthInterceptor;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.AdminUserRepo;
import com.ifitbest.server.infra.persistence.GymRepo;
import com.ifitbest.server.infra.persistence.Org;
import com.ifitbest.server.infra.persistence.OrgRepo;
import com.ifitbest.server.infra.persistence.WriteLocks;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SystemAdminService {
    public static final Set<String> ROLES = Set.of("super", "org_admin", "gym_admin", "ops", "viewer");
    private static final Set<String> ORG_ROLES = Set.of("gym_admin", "ops", "viewer");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AdminUserRepo admins;
    private final OrgRepo orgs;
    private final GymRepo gyms;
    private final AdminAuthService auth;
    private final WriteLocks locks;
    private final SystemAudit audit;

    public SystemAdminService(AdminUserRepo admins, OrgRepo orgs, GymRepo gyms, AdminAuthService auth,
                              WriteLocks locks, SystemAudit audit) {
        this.admins = admins;
        this.orgs = orgs;
        this.gyms = gyms;
        this.auth = auth;
        this.locks = locks;
        this.audit = audit;
    }

    public static void lockAccounts(WriteLocks locks) {
        // ponytail: 账号、组织和门店维护共用事务锁，避免相互改动归属和最后一个平台账号。
        locks.acquire("admin-system", "accounts-and-organizations");
    }

    public AdminUser current(AdminPayload payload) {
        AdminUser admin = admins.findById(UUID.fromString(payload.aid())).orElse(null);
        if (!AdminAuthInterceptor.matchesSession(admin, payload)) {
            throw BizException.unauthorized("后台登录已过期");
        }
        return admin;
    }

    public static boolean platform(AdminUser actor) {
        return "super".equals(actor.getRole());
    }

    public static void requirePlatform(AdminUser actor) {
        if (!platform(actor)) throw BizException.forbidden("仅平台管理员可以执行此操作");
    }

    private static void requireManager(AdminUser actor) {
        if (!platform(actor) && !"org_admin".equals(actor.getRole())) {
            throw BizException.forbidden("没有管理账号的权限");
        }
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> accounts(AdminPayload payload) {
        AdminUser actor = current(payload);
        requireManager(actor);
        List<AdminUser> rows = platform(actor) ? admins.findAll() : admins.findByOrgId(actor.getOrgId());
        return rows.stream()
            .filter(target -> actor.getId().equals(target.getId()) || mayManage(actor, target))
            .sorted(Comparator.comparing(AdminUser::getCreatedAt).reversed())
            .map(auth::serialize).toList();
    }

    @Transactional(readOnly = true)
    public List<Org> organizations(AdminPayload payload) {
        AdminUser actor = current(payload);
        requireManager(actor);
        return platform(actor) ? orgs.findAll().stream().sorted(Comparator.comparing(Org::getName)).toList()
            : orgs.findById(actor.getOrgId()).stream().toList();
    }

    @Transactional
    public Org saveOrganization(AdminPayload payload, UUID id, String name, String code, String status) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        requirePlatform(actor);
        Org org = id == null ? new Org() : orgs.findById(id)
            .orElseThrow(() -> BizException.notFound("组织不存在"));
        if (id == null) {
            org.setId(UUID.randomUUID());
            org.setCreatedAt(Times.nowUtc());
        }
        if (orgs.findByCode(code).filter(existing -> !existing.getId().equals(org.getId())).isPresent()) {
            throw BizException.conflict("组织编码已存在");
        }
        if ("disabled".equals(status) && (admins.existsByOrgIdAndStatusIn(org.getId(), List.of("active", "pending"))
            || gyms.findByOrgId(org.getId()).stream().anyMatch(gym -> !"closed".equals(gym.getStatus())))) {
            throw BizException.conflict("请先处理组织下的有效账号和未关闭门店");
        }
        org.setName(name.trim());
        org.setCode(code);
        org.setStatus(status);
        orgs.save(org);
        audit.record(actor, org.getId(), null, id == null ? "organization.create" : "organization.update", "organization",
            org.getId().toString(), Map.of("name", org.getName(), "code", code, "status", status));
        return org;
    }

    @Transactional
    public Map<String, Object> saveAccount(AdminPayload payload, UUID id, SystemAdminController.AccountInput input) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        AdminUser target = id == null ? new AdminUser() : managedAccount(actor, id);
        requireManager(actor);
        UUID orgId = platform(actor) ? input.orgId() : actor.getOrgId();
        if (orgId == null || input.orgId() != null && !orgId.equals(input.orgId())) {
            throw BizException.forbidden("不能分配到该组织");
        }
        if (!ROLES.contains(input.role()) || !platform(actor) && !ORG_ROLES.contains(input.role())) {
            throw BizException.forbidden("不能分配该角色");
        }
        if ((input.siteEditor() || input.sitePublisher()) && (!platform(actor) || "viewer".equals(input.role()))) {
            throw BizException.forbidden("不能授予官网权限");
        }
        boolean feedbackManager = input.feedbackManager() == null ? target.isFeedbackManager() : input.feedbackManager();
        if (feedbackManager && !platform(actor)) {
            throw BizException.forbidden("仅平台管理员可以授予意见反馈菜单权限");
        }
        requireActiveOrg(orgId);
        UUID gymId = input.gymId();
        if (ORG_ROLES.contains(input.role())) {
            gyms.findById(gymIdRequired(gymId)).filter(gym -> gym.getOrgId().equals(orgId))
                .orElseThrow(() -> BizException.badRequest("门店必须属于所选组织"));
        } else if (gymId != null) {
            throw BizException.badRequest("该角色应使用组织级范围");
        }
        if (admins.findByPhone(input.phone()).filter(existing -> !existing.getId().equals(id)).isPresent()) {
            throw BizException.conflict("该手机号已用于管理账号");
        }
        if (id == null) {
            if ("super".equals(input.role())) {
                // 平台账号只有完成设密后才计入有效平台管理员。
                requirePlatform(actor);
            }
            target.setId(UUID.randomUUID());
            target.setCreatedAt(Times.nowUtc());
        } else if (!"super".equals(input.role())) {
            protectLastPlatform(target);
        }
        var before = scope(target);
        boolean accessChanged = !scopeMatches(target, orgId, gymId, input)
            || target.isFeedbackManager() != feedbackManager;
        target.setOrgId(orgId);
        target.setGymId(gymId);
        target.setName(input.name().trim());
        target.setPhone(input.phone());
        target.setRole(input.role());
        target.setSiteEditor(input.siteEditor());
        target.setSitePublisher(input.sitePublisher());
        target.setFeedbackManager(feedbackManager);
        if (id == null) {
            return issueSetup(actor, target, "account.create");
        }
        if (accessChanged) {
            invalidate(target);
            clearSetup(target);
        }
        admins.save(target);
        writeAccountAudit(actor, target, "account.update", Map.of("before", before, "after", scope(target)));
        return auth.serialize(target);
    }

    @Transactional
    public Map<String, Object> resetPassword(AdminPayload payload, UUID id) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        AdminUser target = managedAccount(actor, id);
        protectLastPlatform(target);
        requireActiveOrg(target.getOrgId());
        return issueSetup(actor, target, "account.reset-password");
    }

    @Transactional
    public Map<String, Object> setStatus(AdminPayload payload, UUID id, String status) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        AdminUser target = managedAccount(actor, id);
        String previous = target.getStatus();
        if (status.equals(previous)) return auth.serialize(target);
        if ("active".equals(status)) {
            requireActiveOrg(target.getOrgId());
            if (target.getPasswordHash().isBlank()) throw BizException.conflict("请生成设密链接以启用账号");
        } else {
            protectLastPlatform(target);
        }
        target.setStatus(status);
        clearSetup(target);
        invalidate(target);
        admins.save(target);
        writeAccountAudit(actor, target, "account.set-status", Map.of("before", previous, "after", status));
        return auth.serialize(target);
    }

    @Transactional
    public void revokeSessions(AdminPayload payload, UUID id) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        AdminUser target = managedAccount(actor, id);
        invalidate(target);
        admins.save(target);
        writeAccountAudit(actor, target, "account.revoke-sessions", Map.of());
    }

    @Transactional
    public void setup(String token, String password) {
        String digest = hash(token);
        if (!admins.existsBySetupHash(digest)) throw expiredSetup();
        lockAccounts(locks);
        var now = Times.nowUtc();
        AdminUser target = admins.findBySetupHash(digest)
            .filter(admin -> "pending".equals(admin.getStatus()) && admin.getSetupExpiresAt() != null
                && admin.getSetupExpiresAt().isAfter(now))
            .orElseThrow(SystemAdminService::expiredSetup);
        requireActiveOrg(target.getOrgId());
        target.setPasswordHash(encodePassword(password));
        target.setStatus("active");
        clearSetup(target);
        invalidate(target);
        admins.save(target);
        writeAccountAudit(target, target, "account.setup-password", Map.of());
    }

    @Transactional
    public void changePassword(AdminPayload payload, String oldPassword, String password) {
        lockAccounts(locks);
        AdminUser actor = current(payload);
        if (!AdminAuthService.BCRYPT.matches(oldPassword, actor.getPasswordHash())) {
            throw BizException.badRequest("原密码不正确");
        }
        actor.setPasswordHash(encodePassword(password));
        invalidate(actor);
        admins.save(actor);
        writeAccountAudit(actor, actor, "account.change-password", Map.of());
    }

    private Map<String, Object> issueSetup(AdminUser actor, AdminUser target, String action) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        target.setStatus("pending");
        target.setPasswordHash("");
        target.setSetupHash(hash(token));
        target.setSetupExpiresAt(Times.nowUtc().plusHours(1));
        invalidate(target);
        admins.save(target);
        writeAccountAudit(actor, target, action, scope(target));
        return Map.of("account", auth.serialize(target), "setupToken", token, "expiresAt", target.getSetupExpiresAt());
    }

    private AdminUser managedAccount(AdminUser actor, UUID id) {
        requireManager(actor);
        if (actor.getId().equals(id)) throw BizException.forbidden("请通过个人设置维护自己的密码");
        return admins.findById(id).filter(target -> mayManage(actor, target))
            .orElseThrow(() -> BizException.notFound("管理账号不存在或不在可管理范围"));
    }

    private static boolean mayManage(AdminUser actor, AdminUser target) {
        return platform(actor) || actor.getOrgId().equals(target.getOrgId()) && ORG_ROLES.contains(target.getRole())
            && !target.isSiteEditor() && !target.isSitePublisher() && !target.isFeedbackManager();
    }

    private static BizException expiredSetup() {
        return BizException.badRequest("设密链接已失效，请联系管理员");
    }

    private void protectLastPlatform(AdminUser target) {
        if (platform(target) && "active".equals(target.getStatus())
            && admins.countByRoleAndStatus("super", "active") <= 1) {
            throw BizException.conflict("必须保留至少一个有效的平台管理员");
        }
    }

    private void requireActiveOrg(UUID orgId) {
        if (orgs.findById(orgId).filter(org -> "active".equals(org.getStatus())).isEmpty()) {
            throw BizException.badRequest("组织不存在或已停用");
        }
    }

    private static UUID gymIdRequired(UUID id) {
        if (id == null) throw BizException.badRequest("请为该角色选择门店");
        return id;
    }

    private static String encodePassword(String password) {
        if (password.isBlank() || password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw BizException.badRequest("密码至少需要 12 个字符，最多 72 字节");
        }
        return AdminAuthService.BCRYPT.encode(password);
    }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void clearSetup(AdminUser target) {
        target.setSetupHash(null);
        target.setSetupExpiresAt(null);
    }

    private static void invalidate(AdminUser target) {
        target.setSessionVersion(target.getSessionVersion() + 1);
    }

    private static boolean scopeMatches(AdminUser target, UUID org, UUID gym, SystemAdminController.AccountInput input) {
        return java.util.Objects.equals(target.getOrgId(), org) && java.util.Objects.equals(target.getGymId(), gym)
            && target.getPhone().equals(input.phone()) && target.getRole().equals(input.role())
            && target.isSiteEditor() == input.siteEditor() && target.isSitePublisher() == input.sitePublisher();
    }

    private static Map<String, Object> scope(AdminUser target) {
        var fields = new java.util.LinkedHashMap<String, Object>();
        fields.put("orgId", target.getOrgId());
        fields.put("gymId", target.getGymId());
        fields.put("role", target.getRole());
        fields.put("status", target.getStatus());
        fields.put("siteEditor", target.isSiteEditor());
        fields.put("sitePublisher", target.isSitePublisher());
        fields.put("feedbackManager", target.isFeedbackManager());
        return fields;
    }

    private void writeAccountAudit(AdminUser actor, AdminUser target, String action, Map<String, ?> changes) {
        audit.record(actor, target.getOrgId(), target.getGymId(), action, "admin_account", target.getId().toString(), changes);
    }
}
