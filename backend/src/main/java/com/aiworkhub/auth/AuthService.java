package com.aiworkhub.auth;

import com.aiworkhub.common.ApiException;
import com.aiworkhub.common.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuthService {

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    public AuthService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    public Map<String, Object> login(String email, String password) {
        if (email == null || email.trim().isEmpty() || password == null || password.isEmpty()) {
            throw ApiException.badRequest("Email and password are required");
        }
        List<Map<String, Object>> users = jdbc.query(
                "SELECT id, email, password_hash, display_name, locale FROM users WHERE lower(email)=lower(?)",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("email", rs.getString("email"));
                    m.put("passwordHash", rs.getString("password_hash"));
                    m.put("displayName", rs.getString("display_name"));
                    m.put("locale", rs.getString("locale"));
                    return m;
                }, email.trim());
        if (users.isEmpty()) {
            throw ApiException.unauthorized("Invalid email or password");
        }
        Map<String, Object> user = users.get(0);
        if (!passwordEncoder.matches(password, String.valueOf(user.get("passwordHash")))) {
            throw ApiException.unauthorized("Invalid email or password");
        }
        List<Map<String, Object>> memberships = memberships(String.valueOf(user.get("id")));
        if (memberships.isEmpty()) {
            throw ApiException.forbidden("No workspace membership");
        }
        String tenantId = String.valueOf(memberships.get(0).get("id"));
        String token = Ids.uuid();
        jdbc.update("INSERT INTO sessions(token, user_id, tenant_id, created_at) VALUES (?,?,?,?)",
                token, user.get("id"), tenantId, System.currentTimeMillis());
        Map<String, Object> result = me(new SessionContext(
                String.valueOf(user.get("id")), tenantId,
                String.valueOf(memberships.get(0).get("role")),
                String.valueOf(user.get("email")), String.valueOf(user.get("displayName")),
                String.valueOf(user.get("locale"))));
        result.put("token", token);
        return result;
    }

    public Map<String, Object> me(SessionContext ctx) {
        Map<String, Object> tenant = jdbc.query(
                "SELECT id, name_zh, name_en, business_type FROM tenants WHERE id=?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("nameZh", rs.getString("name_zh"));
                    m.put("nameEn", rs.getString("name_en"));
                    m.put("businessType", rs.getString("business_type"));
                    return m;
                }, ctx.getTenantId()).stream().findFirst().orElse(null);
        if (tenant == null) {
            throw ApiException.notFound("Workspace not found");
        }
        Map<String, Object> user = new LinkedHashMap<String, Object>();
        user.put("id", ctx.getUserId());
        user.put("email", ctx.getEmail());
        user.put("displayName", ctx.getDisplayName());
        user.put("locale", ctx.getLocale());
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("user", user);
        result.put("activeTenant", tenant);
        result.put("activeTenantId", ctx.getTenantId());
        result.put("role", ctx.getRole());
        result.put("tenants", memberships(ctx.getUserId()));
        return result;
    }

    public Map<String, Object> switchTenant(SessionContext ctx, String tenantId, String token) {
        List<Map<String, Object>> membership = jdbc.query(
                "SELECT m.role FROM memberships m WHERE m.user_id=? AND m.tenant_id=?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("role", rs.getString("role"));
                    return m;
                }, ctx.getUserId(), tenantId);
        if (membership.isEmpty()) {
            throw ApiException.forbidden("You do not have access to this workspace");
        }
        // A user session is scoped to one active workspace; switching updates the caller's sessions.
        jdbc.update("UPDATE sessions SET tenant_id=? WHERE token=? AND user_id=?", tenantId, token, ctx.getUserId());
        String role = String.valueOf(membership.get(0).get("role"));
        SessionContext next = new SessionContext(ctx.getUserId(), tenantId, role, ctx.getEmail(), ctx.getDisplayName(), ctx.getLocale());
        return me(next);
    }

    public void logout(String token) {
        jdbc.update("DELETE FROM sessions WHERE token=?", token);
    }

    public void updateLocale(SessionContext ctx, String locale) {
        if (!"zh".equals(locale) && !"en".equals(locale)) {
            throw ApiException.badRequest("Unsupported locale");
        }
        jdbc.update("UPDATE users SET locale=? WHERE id=?", locale, ctx.getUserId());
    }

    public SessionContext require(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw ApiException.unauthorized("Authentication required");
        }
        String token = header.substring(7).trim();
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT s.user_id, s.tenant_id, u.email, u.display_name, u.locale, m.role " +
                        "FROM sessions s JOIN users u ON u.id=s.user_id " +
                        "JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id " +
                        "WHERE s.token=? AND s.created_at>?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("userId", rs.getString("user_id"));
                    m.put("tenantId", rs.getString("tenant_id"));
                    m.put("email", rs.getString("email"));
                    m.put("displayName", rs.getString("display_name"));
                    m.put("locale", rs.getString("locale"));
                    m.put("role", rs.getString("role"));
                    return m;
                }, token, System.currentTimeMillis() - 12 * 3600_000L);
        if (rows.isEmpty()) {
            throw ApiException.unauthorized("Session expired or invalid");
        }
        Map<String, Object> row = rows.get(0);
        String expectedTenant = request.getHeader("X-Workspace-Id");
        if (expectedTenant != null && !expectedTenant.equals(String.valueOf(row.get("tenantId")))) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "WORKSPACE_CHANGED");
        }
        return new SessionContext(
                String.valueOf(row.get("userId")), String.valueOf(row.get("tenantId")),
                String.valueOf(row.get("role")), String.valueOf(row.get("email")),
                String.valueOf(row.get("displayName")), String.valueOf(row.get("locale")));
    }

    private List<Map<String, Object>> memberships(String userId) {
        List<Map<String, Object>> list = new ArrayList<Map<String, Object>>();
        list.addAll(jdbc.query(
                "SELECT t.id, t.name_zh, t.name_en, t.business_type, m.role " +
                        "FROM memberships m JOIN tenants t ON t.id=m.tenant_id " +
                        "WHERE m.user_id=? ORDER BY t.rowid",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("nameZh", rs.getString("name_zh"));
                    m.put("nameEn", rs.getString("name_en"));
                    m.put("businessType", rs.getString("business_type"));
                    m.put("role", rs.getString("role"));
                    return m;
                }, userId));
        return list;
    }
}
