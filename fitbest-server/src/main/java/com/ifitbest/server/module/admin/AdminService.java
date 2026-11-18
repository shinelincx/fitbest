package com.ifitbest.server.module.admin;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Masks;
import com.ifitbest.server.common.util.QrTokens;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.AuditLog;
import com.ifitbest.server.infra.persistence.AuditLogRepo;
import com.ifitbest.server.infra.persistence.AdminUserRepo;
import com.ifitbest.server.infra.persistence.Device;
import com.ifitbest.server.infra.persistence.DeviceRepo;
import com.ifitbest.server.infra.persistence.DeviceSegmentRepo;
import com.ifitbest.server.infra.persistence.DeviceSession;
import com.ifitbest.server.infra.persistence.DeviceSessionRepo;
import com.ifitbest.server.infra.persistence.EventLink;
import com.ifitbest.server.infra.persistence.EventLinkRepo;
import com.ifitbest.server.infra.persistence.EventRegistration;
import com.ifitbest.server.infra.persistence.EventRegistrationRepo;
import com.ifitbest.server.infra.persistence.Gym;
import com.ifitbest.server.infra.persistence.GymRepo;
import com.ifitbest.server.infra.persistence.Machine;
import com.ifitbest.server.infra.persistence.MachineModel;
import com.ifitbest.server.infra.persistence.MachineModelRepo;
import com.ifitbest.server.infra.persistence.MachineRepo;
import com.ifitbest.server.infra.persistence.MachineStatus;
import com.ifitbest.server.infra.persistence.MachineTag;
import com.ifitbest.server.infra.persistence.MachineTagRepo;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.infra.persistence.Org;
import com.ifitbest.server.infra.persistence.OrgRepo;
import com.ifitbest.server.infra.persistence.Session;
import com.ifitbest.server.infra.persistence.SessionRepo;
import com.ifitbest.server.infra.persistence.TagStatus;
import com.ifitbest.server.infra.persistence.TagType;
import com.ifitbest.server.infra.persistence.TrainingRecord;
import com.ifitbest.server.infra.persistence.TrainingRecordRepo;
import com.ifitbest.server.infra.persistence.User;
import com.ifitbest.server.infra.persistence.UserGoal;
import com.ifitbest.server.infra.persistence.UserGoalRepo;
import com.ifitbest.server.infra.persistence.UserIdentity;
import com.ifitbest.server.infra.persistence.UserIdentityRepo;
import com.ifitbest.server.infra.persistence.UserRepo;
import com.ifitbest.server.infra.persistence.WriteLocks;
import com.ifitbest.server.module.event.EventsService;
import com.ifitbest.server.module.record.RecordsService;

/** 管理端聚合服务 —— 数据域隔离（super/org/gym 三级）+ 主数据维护，响应结构逐字段对齐 NestJS */
@Service
public class AdminService {

    private final UserRepo users;
    private final UserIdentityRepo identities;
    private final UserGoalRepo goals;
    private final SessionRepo sessions;
    private final MachineRepo machines;
    private final MachineModelRepo machineModels;
    private final MachineTagRepo tags;
    private final GymRepo gyms;
    private final OrgRepo orgs;
    private final EventLinkRepo events;
    private final EventRegistrationRepo registrations;
    private final AuditLogRepo auditLogs;
    private final TrainingRecordRepo trainingRecords;
    private final DeviceSessionRepo deviceSessions;
    private final DeviceSegmentRepo deviceSegments;
    private final DeviceRepo devices;
    private final FitbestProperties props;
    private final WriteLocks locks;
    private final AdminUserRepo admins;
    private final CatalogService catalog;

    public AdminService(UserRepo users, UserIdentityRepo identities, UserGoalRepo goals,
                        SessionRepo sessions, MachineRepo machines, MachineModelRepo machineModels,
                        MachineTagRepo tags, GymRepo gyms, OrgRepo orgs,
                        EventLinkRepo events, EventRegistrationRepo registrations,
                        AuditLogRepo auditLogs, TrainingRecordRepo trainingRecords,
                        DeviceSessionRepo deviceSessions, DeviceSegmentRepo deviceSegments,
                        DeviceRepo devices, FitbestProperties props, WriteLocks locks,
                        AdminUserRepo admins, CatalogService catalog) {
        this.users = users;
        this.identities = identities;
        this.goals = goals;
        this.sessions = sessions;
        this.machines = machines;
        this.machineModels = machineModels;
        this.tags = tags;
        this.gyms = gyms;
        this.orgs = orgs;
        this.events = events;
        this.registrations = registrations;
        this.auditLogs = auditLogs;
        this.trainingRecords = trainingRecords;
        this.deviceSessions = deviceSessions;
        this.deviceSegments = deviceSegments;
        this.devices = devices;
        this.props = props;
        this.locks = locks;
        this.admins = admins;
        this.catalog = catalog;
    }

    // ---------- 租户域（对应 NestJS tenant.ts） ----------

    private boolean isSuper(JwtCodec.AdminPayload admin) {
        return "super".equals(admin.role());
    }

    private UUID adminOrgId(JwtCodec.AdminPayload admin) {
        return UUID.fromString(admin.orgId());
    }

    private UUID adminGymId(JwtCodec.AdminPayload admin) {
        return admin.gymId() == null ? null : UUID.fromString(admin.gymId());
    }

    /** 可见门店集合；null = 全部（super） */
    private List<UUID> scopeGymIds(JwtCodec.AdminPayload admin) {
        if (isSuper(admin)) {
            return null;
        }
        if ("org_admin".equals(admin.role())) {
            return gyms.findByOrgId(adminOrgId(admin)).stream().map(Gym::getId).toList();
        }
        UUID gymId = adminGymId(admin);
        return gymId == null ? List.of() : List.of(gymId);
    }

    /** 可见用户集合（在可见门店有训练记录的用户）；null = 全部 */
    private Set<UUID> scopeUserIds(JwtCodec.AdminPayload admin) {
        List<UUID> gymIds = scopeGymIds(admin);
        if (gymIds == null) {
            return null;
        }
        Set<UUID> ids = new HashSet<>();
        if (!gymIds.isEmpty()) {
            sessions.findByGymIdInAndStartedAtGreaterThanEqual(gymIds, LocalDateTime.of(1970, 1, 1, 0, 0))
                .forEach(s -> ids.add(s.getUserId()));
        }
        return ids;
    }

    private boolean inMachineScope(JwtCodec.AdminPayload admin, Machine machine) {
        if (isSuper(admin)) {
            return true;
        }
        if ("org_admin".equals(admin.role())) {
            return machine.getOrgId().equals(adminOrgId(admin));
        }
        UUID gymId = adminGymId(admin);
        return gymId != null && gymId.equals(machine.getGymId());
    }

