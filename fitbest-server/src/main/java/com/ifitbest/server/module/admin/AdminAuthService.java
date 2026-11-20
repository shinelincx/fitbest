package com.ifitbest.server.module.admin;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.AdminUserRepo;
import com.ifitbest.server.infra.persistence.Gym;
import com.ifitbest.server.infra.persistence.GymRepo;
import com.ifitbest.server.infra.persistence.Org;
import com.ifitbest.server.infra.persistence.OrgRepo;

/** 管理端登录 —— 独立 JWT_ADMIN 体系，输出结构一致 */
@Service
public class AdminAuthService {

    static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();

    private final AdminUserRepo admins;
    private final OrgRepo orgs;
    private final GymRepo gyms;
    private final JwtCodec jwt;

    public AdminAuthService(AdminUserRepo admins, OrgRepo orgs, GymRepo gyms, JwtCodec jwt) {
        this.admins = admins;
        this.orgs = orgs;
        this.gyms = gyms;
        this.jwt = jwt;
    }

    public Map<String, Object> serialize(AdminUser admin) {
        String orgName = orgs.findById(admin.getOrgId()).map(Org::getName).orElse(null);
        String gymName = admin.getGymId() == null ? null
            : gyms.findById(admin.getGymId()).map(Gym::getName).orElse(null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", admin.getId().toString());
        out.put("name", admin.getName());
        out.put("phone", admin.getPhone());
        out.put("role", admin.getRole());
        out.put("orgId", admin.getOrgId().toString());
        out.put("orgName", orgName);
        out.put("gymId", admin.getGymId() == null ? null : admin.getGymId().toString());
        out.put("gymName", gymName);
        out.put("status", admin.getStatus());
        out.put("siteEditor", admin.isSiteEditor());
        out.put("sitePublisher", admin.isSitePublisher());
        out.put("feedbackManager", admin.isFeedbackManager());
        out.put("createdAt", admin.getCreatedAt());
        return out;
    }

    public Map<String, Object> login(String phone, String password) {
        AdminUser admin = admins.findByPhone(phone).orElse(null);
        if (admin == null || !"active".equals(admin.getStatus())) {
            throw BizException.unauthorized("账号或密码错误");
        }
        if (!BCRYPT.matches(password, admin.getPasswordHash())) {
            throw BizException.unauthorized("账号或密码错误");
        }

        String token = jwt.signAdmin(new JwtCodec.AdminPayload(
            admin.getId().toString(), admin.getRole(), admin.getOrgId().toString(),
            admin.getGymId() == null ? null : admin.getGymId().toString(), admin.getSessionVersion()));
        return Map.of("token", token, "admin", serialize(admin));
    }

    public Map<String, Object> me(JwtCodec.AdminPayload payload) {
        AdminUser admin = admins.findById(UUID.fromString(payload.aid())).orElse(null);
        if (admin == null || !"active".equals(admin.getStatus())) {
            throw BizException.unauthorized("后台登录已过期");
        }
        return serialize(admin);
    }
}
