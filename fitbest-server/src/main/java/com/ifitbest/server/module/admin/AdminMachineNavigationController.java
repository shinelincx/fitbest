package com.ifitbest.server.module.admin;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import com.ifitbest.server.infra.persistence.MachineType;
import com.ifitbest.server.module.machine.MachineNavigationService;
import com.ifitbest.server.module.machine.MachineNavigationService.Config;
import com.ifitbest.server.module.machine.MachineNavigationService.ItemInput;
import com.ifitbest.server.module.machine.MachineNavigationService.Preview;
import com.ifitbest.server.module.machine.MachineNavigationService.ResistanceInput;
import com.ifitbest.server.module.machine.MachineNavigationService.RuleInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@AuthedAdmin
@RestController
@RequestMapping("/api/v1/admin/system/machine-navigation")
public class AdminMachineNavigationController {
    private final MachineNavigationService navigation;

    public AdminMachineNavigationController(MachineNavigationService navigation) {
        this.navigation = navigation;
    }

    @GetMapping
    public Config list(@CurrentAdmin AdminPayload actor) {
        return navigation.adminConfig(actor);
    }

    @GetMapping("/preview")
    public Preview preview(@CurrentAdmin AdminPayload actor, @RequestParam @NotBlank @Size(max = 128) String name) {
        return navigation.preview(actor, name);
    }

    @PutMapping("/items/{code}")
    public Config item(@CurrentAdmin AdminPayload actor, @PathVariable MachineType code,
                       @Valid @RequestBody ItemInput input) {
        return navigation.saveItem(actor, code, input);
    }

    @PostMapping("/ble-rules")
    public Config createRule(@CurrentAdmin AdminPayload actor, @Valid @RequestBody RuleInput input) {
        return navigation.saveRule(actor, null, input);
    }

    @PutMapping("/ble-rules/{id}")
    public Config updateRule(@CurrentAdmin AdminPayload actor, @PathVariable UUID id, @Valid @RequestBody RuleInput input) {
        return navigation.saveRule(actor, id, input);
    }

    @PutMapping("/resistance-disabled-patterns")
    public Config resistance(@CurrentAdmin AdminPayload actor, @Valid @RequestBody ResistanceInput input) {
        return navigation.saveResistance(actor, input);
    }
}
