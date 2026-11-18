package com.ifitbest.server.module.admin;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec;
import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.infra.persistence.MachineStatus;
import com.ifitbest.server.infra.persistence.MachineType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 管理端业务端点 —— /api/v1/admin/**（需管理员登录，写操作自动审计） */
@RestController
@RequestMapping("/api/v1/admin")
@AuthedAdmin
public class AdminController {

    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    // ---------- 请求体 ----------

    public record CreateMachineBody(
        UUID orgId, UUID gymId,
        @NotNull UUID modelId,
        @NotBlank @Size(max = 100) String serialNo,
        @Pattern(regexp = "active|maintenance|retired") String status,
        @Size(max = 50) String firmware) {
    }

    public record UpdateMachineBody(
        UUID gymId,
        @Pattern(regexp = "active|maintenance|retired") String status,
        @Size(max = 50) String firmware) {
    }

    public record CreateMachineModelBody(
        UUID orgId,
        @NotNull MachineType type,
        @NotBlank @Size(max = 100) String model,
        @Size(max = 50) String brand,
        Map<String, Object> specs) {
    }

    public record CreateNfcTagBody(@NotBlank @Size(max = 200) String tagValue) {
    }

    public record CreateEventLinkBody(
        UUID orgId,
        @NotBlank @Size(max = 100) String title,
        @Size(max = 200) String subtitle,
        @Size(max = 500) String coverUrl,
        @NotBlank @Pattern(regexp = "^https?://.*", message = "请填写合法的跳转链接") String externalUrl,
        LocalDateTime startAt,
        LocalDateTime endAt,
        Integer sort,
        @Pattern(regexp = "published|draft|offline") String status) {
    }

    public record UpdateEventLinkBody(
        UUID orgId,
        @Size(min = 1, max = 100) String title,
        @Size(max = 200) String subtitle,
        @Size(max = 500) String coverUrl,
        @Pattern(regexp = "^https?://.*", message = "请填写合法的跳转链接") String externalUrl,
        LocalDateTime startAt,
        LocalDateTime endAt,
        @Min(0) @Max(9999) Integer sort,
        @Pattern(regexp = "published|draft|offline") String status) {
    }

    public record CreateGymBody(
        UUID orgId,
        @NotBlank(message = "请填写门店名称") @Size(max = 100) String name,
        @NotBlank(message = "请填写门店编码") @Size(max = 50) String code,
        @Size(max = 300) String address,
        @Size(max = 6) String districtCode,
        @Size(max = 50) String timezone) {
    }

    public record UpdateGymBody(
        @Size(min = 1, max = 100) String name,
        @Size(min = 1, max = 50) String code,
        @Size(max = 300) String address,
        @Size(max = 6) String districtCode,
        @Size(max = 50) String timezone,
        @Pattern(regexp = "active|closed|maintenance") String status) {
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AdminController.class);

    // ---------- 概览 / 用户 ----------

    @GetMapping("overview")
    public Map<String, Object> overview(@CurrentAdmin JwtCodec.AdminPayload payload,
                                        @RequestParam(required = false) String app) {
        return admin.overview(payload, app);
    }

    @GetMapping("users")
    public Map<String, Object> users(@CurrentAdmin JwtCodec.AdminPayload payload,
                                     @RequestParam(required = false) String keyword,
                                     @RequestParam(required = false) String app,
                                     @RequestParam(required = false) String page,
                                     @RequestParam(required = false) String pageSize) {
        return admin.users(payload, keyword, app, page, pageSize);
    }

    @GetMapping("users/{id}")
    public Map<String, Object> userDetail(@CurrentAdmin JwtCodec.AdminPayload payload,
                                          @PathVariable UUID id,
                                          @RequestParam(required = false) String app) {
        return admin.userDetail(payload, id, app);
    }

    // ---------- 训练数据 ----------

