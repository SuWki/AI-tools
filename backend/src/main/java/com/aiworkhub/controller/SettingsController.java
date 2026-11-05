package com.aiworkhub.controller;

import com.aiworkhub.auth.AuthInterceptor;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.service.SettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class SettingsController {

    private final SettingsService settings;

    public SettingsController(SettingsService settings) {
        this.settings = settings;
    }

    @GetMapping("/settings")
    public Map<String, Object> settings(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return settings.settings(ctx);
    }

    @GetMapping("/export")
    public Map<String, Object> export(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return settings.export(ctx);
    }

    @PostMapping("/admin/reset-demo")
    public Map<String, Object> reset(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return settings.resetDemo(ctx);
    }
}
