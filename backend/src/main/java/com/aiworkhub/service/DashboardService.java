package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {

    private final JdbcTemplate jdbc;
    private final CaseService cases;
    private final AuditService audit;

    public DashboardService(JdbcTemplate jdbc, CaseService cases, AuditService audit) {
        this.jdbc = jdbc;
        this.cases = cases;
        this.audit = audit;
    }

    public Map<String, Object> dashboard(SessionContext ctx) {
        int total = count("SELECT COUNT(*) FROM cases WHERE tenant_id=?", ctx.getTenantId());
        int done = count("SELECT COUNT(*) FROM cases WHERE tenant_id=? AND status='done'", ctx.getTenantId());
        int knowledge = count("SELECT COUNT(*) FROM products WHERE tenant_id=?", ctx.getTenantId());
        int unreviewed = count("SELECT COUNT(*) FROM products WHERE tenant_id=? AND review_status='unreviewed'", ctx.getTenantId());
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("totalCases", total);
        result.put("openCases", total - done);
        result.put("doneCases", done);
        result.put("knowledgeCount", knowledge);
        result.put("unreviewedCount", unreviewed);
        result.put("recentCases", cases.recent(ctx, 4));
        result.put("requirements", cases.requirements(ctx));
        return result;
    }

    public Map<String, Object> stats(SessionContext ctx) {
        int reviews = count("SELECT COUNT(*) FROM reviews WHERE tenant_id=?", ctx.getTenantId());
        int done = count("SELECT COUNT(*) FROM cases WHERE tenant_id=? AND status='done'", ctx.getTenantId());
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("totalCases", count("SELECT COUNT(*) FROM cases WHERE tenant_id=?", ctx.getTenantId()));
        result.put("knowledgeCount", count("SELECT COUNT(*) FROM products WHERE tenant_id=?", ctx.getTenantId()));
        result.put("reviewCount", reviews);
        result.put("doneCases", done);
        return result;
    }

    public List<Map<String, Object>> audit(SessionContext ctx, int limit) {
        return audit.list(ctx, limit);
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }
}
