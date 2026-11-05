package com.aiworkhub.controller;

import com.aiworkhub.auth.AuthInterceptor;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.aiworkhub.service.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class DashboardController {

    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("status", "ok");
        result.put("service", "AI WorkHub V2 MVP");
        return result;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return dashboard.dashboard(ctx);
    }

    @GetMapping("/audit")
    public List<Map<String, Object>> audit(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                           @RequestParam(value = "limit", defaultValue = "50") int limit) {
        if (!"ADMIN".equals(ctx.getRole()) && !"MANAGER".equals(ctx.getRole())) {
            throw ApiException.forbidden("Only admin or manager can view audit logs");
        }
        return dashboard.audit(ctx, Math.min(Math.max(limit, 1), 200));
    }
}
