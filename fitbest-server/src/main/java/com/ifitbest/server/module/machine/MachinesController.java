package com.ifitbest.server.module.machine;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** 器械端点 —— /api/v1/machines（公开）、/api/v1/scan/resolve（公开） */
@RestController
@RequestMapping("/api/v1")
public class MachinesController {

    private final MachinesService machines;

    public MachinesController(MachinesService machines) {
        this.machines = machines;
    }

    public record ResolveBody(
        @Pattern(regexp = "qr|nfc", message = "kind 仅支持 qr / nfc") String kind,
        @NotBlank String value) {
    }

    @GetMapping("machines")
    public java.util.List<Map<String, Object>> list(@RequestParam(required = false) String gymId) {
        return machines.list(gymId);
    }

    @PostMapping("scan/resolve")
    public Map<String, Object> resolve(@Valid @RequestBody ResolveBody body) {
        return machines.resolve(body.kind(), body.value());
    }
}