    @GetMapping("sessions")
    public Map<String, Object> sessions(@CurrentAdmin JwtCodec.AdminPayload payload,
                                        @RequestParam(required = false) String gymId,
                                        @RequestParam(required = false) String machineId,
                                        @RequestParam(required = false) String app,
                                        @RequestParam(required = false) String from,
                                        @RequestParam(required = false) String to,
                                        @RequestParam(required = false) String page,
                                        @RequestParam(required = false) String pageSize) {
        return admin.sessions(payload, gymId, machineId, app, from, to, page, pageSize);
    }

    @GetMapping("training-records")
    public Map<String, Object> trainingRecords(@CurrentAdmin JwtCodec.AdminPayload payload,
                                               @RequestParam(required = false) String app,
                                               @RequestParam(required = false) String userId,
                                               @RequestParam(required = false) String completed,
                                               @RequestParam(required = false) String from,
                                               @RequestParam(required = false) String to,
                                               @RequestParam(required = false) String page,
                                               @RequestParam(required = false) String pageSize) {
        return admin.trainingRecords(payload, app, userId, completed, from, to, page, pageSize);
    }

    @GetMapping("device-sessions")
    public Map<String, Object> deviceSessions(@CurrentAdmin JwtCodec.AdminPayload payload,
                                              @RequestParam(required = false) String app,
                                              @RequestParam(required = false) String mode,
                                              @RequestParam(required = false) String deviceSerial,
                                              @RequestParam(required = false) String from,
                                              @RequestParam(required = false) String to,
                                              @RequestParam(required = false) String page,
                                              @RequestParam(required = false) String pageSize) {
        return admin.deviceSessions(payload, app, mode, deviceSerial, from, to, page, pageSize);
    }

    // ---------- 器械 ----------

    @GetMapping("machines")
    public List<Map<String, Object>> machines(@CurrentAdmin JwtCodec.AdminPayload payload,
                                              @RequestParam(required = false) String gymId) {
        return admin.machines(payload, gymId);
    }

    @PostMapping("machines")
    public Map<String, Object> createMachine(@CurrentAdmin JwtCodec.AdminPayload payload,
                                             @Valid @RequestBody CreateMachineBody body) {
        MachineStatus status = body.status() == null ? null : MachineStatus.valueOf(body.status());
        return admin.createMachine(payload, body.orgId(), body.gymId(), body.modelId(),
            body.serialNo(), status, body.firmware());
    }

    @PatchMapping("machines/{id}")
    public Map<String, Object> updateMachine(@CurrentAdmin JwtCodec.AdminPayload payload,
                                             @PathVariable UUID id,
                                             @Valid @RequestBody UpdateMachineBody body) {
        MachineStatus status = body.status() == null ? null : MachineStatus.valueOf(body.status());
        return admin.updateMachine(payload, id, body.gymId(), status, body.firmware());
    }

    @GetMapping("machine-models")
    public List<Map<String, Object>> machineModels(@CurrentAdmin JwtCodec.AdminPayload payload) {
        return admin.machineModels(payload);
    }

    @PostMapping("machine-models")
    public Map<String, Object> createMachineModel(@CurrentAdmin JwtCodec.AdminPayload payload,
                                                  @Valid @RequestBody CreateMachineModelBody body) {
        return admin.createMachineModel(payload, body.orgId(), body.type(), body.model(),
            body.brand(), body.specs());
    }

    public record ModelDetails(@NotBlank @Size(max = 100) String model, @Size(max = 50) String brand) {}

    @PatchMapping("machine-models/{id}")
    public void updateMachineModel(@CurrentAdmin JwtCodec.AdminPayload payload, @PathVariable UUID id,
                                   @Valid @RequestBody ModelDetails body) {
        admin.updateMachineModel(payload, id, body.model(), body.brand());
    }

    @PostMapping("tags/generate")
    public Map<String, Object> generateQrTag(@CurrentAdmin JwtCodec.AdminPayload payload,
                                             @RequestParam UUID machineId) {
        return admin.generateQrTag(payload, machineId);
    }

