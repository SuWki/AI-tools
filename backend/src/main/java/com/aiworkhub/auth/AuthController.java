package com.aiworkhub.auth;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        return authService.login(body.get("email"), body.get("password"));
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return authService.me(ctx);
    }

    @PostMapping("/switch-tenant")
    public Map<String, Object> switchTenant(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                            @RequestBody Map<String, String> body) {
        return authService.switchTenant(ctx, body.get("tenantId"));
    }

    @PatchMapping("/locale")
    public Map<String, Object> locale(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @RequestBody Map<String, String> body) {
        authService.updateLocale(ctx, body.get("locale"));
        return authService.me(ctx);
    }
}
