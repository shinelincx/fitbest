package com.ifitbest.server.module.admin;

import java.util.List;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.infra.persistence.MachineType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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

    public record RegionInput(
        @NotBlank @Pattern(regexp = "[0-9]{6}") String code,
        @NotBlank @Size(max = 80) String name,
        @Pattern(regexp = "[0-9]{6}") String parentCode) {}
    public record RegionName(@NotBlank @Size(max = 80) String name) {}

    @GetMapping("/dictionary/regions")
    public List<CatalogService.Region> regions() {
        return catalog.regions();
    }

    @PostMapping("/dictionary/regions")
    public void createRegion(@CurrentAdmin AdminPayload actor, @Valid @RequestBody RegionInput input) {
        catalog.createRegion(actor, input.code(), input.name(), input.parentCode());
    }

    @PutMapping("/dictionary/regions/{code}")
    public void renameRegion(@CurrentAdmin AdminPayload actor, @PathVariable String code, @Valid @RequestBody RegionName input) {
        catalog.renameRegion(actor, code, input.name());
    }

    @DeleteMapping("/dictionary/regions/{code}")
    public void deleteRegion(@CurrentAdmin AdminPayload actor, @PathVariable String code) {
        catalog.deleteRegion(actor, code);
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