    private boolean inGymScope(JwtCodec.AdminPayload admin, Gym gym) {
        if (isSuper(admin)) {
            return true;
        }
        if ("org_admin".equals(admin.role())) {
            return gym.getOrgId().equals(adminOrgId(admin));
        }
        UUID gymId = adminGymId(admin);
        return gymId != null && gym.getId().equals(gymId);
    }

    private boolean inEventScope(JwtCodec.AdminPayload admin, EventLink event) {
        if (isSuper(admin)) {
            return true;
        }
        return event.getOrgId() != null && event.getOrgId().equals(adminOrgId(admin));
    }

    private UUID resolveOrgId(JwtCodec.AdminPayload admin, UUID inputOrgId) {
        if (isSuper(admin)) {
            return inputOrgId != null ? inputOrgId : adminOrgId(admin);
        }
        return adminOrgId(admin);
    }

    private UUID resolveWritableGymId(JwtCodec.AdminPayload admin, UUID inputGymId) {
        if (isSuper(admin) || "org_admin".equals(admin.role())) {
            return inputGymId;
        }
        return adminGymId(admin);
    }

    // ---------- 分页 / 序列化工具 ----------

    private static int[] pageParams(String page, String pageSize) {
        int current = Math.max(1, parseInt(page, 1));
        int size = Math.min(5000, Math.max(1, parseInt(pageSize, 20)));
        return new int[]{current, size};
    }

    private static PageRequest newestFirst(int[] paging, String timestamp) {
        return PageRequest.of(paging[0] - 1, paging[1],
            Sort.by(Sort.Order.desc(timestamp), Sort.Order.desc("id")));
    }

    private static <T> Map<UUID, T> indexById(List<T> rows, Function<T, UUID> id) {
        return rows.stream().collect(Collectors.toMap(id, Function.identity()));
    }

    private static String nickname(Map<UUID, User> rows, UUID id) {
        User user = rows.get(id);
        return user == null ? "" : user.getNickname();
    }

    private static int parseInt(String value, int fallback) {
        try {
            return Integer.parseInt(value);
        } catch (Exception e) {
            return fallback;
        }
    }

