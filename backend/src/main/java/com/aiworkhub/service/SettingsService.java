package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SettingsService {

    private final JdbcTemplate jdbc;
    private final DashboardService dashboard;
    private final CaseService cases;
    private final KnowledgeService knowledge;
    private final AnalysisService analysis;
    private final AuditService audit;
    private final DataSeeder seeder;

    public SettingsService(JdbcTemplate jdbc, DashboardService dashboard, CaseService cases,
                           KnowledgeService knowledge, AnalysisService analysis, AuditService audit,
                           DataSeeder seeder) {
        this.jdbc = jdbc;
        this.dashboard = dashboard;
        this.cases = cases;
        this.knowledge = knowledge;
        this.analysis = analysis;
        this.audit = audit;
        this.seeder = seeder;
    }

    public Map<String, Object> settings(SessionContext ctx) {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("stats", dashboard.stats(ctx));
        result.put("role", ctx.getRole());
        result.put("user", ctx.getEmail());
        return result;
    }

    public Map<String, Object> export(SessionContext ctx) {
        if(!ctx.isAdmin()) throw ApiException.forbidden("EXPORT_FORBIDDEN");
        Map<String, Object> data = new LinkedHashMap<String, Object>();
        List<Map<String, Object>> caseList = cases.list(ctx, null);
        for (Map<String, Object> c : caseList) {
            c.put("notes", cases.notes(ctx, String.valueOf(c.get("id"))));
        }
        data.put("cases", caseList);
        data.put("products", knowledge.list(ctx, null));
        data.put("reviews", analysis.reviews(ctx));
        data.put("requirements", cases.requirements(ctx));
        data.put("workflows",jdbc.queryForList("SELECT case_id, revision, content FROM case_workflows WHERE tenant_id=?",ctx.getTenantId()));
        audit.log(ctx,"data_exported","tenant",ctx.getTenantId(),"JSON");
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("exportedAt", Instant.now().toString());
        result.put("note", "AI WorkHub V2 MVP local export");
        result.put("data", data);
        return result;
    }

    @Transactional
    public Map<String, Object> resetDemo(SessionContext ctx) {
        if (!ctx.isAdmin()) {
            throw ApiException.forbidden("Only workspace admin can reset demo data");
        }
        seeder.resetTenant(ctx.getTenantId());
        audit.log(ctx, "demo_reset", "tenant", ctx.getTenantId(), null);
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("reset", true);
        return result;
    }
}
