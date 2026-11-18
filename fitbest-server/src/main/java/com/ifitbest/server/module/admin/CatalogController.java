package com.ifitbest.server.module.admin;

import java.util.List;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.infra.persistence.MachineType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@AuthedAdmin
@RequestMapping("/api/v1/admin/system")
public class CatalogController {
    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    public record MachineTypeInput(@NotBlank @Size(max = 80) String label, @NotNull @PositiveOrZero Integer sortOrder,
                                   @NotNull Boolean selectable) {}
    public record SettingsInput(@NotBlank @Size(max = 80) String defaultGymTimezone) {}

    @GetMapping("/dictionary/machine-types")
    public List<CatalogService.MachineTypeItem> machineTypes() {
        return catalog.machineTypes();
    }

    @PutMapping("/dictionary/machine-types/{code}")
    public ResponseEntity<Void> updateMachineType(@CurrentAdmin AdminPayload actor, @PathVariable MachineType code,
                                                   @Valid @RequestBody MachineTypeInput input) {
        catalog.updateMachineType(actor, code, input.label(), input.sortOrder(), input.selectable());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/settings")
    public CatalogService.BusinessSettings settings() {
        return catalog.settings();
    }

    @PutMapping("/settings")
    public CatalogService.BusinessSettings updateSettings(@CurrentAdmin AdminPayload actor,
                                                            @Valid @RequestBody SettingsInput input) {
        return catalog.updateSettings(actor, input.defaultGymTimezone());
    }
}
