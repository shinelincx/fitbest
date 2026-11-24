package com.ifitbest.server.module.machine;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MachineNavigationController {
    private final MachineNavigationService navigation;

    public MachineNavigationController(MachineNavigationService navigation) {
        this.navigation = navigation;
    }

    @GetMapping("/api/v1/machine-navigation")
    public ResponseEntity<MachineNavigationService.PublicConfig> get() {
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(navigation.publicConfig());
    }
}