    private static LocalDateTime parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            if (isCalendarDate(value)) return LocalDate.parse(value.trim()).atStartOfDay();
            return com.ifitbest.server.config.JacksonConfig.parseIso(value);
        } catch (Exception e) {
            throw BizException.badRequest("时间格式不正确");
        }
    }

    private static boolean isCalendarDate(String value) {
        return value != null && value.trim().matches("\\d{4}-\\d{2}-\\d{2}");
    }

    private static void addDateRange(List<Predicate> predicates, CriteriaBuilder cb, Root<?> root,
                                     String fieldName, String from, String to) {
        LocalDateTime fromDate = parseDate(from);
        LocalDateTime toDate = parseDate(to);
        if (fromDate == null && toDate == null) return;
        Path<LocalDateTime> field = root.get(fieldName);
        if (fromDate != null) predicates.add(cb.greaterThanOrEqualTo(field, fromDate));
        if (toDate != null) {
            predicates.add(isCalendarDate(to)
                ? cb.lessThan(field, toDate.plusDays(1))
                : cb.lessThanOrEqualTo(field, toDate));
        }
    }

    private static String normalizeApp(String value) {
        String v = value == null ? "" : value.trim().toLowerCase();
        return "hyrox".equals(v) || "btwe".equals(v) ? v : null;
    }

    private String mask(String type, String identifier) {
        return switch (type) {
            case "phone" -> Masks.phone(identifier);
            case "email" -> Masks.email(identifier);
            default -> Masks.wechat(identifier);
        };
    }

    private Gym machineGym(Machine machine) {
        return machine.getGymId() == null ? null : gyms.findById(machine.getGymId()).orElse(null);
    }

    private Map<String, Object> machineView(Machine machine, MachineModel model, Gym gym) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", machine.getId().toString());
        out.put("type", model.getType().name());
        out.put("model", model.getModel());
        out.put("brand", model.getBrand());
        out.put("name", (model.getBrand() != null ? model.getBrand() + " " : "") + model.getModel());
        out.put("modelId", machine.getModelId().toString());
        out.put("serialNo", machine.getSerialNo());
        out.put("status", machine.getStatus().name());
        out.put("firmware", machine.getFirmware());
        out.put("gymId", java.util.Objects.toString(machine.getGymId(), null));
        out.put("gymName", gym == null ? null : gym.getName());
        out.put("createdAt", machine.getCreatedAt());
        return out;
    }

    private Map<String, Object> tagView(MachineTag tag) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", tag.getId().toString());
        out.put("tagType", tag.getTagType().name());
        out.put("tagValue", tag.getTagValue());
        out.put("status", tag.getStatus().name());
        out.put("printedAt", tag.getPrintedAt());
        out.put("createdAt", tag.getCreatedAt());
        return out;
    }

    private Machine lookupMachineInScope(JwtCodec.AdminPayload admin, UUID machineId) {
        Machine machine = machines.findById(machineId).orElse(null);
        if (machine == null || !inMachineScope(admin, machine)) {
            throw BizException.notFound("器械不存在");
        }
        return machine;
    }

    // ---------- overview ----------

    @Transactional(readOnly = true)
    public Map<String, Object> overview(JwtCodec.AdminPayload admin, String app) {
        String normalizedApp = normalizeApp(app);
        LocalDateTime today = Times.dayStartShanghai();
        LocalDateTime weekStart = Times.weekStartShanghai();
        List<UUID> gymScope = scopeGymIds(admin);
        Set<UUID> userScope = scopeUserIds(admin);

        final Set<UUID> appUserIds;
        if (normalizedApp != null) {
            appUserIds = new HashSet<>();
            trainingRecords.findByApp(normalizedApp).forEach(r -> appUserIds.add(r.getUserId()));
        } else {
            appUserIds = null;
        }

        List<Session> weekSessions = gymScope == null
            ? sessions.findByStartedAtGreaterThanEqual(weekStart)
            : (gymScope.isEmpty() ? List.of() : sessions.findByGymIdInAndStartedAtGreaterThanEqual(gymScope, weekStart));

        long usersCount;
        if (userScope == null) {
            usersCount = appUserIds == null
                ? users.count((root, query, cb) -> cb.equal(root.get("status"), "active"))
                : users.count((root, query, cb) -> cb.and(
                    cb.equal(root.get("status"), "active"),
                    appUserIds.isEmpty() ? cb.disjunction() : root.get("id").in(appUserIds)));
        } else {
            Set<UUID> finalIds = appUserIds == null ? userScope : intersect(userScope, appUserIds);
            usersCount = finalIds.isEmpty() ? 0
                : users.count((root, query, cb) -> cb.and(
                    cb.equal(root.get("status"), "active"), root.get("id").in(finalIds)));
        }

        long sessionsToday = weekSessions.stream().filter(s -> !s.getStartedAt().isBefore(today)).count();

        long activeMachines = machines.findAll().stream()
            .filter(m -> m.getStatus() == MachineStatus.active)
            .filter(m -> inMachineScope(admin, m))
            .count();

        long gymsCount;
        if (isSuper(admin)) {
            gymsCount = gyms.count();
        } else if ("org_admin".equals(admin.role())) {
            gymsCount = gyms.findByOrgId(adminOrgId(admin)).size();
        } else {
            gymsCount = adminGymId(admin) == null ? 0 : 1;
        }

        Map<String, Integer> typeCounts = new LinkedHashMap<>();
        for (Session s : weekSessions) {
            typeCounts.merge(s.getMachineType().name(), 1, Integer::sum);
        }
        List<Map<String, Object>> byType = typeCounts.entrySet().stream()
            .map(e -> Map.<String, Object>of("type", e.getKey(), "sessions", e.getValue()))
            .toList();

        Long trainingRecordsTotal = null;
        Long trainingTotalSec = null;
        Long trainingTotalDistanceM = null;
        if (normalizedApp != null) {
            List<TrainingRecord> rows = trainingRecords.findByApp(normalizedApp);
            trainingRecordsTotal = (long) rows.size();
            trainingTotalSec = rows.stream().mapToLong(TrainingRecord::getTotalTimeSec).sum();
            trainingTotalDistanceM = rows.stream().mapToLong(TrainingRecord::getDistanceM).sum();
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("users", usersCount);
        out.put("sessionsToday", sessionsToday);
        out.put("sessionsThisWeek", weekSessions.size());
        out.put("activeMachines", activeMachines);
        out.put("gyms", gymsCount);
        out.put("byType", byType);
        out.put("trainingRecordsTotal", trainingRecordsTotal);
        out.put("trainingTotalSec", trainingTotalSec);
        out.put("trainingTotalDistanceM", trainingTotalDistanceM);
        return out;
    }

    // ---------- 用户 ----------

    @Transactional(readOnly = true)
    public Map<String, Object> users(JwtCodec.AdminPayload admin, String keyword, String app,
                                     String page, String pageSize) {
        int[] paging = pageParams(page, pageSize);
        Set<UUID> userScope = scopeUserIds(admin);
        String normalizedApp = normalizeApp(app);

        final Set<UUID> allowed;
        if (normalizedApp != null) {
            Set<UUID> appIds = new HashSet<>();
            trainingRecords.findByApp(normalizedApp).forEach(r -> appIds.add(r.getUserId()));
            allowed = userScope == null ? appIds : intersect(userScope, appIds);
        } else {
            allowed = userScope;
        }

        if (allowed != null && allowed.isEmpty()) {
            return emptyPage(paging[0], paging[1]);
        }

        final Set<UUID> keywordIds;
        if (keyword != null && !keyword.isBlank()) {
            keywordIds = new HashSet<>();
            identities.findByIdentifierContaining(keyword).forEach(i -> keywordIds.add(i.getUserId()));
        } else {
            keywordIds = null;
        }

        Specification<User> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(cb.notEqual(root.get("status"), "deleted"));
            if (allowed != null) {
                predicates.add(root.get("id").in(allowed));
            }
            if (keyword != null && !keyword.isBlank()) {
                // 昵称包含（不区分大小写）或 身份标识包含
                jakarta.persistence.criteria.Predicate nickname = cb.like(
                    cb.lower(root.get("nickname")), "%" + keyword.toLowerCase() + "%");
                jakarta.persistence.criteria.Predicate byIdentity = keywordIds == null || keywordIds.isEmpty()
                    ? cb.disjunction()
                    : root.get("id").in(keywordIds);
                predicates.add(cb.or(nickname, byIdentity));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<User> result = users.findAll(spec, newestFirst(paging, "createdAt"));
        List<User> rows = result.getContent();

        List<UUID> userIds = rows.stream().map(User::getId).toList();
        Map<UUID, List<UserIdentity>> identitiesByUser = userIds.isEmpty() ? Map.of()
            : identities.findByUserIdInOrderByCreatedAtAsc(userIds).stream()
                .collect(Collectors.groupingBy(UserIdentity::getUserId));
        Map<UUID, UserGoal> goalsByUser = indexById(goals.findAllById(userIds), UserGoal::getUserId);

        List<Map<String, Object>> items = rows.stream().map(user -> {
            List<UserIdentity> ids = identitiesByUser.getOrDefault(user.getId(), List.of());
            UserGoal goal = goalsByUser.get(user.getId());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", user.getId().toString());
            out.put("nickname", user.getNickname());
            out.put("avatar", user.getAvatar());
            out.put("status", user.getStatus());
            out.put("createdAt", user.getCreatedAt());
            Map<String, Object> goalMap = new LinkedHashMap<>();
            goalMap.put("weeklySessions", goal == null ? 0 : goal.getWeeklySessions());
            goalMap.put("weeklyMinutes", goal == null ? 0 : goal.getWeeklyMinutes());
            out.put("goals", goalMap);
            out.put("identities", ids.stream().map(i -> {
                Map<String, Object> idMap = new LinkedHashMap<>();
                idMap.put("type", i.getType().name());
                idMap.put("identifier", mask(i.getType().name(), i.getIdentifier()));
                idMap.put("verifiedAt", i.getVerifiedAt());
                return idMap;
            }).toList());
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> userDetail(JwtCodec.AdminPayload admin, UUID id, String app) {
        Set<UUID> userScope = scopeUserIds(admin);
        User user = users.findById(id).orElse(null);
        if (user == null || "deleted".equals(user.getStatus())
            || (userScope != null && !userScope.contains(id))) {
            throw BizException.notFound("用户不存在");
        }

        String normalizedApp = normalizeApp(app);
        List<TrainingRecord> trainingRecordsRows = normalizedApp == null
            ? trainingRecords.findByUserId(id, PageRequest.of(0, 20, Sort.by(Sort.Order.desc("createdAt"))))
            : trainingRecords.findByUserIdAndApp(id, normalizedApp, PageRequest.of(0, 20, Sort.by(Sort.Order.desc("createdAt"))));

        List<EventRegistration> registrationRows;
        PageRequest registrationPage = PageRequest.of(0, 20, Sort.by(Sort.Order.desc("createdAt")));
        if (isSuper(admin)) {
            registrationRows = registrations.findByUserIdOrderByCreatedAtDesc(id, registrationPage);
        } else {
            List<UUID> eventIds = events.findByOrgIdOrderBySortAscCreatedAtDesc(adminOrgId(admin))
                .stream().map(EventLink::getId).toList();
            registrationRows = eventIds.isEmpty() ? List.of()
                : registrations.findByUserIdAndEventIdIn(id, eventIds, registrationPage);
        }

        List<UUID> gymScope = scopeGymIds(admin);
        PageRequest recentSessions = PageRequest.of(0, 10);
        List<Session> sessionRows = gymScope == null
            ? sessions.findByUserIdOrderByStartedAtDesc(id, recentSessions)
            : sessions.findByUserIdAndGymIdInOrderByStartedAtDesc(id, gymScope, recentSessions);

        List<UserIdentity> ids = identities.findByUserIdOrderByCreatedAtAsc(id);
        UserGoal goal = goals.findById(id).orElse(null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", user.getId().toString());
        out.put("nickname", user.getNickname());
        out.put("avatar", user.getAvatar());
        out.put("status", user.getStatus());
        out.put("createdAt", user.getCreatedAt());
        Map<String, Object> goalMap = new LinkedHashMap<>();
        goalMap.put("weeklySessions", goal == null ? 0 : goal.getWeeklySessions());
        goalMap.put("weeklyMinutes", goal == null ? 0 : goal.getWeeklyMinutes());
        out.put("goals", goalMap);
        out.put("identities", ids.stream().map(i -> {
            Map<String, Object> idMap = new LinkedHashMap<>();
            idMap.put("type", i.getType().name());
            idMap.put("identifier", mask(i.getType().name(), i.getIdentifier()));
            idMap.put("verifiedAt", i.getVerifiedAt());
            return idMap;
        }).toList());
        out.put("trainingRecords", trainingRecordsRows.stream().map(r -> {
            Map<String, Object> rMap = new LinkedHashMap<>();
            rMap.put("id", r.getId().toString());
            rMap.put("app", r.getApp());
            rMap.put("planId", r.getPlanId());
            rMap.put("completed", r.isCompleted());
            rMap.put("totalTimeSec", r.getTotalTimeSec());
            rMap.put("distanceM", r.getDistanceM());
            rMap.put("rpe", r.getRpe());
            rMap.put("weakestStation", r.getWeakestStation());
            rMap.put("moduleTimes", RecordsService.parseJson(r.getModuleTimes()));
            rMap.put("startedAt", r.getStartedAt());
            rMap.put("createdAt", r.getCreatedAt());
            return rMap;
        }).toList());
        out.put("registrations", registrationRows.stream().map(r -> {
            Map<String, Object> rMap = new LinkedHashMap<>();
            rMap.put("id", r.getId().toString());
            rMap.put("status", r.getStatus());
            rMap.put("createdAt", r.getCreatedAt());
            EventLink event = events.findById(r.getEventId()).orElse(null);
            Map<String, Object> eventMap = new LinkedHashMap<>();
            if (event != null) {
                eventMap.put("id", event.getId().toString());
                eventMap.put("title", event.getTitle());
                eventMap.put("startAt", event.getStartAt());
                eventMap.put("status", event.getStatus());
            }
            rMap.put("event", eventMap);
            return rMap;
        }).toList());
        out.put("sessions", sessionRows.stream().map(s -> {
            Map<String, Object> sMap = new LinkedHashMap<>();
            sMap.put("id", s.getId().toString());
            sMap.put("machineType", s.getMachineType().name());
            sMap.put("machineSerialNo", s.getMachineId() == null ? null
                : machines.findById(s.getMachineId()).map(Machine::getSerialNo).orElse(null));
            sMap.put("durationSec", s.getDurationSec());
            sMap.put("distanceM", s.getDistanceM());
            sMap.put("calories", s.getCalories());
            sMap.put("startedAt", s.getStartedAt());
            return sMap;
        }).toList());
        return out;
    }

    // ---------- 训练数据 ----------

    @Transactional(readOnly = true)
    public Map<String, Object> sessions(JwtCodec.AdminPayload admin, String gymId, String machineId,
                                        String app, String from, String to, String page, String pageSize) {
        int[] paging = pageParams(page, pageSize);
        List<UUID> gymScope = scopeGymIds(admin);
        Set<UUID> userScope = scopeUserIds(admin);

        final Set<UUID> userIdFilter;
        if (normalizeApp(app) != null) {
            Set<UUID> appIds = new HashSet<>();
            trainingRecords.findByApp(normalizeApp(app)).forEach(r -> appIds.add(r.getUserId()));
            userIdFilter = userScope == null ? appIds : intersect(userScope, appIds);
        } else {
            userIdFilter = userScope;
        }
        if (userIdFilter != null && userIdFilter.isEmpty()) {
            return emptyPage(paging[0], paging[1]);
        }

        UUID gymIdFilter = gymId == null || gymId.isBlank() ? null : UUID.fromString(gymId);
        UUID machineIdFilter = machineId == null || machineId.isBlank() ? null : UUID.fromString(machineId);

        Specification<Session> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (gymScope != null) {
                predicates.add(gymScope.isEmpty() ? cb.disjunction() : root.get("gymId").in(gymScope));
            }
            if (gymIdFilter != null) {
                predicates.add(cb.equal(root.get("gymId"), gymIdFilter));
            }
            if (machineIdFilter != null) {
                predicates.add(cb.equal(root.get("machineId"), machineIdFilter));
            }
            if (userIdFilter != null) {
                predicates.add(root.get("userId").in(userIdFilter));
            }
            addDateRange(predicates, cb, root, "startedAt", from, to);
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<Session> result = sessions.findAll(spec, newestFirst(paging, "startedAt"));
        List<Session> rows = result.getContent();

        Map<UUID, User> usersById = indexById(users.findAllById(rows.stream().map(Session::getUserId).distinct().toList()), User::getId);
        Map<UUID, Machine> machinesById = indexById(machines.findAllById(rows.stream()
            .map(Session::getMachineId).filter(java.util.Objects::nonNull).distinct().toList()), Machine::getId);

        List<Map<String, Object>> items = rows.stream().map(s -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", s.getId().toString());
            out.put("userNickname", nickname(usersById, s.getUserId()));
            out.put("gymId", s.getGymId() == null ? null : s.getGymId().toString());
            out.put("machineId", s.getMachineId() == null ? null : s.getMachineId().toString());
            Machine machine = machinesById.get(s.getMachineId());
            out.put("machineSerialNo", machine == null ? null : machine.getSerialNo());
            out.put("machineType", s.getMachineType().name());
            out.put("machineModel", s.getMachineModel());
            out.put("durationSec", s.getDurationSec());
            out.put("distanceM", s.getDistanceM());
            out.put("calories", s.getCalories());
            out.put("avgHr", s.getAvgHr());
            out.put("avgSpeed", s.getAvgSpeed() == null ? null : s.getAvgSpeed().doubleValue());
            out.put("cadence", s.getCadence());
            out.put("power", s.getPower());
            out.put("source", s.getSource().name());
            out.put("startedAt", s.getStartedAt());
            out.put("endedAt", s.getEndedAt());
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> trainingRecords(JwtCodec.AdminPayload admin, String app, String userId,
                                               String completed, String from, String to,
                                               String page, String pageSize) {
        int[] paging = pageParams(page, pageSize);
        String normalizedApp = normalizeApp(app);
        Boolean completedFilter = null;
        if (completed != null && !completed.isBlank()) {
            String v = completed.trim().toLowerCase();
            if ("true".equals(v) || "1".equals(v)) {
                completedFilter = true;
            } else if ("false".equals(v) || "0".equals(v)) {
                completedFilter = false;
            }
        }
        Set<UUID> userScope = scopeUserIds(admin);

        Set<UUID> userIdFilter = userScope;
        if (userId != null && !userId.isBlank()) {
            UUID requestedUserId = UUID.fromString(userId);
            userIdFilter = userScope == null || userScope.contains(requestedUserId)
                ? Set.of(requestedUserId) : Set.of();
        }
        if (userIdFilter != null && userIdFilter.isEmpty()) {
            return emptyPage(paging[0], paging[1]);
        }

        Boolean finalCompleted = completedFilter;
        Set<UUID> finalUserIdFilter = userIdFilter;

        Specification<TrainingRecord> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (finalUserIdFilter != null) {
                predicates.add(root.get("userId").in(finalUserIdFilter));
            }
            if (normalizedApp != null) {
                predicates.add(cb.equal(root.get("app"), normalizedApp));
            }
            if (finalCompleted != null) {
                predicates.add(cb.equal(root.get("completed"), finalCompleted));
            }
            addDateRange(predicates, cb, root, "createdAt", from, to);
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<TrainingRecord> result = trainingRecords.findAll(spec, newestFirst(paging, "createdAt"));
        List<TrainingRecord> rows = result.getContent();

        Map<UUID, User> usersById = indexById(users.findAllById(rows.stream()
            .map(TrainingRecord::getUserId).distinct().toList()), User::getId);

        List<Map<String, Object>> items = rows.stream().map(r -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", r.getId().toString());
            out.put("userNickname", nickname(usersById, r.getUserId()));
            out.put("app", r.getApp());
            out.put("completed", r.isCompleted());
            out.put("totalTimeSec", r.getTotalTimeSec());
            out.put("distanceM", r.getDistanceM());
            out.put("rpe", r.getRpe());
            out.put("weakestStation", r.getWeakestStation());
            out.put("moduleTimes", RecordsService.parseJson(r.getModuleTimes()));
            out.put("runSplits", RecordsService.parseJson(r.getRunSplits()));
            out.put("avgHr", r.getAvgHr());
            out.put("maxHr", r.getMaxHr());
            out.put("startedAt", r.getStartedAt());
            out.put("createdAt", r.getCreatedAt());
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> deviceSessions(JwtCodec.AdminPayload admin, String app, String mode,
                                              String deviceSerial, String from, String to,
                                              String page, String pageSize) {
        int[] paging = pageParams(page, pageSize);
        String normalizedApp = normalizeApp(app);
        Set<UUID> userScope = scopeUserIds(admin);
        if (userScope != null && userScope.isEmpty()) {
            return emptyPage(paging[0], paging[1]);
        }
        UUID deviceId = deviceSerial == null || deviceSerial.isBlank() ? null
            : devices.findBySerialNo(deviceSerial).map(Device::getId).orElse(null);
        if (deviceId == null && deviceSerial != null && !deviceSerial.isBlank()) {
            return emptyPage(paging[0], paging[1]);
        }

        Specification<DeviceSession> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (userScope != null) {
                predicates.add(root.get("userId").in(userScope));
            }
            if (normalizedApp != null) {
                predicates.add(cb.equal(root.get("app"), normalizedApp));
            }
            if ("training".equals(mode) || "race".equals(mode)) {
                predicates.add(cb.equal(root.get("mode"), com.ifitbest.server.infra.persistence.WorkoutMode.valueOf(mode)));
            }
            if (deviceId != null) {
                predicates.add(cb.equal(root.get("deviceId"), deviceId));
            }
            addDateRange(predicates, cb, root, "startedAt", from, to);
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<DeviceSession> result = deviceSessions.findAll(spec, newestFirst(paging, "startedAt"));
        List<DeviceSession> rows = result.getContent();
        Map<UUID, Device> devicesById = indexById(devices.findAllById(rows.stream()
            .map(DeviceSession::getDeviceId).distinct().toList()), Device::getId);
        Map<UUID, User> usersById = indexById(users.findAllById(rows.stream()
            .map(DeviceSession::getUserId).distinct().toList()), User::getId);
        Map<UUID, Long> segmentCounts = rows.isEmpty() ? Map.of() : deviceSegments
            .countBySessionIds(rows.stream().map(DeviceSession::getId).toList()).stream()
            .collect(Collectors.toMap(DeviceSegmentRepo.SessionSegmentCount::getSessionId,
                DeviceSegmentRepo.SessionSegmentCount::getSegmentCount));

        List<Map<String, Object>> items = rows.stream().map(s -> {
            Device device = devicesById.get(s.getDeviceId());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", s.getId().toString());
            out.put("userNickname", nickname(usersById, s.getUserId()));
            out.put("deviceSerialNo", device == null ? null : device.getSerialNo());
            out.put("deviceLabel", device == null ? null : device.getLabel());
            out.put("app", s.getApp());
            out.put("mode", s.getMode().name());
            out.put("clientSessionId", s.getClientSessionId());
            out.put("durationSec", s.getDurationSec());
            out.put("distanceM", s.getDistanceM());
            out.put("avgHr", s.getAvgHr());
            out.put("maxHr", s.getMaxHr());
            out.put("closeReason", s.getCloseReason());
            out.put("quality", s.getQuality().name());
            out.put("segmentCount", segmentCounts.getOrDefault(s.getId(), 0L));
            out.put("trainingRecordId", s.getTrainingRecordId() == null ? null : s.getTrainingRecordId().toString());
            out.put("startedAt", s.getStartedAt());
            out.put("endedAt", s.getEndedAt());
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    // ---------- 器械 ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> machines(JwtCodec.AdminPayload admin, String gymId) {
        UUID gymFilter = gymId == null || gymId.isBlank() ? null : UUID.fromString(gymId);
        Map<UUID, MachineModel> modelById = new LinkedHashMap<>();
        machineModels.findAll().forEach(m -> modelById.put(m.getId(), m));
        Map<UUID, Gym> gymById = new LinkedHashMap<>();
        gyms.findAll().forEach(g -> gymById.put(g.getId(), g));

        return machines.findAll(Sort.by(Sort.Order.desc("createdAt"))).stream()
            .filter(m -> inMachineScope(admin, m))
            .filter(m -> gymFilter == null || gymFilter.equals(m.getGymId()))
            .filter(m -> modelById.containsKey(m.getModelId()))
            .map(m -> machineView(m, modelById.get(m.getModelId()), gymById.get(m.getGymId())))
            .toList();
    }

    @Transactional
    public Map<String, Object> createMachine(JwtCodec.AdminPayload admin, UUID inputOrgId, UUID inputGymId,
                                             UUID modelId, String serialNo, MachineStatus status, String firmware) {
        MachineModel model = machineModels.findById(modelId).orElse(null);
        UUID orgId = isSuper(admin) && inputOrgId == null && model != null ? model.getOrgId() : resolveOrgId(admin, inputOrgId);
        UUID gymId = resolveWritableGymId(admin, inputGymId);
        if (!isSuper(admin) && !"org_admin".equals(admin.role())
            && (gymId == null || (inputGymId != null && !gymId.equals(inputGymId)))) {
            throw BizException.badRequest("只能在所属门店创建器械");
        }
        Gym gym = gymId == null ? null : gyms.findById(gymId).orElse(null);
        if (gymId != null && (gym == null || !gym.getOrgId().equals(orgId))) {
            throw BizException.badRequest("门店不属于该组织");
        }
        if (model == null || !model.getOrgId().equals(orgId)) {
            throw BizException.badRequest("器械型号不属于该组织");
        }

        try {
            Machine machine = new Machine();
            machine.setId(UUID.randomUUID());
            machine.setOrgId(orgId);
            machine.setGymId(gymId);
            machine.setModelId(modelId);
            machine.setSerialNo(serialNo);
            machine.setStatus(status == null ? MachineStatus.active : status);
            machine.setFirmware(firmware);
            machine.setCreatedAt(Times.nowUtc());
            machines.saveAndFlush(machine);
            return machineView(machine, model, gym);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该序列号已存在");
        }
    }

    @Transactional
    public Map<String, Object> updateMachine(JwtCodec.AdminPayload admin, UUID id, UUID inputGymId,
                                             MachineStatus status, String firmware) {
        Machine machine = lookupMachineInScope(admin, id);

        if (inputGymId != null && (isSuper(admin) || "org_admin".equals(admin.role()))) {
            Gym gym = gyms.findById(inputGymId).orElse(null);
            if (gym == null || !gym.getOrgId().equals(machine.getOrgId())) {
                throw BizException.badRequest("门店不属于该组织");
            }
            machine.setGymId(inputGymId);
        }
        if (status != null) {
            machine.setStatus(status);
        }
        if (firmware != null) {
            machine.setFirmware(firmware);
        }
        machines.save(machine);

        MachineModel model = machineModels.findById(machine.getModelId()).orElseThrow();
        return machineView(machine, model, machineGym(machine));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> machineModels(JwtCodec.AdminPayload admin) {
        Map<UUID, Long> machineCounts = new LinkedHashMap<>();
        machines.findAll().stream().filter(m -> inMachineScope(admin, m))
            .forEach(m -> machineCounts.merge(m.getModelId(), 1L, Long::sum));
        Map<UUID, String> orgNames = new LinkedHashMap<>();
        if (isSuper(admin)) orgs.findAll().forEach(o -> orgNames.put(o.getId(), o.getName()));

        return machineModels.findAll(Sort.by(Sort.Order.asc("type"), Sort.Order.asc("model"))).stream()
            .filter(m -> isSuper(admin) || m.getOrgId().equals(adminOrgId(admin)))
            .map(m -> {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("id", m.getId().toString());
                out.put("orgId", m.getOrgId().toString());
                out.put("orgName", orgNames.get(m.getOrgId()));
                out.put("type", m.getType().name());
                out.put("model", m.getModel());
                out.put("brand", m.getBrand());
                out.put("specs", RecordsService.parseJson(m.getSpecs()));
                out.put("machineCount", machineCounts.getOrDefault(m.getId(), 0L));
                out.put("createdAt", m.getCreatedAt());
                return out;
            })
            .toList();
    }

    @Transactional
    public Map<String, Object> createMachineModel(JwtCodec.AdminPayload admin, UUID inputOrgId,
                                                  MachineType type, String model, String brand,
                                                  Map<String, Object> specs) {
        catalog.requireSelectable(type);
        UUID orgId = resolveOrgId(admin, inputOrgId);
        try {
            MachineModel machineModel = new MachineModel();
            machineModel.setId(UUID.randomUUID());
            machineModel.setOrgId(orgId);
            machineModel.setType(type);
            machineModel.setModel(model);
            machineModel.setBrand(brand);
            machineModel.setSpecs(writeJson(specs));
            machineModel.setCreatedAt(Times.nowUtc());
            machineModels.saveAndFlush(machineModel);
            return Map.of("id", machineModel.getId().toString());
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该型号已存在");
        }
    }

    @Transactional
    public void updateMachineModel(JwtCodec.AdminPayload admin, UUID id, String name, String brand) {
        if (!isSuper(admin) && !"org_admin".equals(admin.role())) {
            throw BizException.forbidden("仅平台或组织管理员可修改组织共用的型号");
        }
        MachineModel model = machineModels.findById(id)
            .filter(m -> isSuper(admin) || m.getOrgId().equals(adminOrgId(admin)))
            .orElseThrow(() -> BizException.notFound("器械型号不存在"));
        model.setModel(name.trim());
        model.setBrand(brand);
        try {
            machineModels.saveAndFlush(model);
        } catch (DataIntegrityViolationException ex) {
            throw BizException.conflict("该型号已存在");
        }
    }

    @Transactional
    public Map<String, Object> generateQrTag(JwtCodec.AdminPayload admin, UUID machineId) {
        Machine machine = lookupMachineInScope(admin, machineId);
        MachineModel model = machineModels.findById(machine.getModelId()).orElseThrow();
        Gym gym = machineGym(machine);

        MachineTag existing = tags.findFirstByMachineIdAndTagTypeAndStatus(machineId, TagType.qr, TagStatus.active).orElse(null);
        if (existing != null) {
            return Map.of("machine", machineView(machine, model, gym), "tag", tagView(existing), "qrValue", existing.getTagValue());
        }

        String tagValue = QrTokens.buildQrValue(machine.getId().toString(), props.getQr().getSecret());
        try {
            MachineTag tag = new MachineTag();
            tag.setId(UUID.randomUUID());
            tag.setMachineId(machineId);
            tag.setTagType(TagType.qr);
            tag.setTagValue(tagValue);
            tag.setPrintedAt(Times.nowUtc());
            tag.setCreatedAt(Times.nowUtc());
            tags.save(tag);
            return Map.of("machine", machineView(machine, model, gym), "tag", tagView(tag), "qrValue", tagValue);
        } catch (DataIntegrityViolationException e) {
            MachineTag tag = tags.findByTagValue(tagValue).orElseThrow(
                () -> BizException.conflict("二维码生成失败"));
            return Map.of("machine", machineView(machine, model, gym), "tag", tagView(tag), "qrValue", tag.getTagValue());
        }
    }

    @Transactional
    public Map<String, Object> createNfcTag(JwtCodec.AdminPayload admin, UUID machineId, String tagValue) {
        Machine machine = lookupMachineInScope(admin, machineId);
        MachineModel model = machineModels.findById(machine.getModelId()).orElseThrow();
        Gym gym = machineGym(machine);

        try {
            MachineTag tag = new MachineTag();
            tag.setId(UUID.randomUUID());
            tag.setMachineId(machineId);
            tag.setTagType(TagType.nfc);
            tag.setTagValue(tagValue);
            tag.setPrintedAt(Times.nowUtc());
            tag.setCreatedAt(Times.nowUtc());
            tags.save(tag);
            return Map.of("machine", machineView(machine, model, gym), "tag", tagView(tag));
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该 NFC 标签已被使用");
        }
    }

    // ---------- 赛事 ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventLinks(JwtCodec.AdminPayload admin) {
        List<EventLink> rows = events.findAllByOrderBySortAscCreatedAtDesc().stream()
            .filter(e -> inEventScope(admin, e))
            .toList();
        Map<UUID, Long> countMap = new LinkedHashMap<>();
        if (!rows.isEmpty()) {
            registrations.findByEventIdIn(rows.stream().map(EventLink::getId).toList())
                .forEach(r -> countMap.merge(r.getEventId(), 1L, Long::sum));
        }
        return rows.stream().map(e -> {
            Map<String, Object> out = EventsService.serializeEvent(e);
            out.put("registrationCount", countMap.getOrDefault(e.getId(), 0L));
            return out;
        }).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> registrations(JwtCodec.AdminPayload admin, String eventId,
                                             String from, String to, String page, String pageSize) {
        int[] paging = pageParams(page, pageSize);
        List<EventLink> scopedEvents = events.findAllByOrderBySortAscCreatedAtDesc().stream()
            .filter(e -> inEventScope(admin, e))
            .toList();
        List<UUID> eventIds = scopedEvents.stream().map(EventLink::getId).toList();

        Specification<EventRegistration> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(eventIds.isEmpty() ? cb.disjunction() : root.get("eventId").in(eventIds));
            if (eventId != null && !eventId.isBlank()) {
                predicates.add(cb.equal(root.get("eventId"), UUID.fromString(eventId)));
            }
            addDateRange(predicates, cb, root, "createdAt", from, to);
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        Page<EventRegistration> result = registrations.findAll(spec, newestFirst(paging, "createdAt"));
        List<EventRegistration> rows = result.getContent();
        Map<UUID, User> usersById = indexById(users.findAllById(rows.stream()
            .map(EventRegistration::getUserId).distinct().toList()), User::getId);
        Map<UUID, EventLink> eventsById = indexById(events.findAllById(rows.stream()
            .map(EventRegistration::getEventId).distinct().toList()), EventLink::getId);

        List<Map<String, Object>> items = rows.stream().map(r -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", r.getId().toString());
            out.put("status", r.getStatus());
            out.put("createdAt", r.getCreatedAt());
            User user = usersById.get(r.getUserId());
            Map<String, Object> userMap = new LinkedHashMap<>();
            userMap.put("id", user == null ? null : user.getId().toString());
            userMap.put("nickname", user == null ? null : user.getNickname());
            userMap.put("avatar", user == null ? null : user.getAvatar());
            out.put("user", userMap);
            EventLink event = eventsById.get(r.getEventId());
            Map<String, Object> eventMap = new LinkedHashMap<>();
            if (event != null) {
                eventMap.put("id", event.getId().toString());
                eventMap.put("title", event.getTitle());
                eventMap.put("startAt", event.getStartAt());
            }
            out.put("event", eventMap);
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    @Transactional
    public Map<String, Object> createEventLink(JwtCodec.AdminPayload admin, UUID inputOrgId, String title,
                                               String subtitle, String coverUrl, String externalUrl,
                                               LocalDateTime startAt, LocalDateTime endAt, Integer sort, String status) {
        EventLink event = new EventLink();
        event.setId(UUID.randomUUID());
        event.setOrgId(isSuper(admin) ? inputOrgId : adminOrgId(admin));
        event.setTitle(title);
        event.setSubtitle(subtitle);
        event.setCoverUrl(coverUrl);
        event.setExternalUrl(externalUrl);
        event.setStartAt(startAt);
        event.setEndAt(endAt);
        event.setSort(sort == null ? 0 : sort);
        event.setStatus(status == null ? "published" : status);
        event.setCreatedAt(Times.nowUtc());
        events.save(event);
        return EventsService.serializeEvent(event);
    }

    @Transactional
    public Map<String, Object> updateEventLink(JwtCodec.AdminPayload admin, UUID id, UUID inputOrgId, String title,
                                               String subtitle, String coverUrl, String externalUrl,
                                               LocalDateTime startAt, LocalDateTime endAt, Integer sort, String status) {
        EventLink event = events.findById(id).filter(e -> inEventScope(admin, e)).orElse(null);
        if (event == null) {
            throw BizException.notFound("赛事不存在");
        }
        if (isSuper(admin) && inputOrgId != null) {
            event.setOrgId(inputOrgId);
        }
        if (title != null) {
            event.setTitle(title);
        }
        if (subtitle != null) {
            event.setSubtitle(subtitle);
        }
        if (coverUrl != null) {
            event.setCoverUrl(coverUrl);
        }
        if (externalUrl != null) {
            event.setExternalUrl(externalUrl);
        }
        if (startAt != null) {
            event.setStartAt(startAt);
        }
        if (endAt != null) {
            event.setEndAt(endAt);
        }
        if (sort != null) {
            event.setSort(sort);
        }
        if (status != null) {
            event.setStatus(status);
        }
        events.save(event);
        return EventsService.serializeEvent(event);
    }

    @Transactional
    public Map<String, Object> deleteEventLink(JwtCodec.AdminPayload admin, UUID id) {
        EventLink event = events.findById(id).filter(e -> inEventScope(admin, e)).orElse(null);
        if (event == null) {
            throw BizException.notFound("赛事不存在");
        }
        events.delete(event);
        return Map.of("ok", true);
    }

    // ---------- 门店 ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> gyms(JwtCodec.AdminPayload admin) {
        Map<UUID, String> orgNames = new LinkedHashMap<>();
        orgs.findAll().forEach(o -> orgNames.put(o.getId(), o.getName()));
        Map<UUID, Long> machineCounts = new LinkedHashMap<>();
        machines.findAll().forEach(m -> machineCounts.merge(m.getGymId(), 1L, Long::sum));

        return gyms.findAll(Sort.by(Sort.Order.desc("createdAt"))).stream()
            .filter(g -> inGymScope(admin, g))
            .map(g -> gymView(g, orgNames.getOrDefault(g.getOrgId(), ""), machineCounts.getOrDefault(g.getId(), 0L)))
            .toList();
    }

    private Map<String, Object> gymView(Gym gym, String orgName, long machineCount) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", gym.getId().toString());
        out.put("orgId", gym.getOrgId().toString());
        out.put("orgName", orgName);
        out.put("name", gym.getName());
        out.put("code", gym.getCode());
        out.put("address", gym.getAddress());
        out.put("districtCode", gym.getDistrictCode());
        out.put("timezone", gym.getTimezone());
        out.put("status", gym.getStatus());
        out.put("machineCount", machineCount);
        out.put("createdAt", gym.getCreatedAt());
        return out;
    }

    @Transactional
    public Map<String, Object> createGym(JwtCodec.AdminPayload admin, UUID inputOrgId, String name,
                                         String code, String address, String timezone, String districtCode) {
        SystemAdminService.lockAccounts(locks);
        UUID orgId = resolveOrgId(admin, inputOrgId);
        ensureActiveOrg(orgId);
        try {
            Gym gym = new Gym();
            gym.setId(UUID.randomUUID());
            gym.setOrgId(orgId);
            gym.setName(name);
            gym.setCode(code);
            gym.setAddress(address);
            gym.setDistrictCode(catalog.districtCode(districtCode));
            gym.setTimezone(catalog.gymTimezone(timezone));
            gym.setCreatedAt(Times.nowUtc());
            gyms.save(gym);
            String orgName = orgs.findById(orgId).map(Org::getName).orElse("");
            return gymView(gym, orgName, 0);
        } catch (DataIntegrityViolationException e) {
            throw BizException.conflict("该组织下门店编码已存在");
        }
    }

    @Transactional
    public Map<String, Object> updateGym(JwtCodec.AdminPayload admin, UUID id, String name, String code,
                                         String address, String timezone, String status, String districtCode) {
        SystemAdminService.lockAccounts(locks);
        Gym gym = gyms.findById(id).filter(g -> inGymScope(admin, g)).orElse(null);
        if (gym == null) {
            throw BizException.notFound("门店不存在");
        }
        if (name != null) {
            gym.setName(name);
        }
        if (code != null) {
            gym.setCode(code);
        }
        if (address != null) {
            gym.setAddress(address);
        }
        if (districtCode != null) gym.setDistrictCode(catalog.districtCode(districtCode));
        if (timezone != null) {
            gym.setTimezone(catalog.gymTimezone(timezone));
        }
        if (status != null) {
            if (!"closed".equals(status)) ensureActiveOrg(gym.getOrgId());
            gym.setStatus(status);
        }
        gyms.save(gym);
        String orgName = orgs.findById(gym.getOrgId()).map(Org::getName).orElse("");
        long machineCount = machines.countByGymId(id);
        return gymView(gym, orgName, machineCount);
    }

    @Transactional
    public Map<String, Object> deleteGym(JwtCodec.AdminPayload admin, UUID id) {
        SystemAdminService.lockAccounts(locks);
        Gym gym = gyms.findById(id).filter(g -> inGymScope(admin, g)).orElse(null);
        if (gym == null) {
            throw BizException.notFound("门店不存在");
        }
        long machineCount = machines.countByGymId(id);
        if (machineCount > 0) {
            throw BizException.badRequest("该门店还有 " + machineCount + " 台器械，无法删除");
        }
        if (admins.existsByGymId(id)) {
            throw BizException.conflict("请先迁移该门店关联的管理账号");
        }
        gyms.delete(gym);
        return Map.of("ok", true);
    }

    private void ensureActiveOrg(UUID id) {
        if (orgs.findById(id).filter(org -> "active".equals(org.getStatus())).isEmpty()) {
            throw BizException.badRequest("组织不存在或已停用");
        }
    }

    // ---------- 审计 ----------

    public record AuditFilters(UUID adminId, UUID orgId, String action, LocalDate from, LocalDate to) {}

    @Transactional(readOnly = true)
    public Map<String, Object> auditLogs(JwtCodec.AdminPayload admin, String page, String pageSize, AuditFilters filters) {
        int[] paging = pageParams(page, pageSize);

        Specification<AuditLog> spec = (root, query, cb) -> {
            List<Predicate> clauses = new ArrayList<>();
            if (!isSuper(admin)) {
                if ("org_admin".equals(admin.role())) {
                    clauses.add(cb.equal(root.get("orgId"), adminOrgId(admin)));
                } else {
                    UUID gymId = adminGymId(admin);
                    clauses.add(gymId == null ? cb.disjunction() : cb.equal(root.get("gymId"), gymId));
                }
            }
            if (filters.adminId() != null) clauses.add(cb.equal(root.get("adminId"), filters.adminId()));
            if (filters.orgId() != null) clauses.add(cb.equal(root.get("orgId"), filters.orgId()));
            if (filters.action() != null && !filters.action().isBlank()) {
                clauses.add(cb.equal(root.get("action"), filters.action().trim()));
            }
            if (filters.from() != null) clauses.add(cb.greaterThanOrEqualTo(root.get("createdAt"), filters.from().atStartOfDay()));
            if (filters.to() != null) clauses.add(cb.lessThan(root.get("createdAt"), filters.to().plusDays(1).atStartOfDay()));
            return cb.and(clauses.toArray(Predicate[]::new));
        };

        Page<AuditLog> result = auditLogs.findAll(spec, newestFirst(paging, "createdAt"));
        List<AuditLog> rows = result.getContent();

        List<Map<String, Object>> items = rows.stream().map(a -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", a.getId());
            out.put("adminId", a.getAdminId() == null ? null : a.getAdminId().toString());
            out.put("orgId", a.getOrgId() == null ? null : a.getOrgId().toString());
            out.put("gymId", a.getGymId() == null ? null : a.getGymId().toString());
            out.put("action", a.getAction());
            out.put("targetType", a.getTargetType());
            out.put("targetId", a.getTargetId());
            out.put("payload", RecordsService.parseJson(a.getPayload()));
            out.put("ip", a.getIp());
            out.put("createdAt", a.getCreatedAt());
            return out;
        }).toList();

        return pageResult(items, result.getTotalElements(), paging[0], paging[1]);
    }

    // ---------- 工具 ----------

    /** 集合交集（替代 Guava Collections.intersection） */
    private static Set<UUID> intersect(Set<UUID> a, Set<UUID> b) {
        Set<UUID> out = new HashSet<>(a);
        out.retainAll(b);
        return out;
    }

    private static Map<String, Object> emptyPage(int page, int pageSize) {
        return pageResult(List.of(), 0, page, pageSize);
    }

    private static Map<String, Object> pageResult(List<Map<String, Object>> items, long total, int page, int pageSize) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("total", total);
        out.put("page", page);
        out.put("pageSize", pageSize);
        return out;
    }

    private static String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }
}
