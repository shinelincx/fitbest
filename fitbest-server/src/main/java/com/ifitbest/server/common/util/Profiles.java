package com.ifitbest.server.common.util;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.ifitbest.server.infra.persistence.User;
import com.ifitbest.server.infra.persistence.UserGoal;
import com.ifitbest.server.infra.persistence.UserIdentity;
import com.ifitbest.server.infra.persistence.IdentityType;

/** 用户档案序列化 —— 与 NestJS common/profile.ts buildProfile 输出字段完全一致 */
public final class Profiles {

    private Profiles() {
    }

    public static Map<String, Object> build(User user, List<UserIdentity> identities, boolean hasPassword, UserGoal goal) {
        String phone = firstIdentifier(identities, IdentityType.phone);
        String email = firstIdentifier(identities, IdentityType.email);
        String wechat = firstIdentifier(identities, IdentityType.wechat);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", user.getId());
        out.put("nickname", user.getNickname());
        out.put("avatar", user.getAvatar());
        out.put("gender", user.getGender());
        out.put("birthYear", user.getBirthYear());
        out.put("heightCm", user.getHeightCm() == null ? null : user.getHeightCm().doubleValue());
        out.put("weightKg", user.getWeightKg() == null ? null : user.getWeightKg().doubleValue());
        Map<String, Object> ids = new LinkedHashMap<>();
        ids.put("phone", phone == null ? null : Masks.phone(phone));
        ids.put("email", email == null ? null : Masks.email(email));
        ids.put("wechat", wechat == null ? null : Masks.wechat(wechat));
        out.put("identities", ids);
        out.put("hasPassword", hasPassword);
        Map<String, Object> goals = new LinkedHashMap<>();
        goals.put("weeklySessions", goal == null ? 0 : goal.getWeeklySessions());
        goals.put("weeklyMinutes", goal == null ? 0 : goal.getWeeklyMinutes());
        out.put("goals", goals);
        return out;
    }

    public static String firstIdentifier(List<UserIdentity> identities, IdentityType type) {
        return identities.stream()
            .filter(i -> i.getType() == type)
            .map(UserIdentity::getIdentifier)
            .findFirst()
            .orElse(null);
    }
}
