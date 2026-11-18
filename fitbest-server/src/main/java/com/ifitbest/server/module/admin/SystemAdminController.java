package com.ifitbest.server.module.admin;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.infra.persistence.Org;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/system")
public class SystemAdminController {
    private final SystemAdminService service;

    public SystemAdminController(SystemAdminService service) {
        this.service = service;
    }

    public record AccountInput(@NotBlank @Size(max = 80) String name, @NotBlank @Pattern(regexp = "1[3-9][0-9]{9}") String phone,
                               @NotBlank String role, UUID orgId, UUID gymId, boolean siteEditor, boolean sitePublisher) {}
    public record OrgInput(@NotBlank @Size(max = 100) String name,
                           @NotBlank @Pattern(regexp = "[a-zA-Z0-9_-]{1,40}") String code,
                           @NotBlank @Pattern(regexp = "active|disabled") String status) {}
    public record StatusInput(@NotBlank @Pattern(regexp = "active|disabled") String status) {}
    public record SetupInput(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
                             @NotBlank @Size(max = 72) String password) {}
    public record PasswordInput(@NotBlank @Size(max = 256) String oldPassword, @NotBlank @Size(max = 72) String password) {}

    @AuthedAdmin
    @GetMapping("/accounts")
    public List<Map<String, Object>> accounts(@CurrentAdmin AdminPayload actor) {
        return service.accounts(actor);
    }

    @AuthedAdmin
    @PostMapping("/accounts")
    public ResponseEntity<Map<String, Object>> create(@CurrentAdmin AdminPayload actor, @Valid @RequestBody AccountInput input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.saveAccount(actor, null, input));
    }

    @AuthedAdmin
    @PutMapping("/accounts/{id}")
    public Map<String, Object> update(@CurrentAdmin AdminPayload actor, @PathVariable UUID id,
                                      @Valid @RequestBody AccountInput input) {
        return service.saveAccount(actor, id, input);
    }

    @AuthedAdmin
    @PostMapping("/accounts/{id}/reset-password")
    public ResponseEntity<Map<String, Object>> reset(@CurrentAdmin AdminPayload actor, @PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.resetPassword(actor, id));
    }

    @AuthedAdmin
    @PutMapping("/accounts/{id}/status")
    public Map<String, Object> status(@CurrentAdmin AdminPayload actor, @PathVariable UUID id,
                                      @Valid @RequestBody StatusInput input) {
        return service.setStatus(actor, id, input.status());
    }

    @AuthedAdmin
    @PostMapping("/accounts/{id}/revoke-sessions")
    public ResponseEntity<Void> revoke(@CurrentAdmin AdminPayload actor, @PathVariable UUID id) {
        service.revokeSessions(actor, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/setup-password")
    public ResponseEntity<Void> setup(@Valid @RequestBody SetupInput input) {
        service.setup(input.token(), input.password());
        return ResponseEntity.noContent().build();
    }

    @AuthedAdmin(allowViewerWrite = true)
    @PostMapping("/my-password")
    public ResponseEntity<Void> changePassword(@CurrentAdmin AdminPayload actor, @Valid @RequestBody PasswordInput input) {
        service.changePassword(actor, input.oldPassword(), input.password());
        return ResponseEntity.noContent().build();
    }

    @AuthedAdmin
    @GetMapping("/organizations")
    public List<Org> organizations(@CurrentAdmin AdminPayload actor) {
        return service.organizations(actor);
    }

    @AuthedAdmin
    @PostMapping("/organizations")
    public Org createOrg(@CurrentAdmin AdminPayload actor, @Valid @RequestBody OrgInput input) {
        return service.saveOrganization(actor, null, input.name(), input.code(), input.status());
    }

    @AuthedAdmin
    @PutMapping("/organizations/{id}")
    public Org updateOrg(@CurrentAdmin AdminPayload actor, @PathVariable UUID id, @Valid @RequestBody OrgInput input) {
        return service.saveOrganization(actor, id, input.name(), input.code(), input.status());
    }
}
