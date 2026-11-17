package com.ifitbest.server.module.session;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.JacksonConfig;
import com.ifitbest.server.infra.persistence.Machine;
import com.ifitbest.server.infra.persistence.MachineRepo;
import com.ifitbest.server.infra.persistence.MachineModel;
import com.ifitbest.server.infra.persistence.MachineModelRepo;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.infra.persistence.Session;
import com.ifitbest.server.infra.persistence.SessionRepo;
import com.ifitbest.server.infra.persistence.SessionSource;
import com.ifitbest.server.infra.persistence.WriteLocks;

/** 器械训练会话 —— 上报（幂等）/ 游标分页 / 周统计，契约一致 */
@Service
public class SessionsService {

    private final SessionRepo sessions;
    private final MachineRepo machines;
    private final MachineModelRepo machineModels;
    private final WriteLocks locks;

    public SessionsService(SessionRepo sessions, MachineRepo machines, MachineModelRepo machineModels, WriteLocks locks) {
        this.sessions = sessions;
        this.machines = machines;
        this.machineModels = machineModels;
        this.locks = locks;
    }

    public static Map<String, Object> serialize(Session s) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", s.getId().toString());
        out.put("userId", s.getUserId().toString());
        out.put("gymId", s.getGymId() == null ? null : s.getGymId().toString());
        out.put("machineId", s.getMachineId() == null ? null : s.getMachineId().toString());
        out.put("machineType", s.getMachineType().name());
        out.put("machineModel", s.getMachineModel());
        out.put("mode", s.getMode());
        out.put("durationSec", s.getDurationSec());
        out.put("distanceM", s.getDistanceM());
        out.put("calories", s.getCalories());
        out.put("avgHr", s.getAvgHr());
        out.put("avgSpeed", s.getAvgSpeed() == null ? null : s.getAvgSpeed().doubleValue());
        out.put("cadence", s.getCadence());
        out.put("power", s.getPower());
        out.put("target", s.getTarget());
        out.put("completed", s.getCompleted());
        out.put("source", s.getSource().name());
        out.put("startedAt", s.getStartedAt());
        out.put("endedAt", s.getEndedAt());
        out.put("createdAt", s.getCreatedAt());
        return out;
    }

    public record CreateInput(UUID machineId, UUID gymId, MachineType machineType, String machineModel,
                              String mode, int durationSec, int distanceM, int calories, Integer avgHr,
                              BigDecimal avgSpeed, Integer cadence, Integer power, SessionSource source,
                              LocalDateTime startedAt, LocalDateTime endedAt, Integer target, Boolean completed) {
    }

    @Transactional
    public Map<String, Object> create(UUID userId, String idempotencyKey, CreateInput input) {
        return store(userId, idempotencyKey, input, false);
    }

    @Transactional
    public Map<String, Object> restore(UUID userId, String idempotencyKey, CreateInput input) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw BizException.badRequest("恢复训练记录需要幂等键");
        }
        return store(userId, idempotencyKey, input, true);
    }

    private Map<String, Object> store(UUID userId, String idempotencyKey, CreateInput input, boolean restore) {
        lockUser(userId);
        if (idempotencyKey != null && idempotencyKey.isBlank()) idempotencyKey = null;
        if (idempotencyKey != null) {
            locks.acquire("machine-session", idempotencyKey);
            if (restore) {
                List<Session> matching = findOwnedReference(userId, idempotencyKey);
                if (!matching.isEmpty()) return userView(matching.get(0));
            }
            Session existing = sessions.findByIdempotencyKey(idempotencyKey).orElse(null);
            if (existing != null) {
                if (!existing.getUserId().equals(userId)) {
                    throw BizException.conflict("幂等键冲突");
                }
                return userView(existing);
            }
            if (sessions.isDeletedKey(userId, idempotencyKey)) {
                if (!restore) throw new BizException(410, "训练记录已删除");
                sessions.allowRestoringKey(userId, idempotencyKey);
            }
        }

        UUID gymId = input.gymId();
        MachineType machineType = input.machineType();
        String machineModel = input.machineModel();

        if (input.machineId() != null) {
            Machine machine = machines.findById(input.machineId()).orElse(null);
            if (machine == null) {
                throw BizException.badRequest("器械不存在");
            }
            gymId = machine.getGymId();
            MachineModel model = machineModels.findById(machine.getModelId()).orElse(null);
            if (model != null) {
                machineType = model.getType();
                machineModel = model.getModel();
            }
        }

        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setUserId(userId);
        session.setGymId(gymId);
        session.setMachineId(input.machineId());
        session.setMachineType(machineType);
        session.setMachineModel(machineModel);
        session.setMode(input.mode() == null ? "free" : input.mode());
        session.setDurationSec(input.durationSec());
        session.setDistanceM(input.distanceM());
        session.setCalories(input.calories());
        session.setAvgHr(input.avgHr());
        session.setAvgSpeed(input.avgSpeed());
        session.setCadence(input.cadence());
        session.setPower(input.power());
        session.setTarget(input.target());
        session.setCompleted(input.completed());
        session.setSource(input.source() == null ? SessionSource.ble : input.source());
        session.setStartedAt(input.startedAt() == null ? Times.nowUtc() : input.startedAt());
        session.setEndedAt(input.endedAt());
        session.setCreatedAt(Times.nowUtc());
        session.setIdempotencyKey(idempotencyKey);
        sessions.save(session);
        return userView(session);
    }

    @Transactional
    public void delete(UUID userId, String reference) {
        lockUser(userId);
        List<Session> matched = findOwnedReference(userId, reference);
        if (!matched.isEmpty()) {
            Session session = matched.get(0);
            String key = session.getIdempotencyKey();
            if (key != null && !key.equals(reference)) sessions.rememberDeletedKey(userId, key);
            sessions.delete(session);
        }
        // 本机待同步记录可能尚未落库。抑制迟到的重试。
        sessions.rememberDeletedKey(userId, reference);
    }

    private List<Session> findOwnedReference(UUID userId, String reference) {
        UUID id = null;
        try {
            id = UUID.fromString(reference);
        } catch (IllegalArgumentException ignored) {
            // 旧客户端生成的业务键未必是 UUID。
        }
        return sessions.findOwnedReference(userId, reference, id, PageRequest.of(0, 1));
    }

    @Transactional
    public int clear(UUID userId, List<String> pendingIds, List<MachineType> machineTypes) {
        lockUser(userId);
        List<MachineType> types = machineTypes == null ? List.of(MachineType.values()) : machineTypes;
        sessions.rememberDeletedCloudKeys(userId, types.stream().map(MachineType::name).toList());
        for (String id : pendingIds) sessions.rememberDeletedKey(userId, id);
        return sessions.deleteAllForUser(userId, types);
    }

    private void lockUser(UUID userId) {
        locks.acquire("machine-session-user", userId.toString());
    }

    private static Map<String, Object> userView(Session session) {
        Map<String, Object> out = serialize(session);
        out.put("clientId", session.getIdempotencyKey());
        return out;
    }

    public Map<String, Object> list(UUID userId, String range, String cursor, int limit) {
        LocalDateTime since = switch (range == null ? "week" : range) {
            case "week" -> Times.weekStartShanghai();
            case "month" -> Times.monthStartShanghai();
            default -> null;
        };
        HistoryCursor before = parseCursor(cursor);

        Specification<Session> spec = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            if (since != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startedAt"), since));
            }
            if (before != null) {
                if (before.id() == null) {
                    // 旧版游标指向第一条尚未返回的记录。
                    predicates.add(cb.lessThanOrEqualTo(root.get("startedAt"), before.startedAt()));
                } else {
                    predicates.add(cb.or(
                        cb.lessThan(root.get("startedAt"), before.startedAt()),
                        cb.and(cb.equal(root.get("startedAt"), before.startedAt()),
                            cb.lessThan(root.<UUID>get("id"), before.id()))));
                }
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };

        List<Session> rows = sessions.findAll(spec,
            PageRequest.of(0, limit + 1, Sort.by(Sort.Order.desc("startedAt"), Sort.Order.desc("id")))).getContent();

        boolean hasMore = rows.size() > limit;
        List<Session> items = hasMore ? rows.subList(0, limit) : rows;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items.stream().map(SessionsService::userView).toList());
        Session last = items.isEmpty() ? null : items.get(items.size() - 1);
        out.put("nextCursor", hasMore ? JacksonConfig.formatIsoMs(last.getStartedAt()) + "~" + last.getId() : null);
        return out;
    }

    private record HistoryCursor(LocalDateTime startedAt, UUID id) {}

    private static HistoryCursor parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) return null;
        try {
            String[] parts = cursor.split("~", -1);
            if (parts.length > 2 || parts[0].isBlank()) throw new IllegalArgumentException();
            return new HistoryCursor(JacksonConfig.parseIso(parts[0]),
                parts.length == 2 ? UUID.fromString(parts[1]) : null);
        } catch (IllegalArgumentException error) {
            throw BizException.badRequest("训练记录分页游标格式不正确");
        }
    }

    public Map<String, Object> weeklyStats(UUID userId) {
        LocalDateTime weekStart = Times.weekStartShanghai();
        List<Session> rows = sessions.findByUserIdAndStartedAtGreaterThanEqualOrderByStartedAtDesc(userId, weekStart);

        int totalSec = 0;
        int totalCalories = 0;
        int totalDistanceM = 0;
        Map<MachineType, int[]> byType = new LinkedHashMap<>(); // [sessions, seconds, calories, distanceM]
        Map<String, Integer> dailyCount = new LinkedHashMap<>();

        for (Session s : rows) {
            totalSec += s.getDurationSec();
            totalCalories += s.getCalories();
            totalDistanceM += s.getDistanceM();

            int[] agg = byType.computeIfAbsent(s.getMachineType(), k -> new int[4]);
            agg[0] += 1;
            agg[1] += s.getDurationSec();
            agg[2] += s.getCalories();
            agg[3] += s.getDistanceM();

            String key = Times.shanghaiDateKey(s.getStartedAt());
            dailyCount.merge(key, 1, Integer::sum);
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("sessions", rows.size());
        totals.put("minutes", Math.round(totalSec / 60.0));
        totals.put("calories", totalCalories);
        totals.put("distanceM", totalDistanceM);

        List<Map<String, Object>> byTypeList = new ArrayList<>();
        byType.forEach((type, agg) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", type.name());
            item.put("sessions", agg[0]);
            item.put("minutes", Math.round(agg[1] / 60.0));
            item.put("calories", agg[2]);
            item.put("distanceM", agg[3]);
            byTypeList.add(item);
        });

        List<Map<String, Object>> daily = new ArrayList<>();
        for (String date : Times.currentWeekDays()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("date", date);
            item.put("sessions", dailyCount.getOrDefault(date, 0));
            daily.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("weekStart", weekStart.toString());
        out.put("totals", totals);
        out.put("byType", byTypeList);
        out.put("daily", daily);
        return out;
    }
}