    @PostMapping("tags/nfc")
    public Map<String, Object> createNfcTag(@CurrentAdmin JwtCodec.AdminPayload payload,
                                            @RequestParam UUID machineId,
                                            @Valid @RequestBody CreateNfcTagBody body) {
        return admin.createNfcTag(payload, machineId, body.tagValue());
    }

    // ---------- 赛事 ----------

    @GetMapping("event-links")
    public List<Map<String, Object>> eventLinks(@CurrentAdmin JwtCodec.AdminPayload payload) {
        return admin.eventLinks(payload);
    }

    @PostMapping("event-links")
    public Map<String, Object> createEventLink(@CurrentAdmin JwtCodec.AdminPayload payload,
                                               @Valid @RequestBody CreateEventLinkBody body) {
        return admin.createEventLink(payload, body.orgId(), body.title(), body.subtitle(), body.coverUrl(),
            body.externalUrl(), body.startAt(), body.endAt(), body.sort(), body.status());
    }

    @PatchMapping("event-links/{id}")
    public Map<String, Object> updateEventLink(@CurrentAdmin JwtCodec.AdminPayload payload,
                                               @PathVariable UUID id,
                                               @Valid @RequestBody UpdateEventLinkBody body) {
        return admin.updateEventLink(payload, id, body.orgId(), body.title(), body.subtitle(), body.coverUrl(),
            body.externalUrl(), body.startAt(), body.endAt(), body.sort(), body.status());
    }

    @DeleteMapping("event-links/{id}")
    public Map<String, Object> deleteEventLink(@CurrentAdmin JwtCodec.AdminPayload payload,
                                               @PathVariable UUID id) {
        return admin.deleteEventLink(payload, id);
    }

    @GetMapping("event-registrations")
    public Map<String, Object> registrations(@CurrentAdmin JwtCodec.AdminPayload payload,
                                             @RequestParam(required = false) String eventId,
                                             @RequestParam(required = false) String from,
                                             @RequestParam(required = false) String to,
                                             @RequestParam(required = false) String page,
                                             @RequestParam(required = false) String pageSize) {
        return admin.registrations(payload, eventId, from, to, page, pageSize);
    }

    // ---------- 门店 ----------

    @GetMapping("gyms")
    public List<Map<String, Object>> gyms(@CurrentAdmin JwtCodec.AdminPayload payload) {
        return admin.gyms(payload);
    }

    @PostMapping("gyms")
    public Map<String, Object> createGym(@CurrentAdmin JwtCodec.AdminPayload payload,
                                         @Valid @RequestBody CreateGymBody body) {
        return admin.createGym(payload, body.orgId(), body.name(), body.code(), body.address(), body.timezone(), body.districtCode());
    }

    @PatchMapping("gyms/{id}")
    public Map<String, Object> updateGym(@CurrentAdmin JwtCodec.AdminPayload payload,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody UpdateGymBody body) {
        return admin.updateGym(payload, id, body.name(), body.code(), body.address(), body.timezone(), body.status(), body.districtCode());
    }

    @DeleteMapping("gyms/{id}")
    public Map<String, Object> deleteGym(@CurrentAdmin JwtCodec.AdminPayload payload,
                                         @PathVariable UUID id) {
        return admin.deleteGym(payload, id);
    }

    // ---------- 审计 ----------

    @GetMapping("audit-logs")
    public Map<String, Object> auditLogs(@CurrentAdmin JwtCodec.AdminPayload payload,
                                         @RequestParam(required = false) String page,
                                         @RequestParam(required = false) String pageSize,
                                         @RequestParam(required = false) UUID adminId,
                                         @RequestParam(required = false) UUID orgId,
                                         @RequestParam(required = false) String action,
                                         @RequestParam(required = false) java.time.LocalDate from,
                                         @RequestParam(required = false) java.time.LocalDate to) {
        return admin.auditLogs(payload, page, pageSize, new AdminService.AuditFilters(adminId, orgId, action, from, to));
    }
}
