package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.aiworkhub.common.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CaseService {

    private static final List<String> STATUSES = Arrays.asList("open", "progress", "waiting_customer", "waiting_internal", "done");

    private String access(SessionContext ctx) {
        if(ctx.isAdmin()) return "";
        return " AND (c.owner_id=? OR EXISTS(SELECT 1 FROM case_access a WHERE a.tenant_id=c.tenant_id AND a.case_id=c.id AND a.user_id=?))";
    }

    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public CaseService(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public List<Map<String, Object>> list(SessionContext ctx, String status) {
        String sql = "SELECT c.*, u.display_name FROM cases c LEFT JOIN users u ON u.id=c.owner_id " +
                "WHERE c.tenant_id=?";
        List<Object> args = new ArrayList<Object>();
        args.add(ctx.getTenantId());
        sql += access(ctx);
        if(!ctx.isAdmin()){args.add(ctx.getUserId());args.add(ctx.getUserId());}
        if (status != null && !status.isEmpty() && !"all".equals(status)) {
            if (!STATUSES.contains(status)) {
                throw ApiException.badRequest("Unknown case status");
            }
            sql += " AND c.status=?";
            args.add(status);
        }
        sql += " ORDER BY c.created_at DESC";
        return jdbc.query(sql, (rs, i) -> baseCase(rs), args.toArray());
    }

    public List<Map<String, Object>> recent(SessionContext ctx, int limit) {
        List<Map<String,Object>> all=list(ctx,null);
        return all.subList(0,Math.min(limit,all.size()));
    }

    public Map<String, Object> detail(SessionContext ctx, String caseId) {
        requireCase(ctx,caseId);
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT c.*, u.display_name FROM cases c LEFT JOIN users u ON u.id=c.owner_id " +
                        "WHERE c.tenant_id=? AND c.id=?",
                (rs, i) -> baseCase(rs), ctx.getTenantId(), caseId);
        if (rows.isEmpty()) {
            throw ApiException.notFound("Case not found");
        }
        Map<String, Object> result = rows.get(0);
        result.put("notes", notes(ctx, caseId));
        return result;
    }

    public List<Map<String, Object>> notes(SessionContext ctx, String caseId) {
        return jdbc.query(
                "SELECT n.id, n.text, n.created_at, u.display_name FROM case_notes n " +
                        "LEFT JOIN users u ON u.id=n.author_id " +
                        "WHERE n.tenant_id=? AND n.case_id=? ORDER BY n.created_at DESC",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("text", rs.getString("text"));
                    m.put("authorName", rs.getString("display_name"));
                    m.put("createdAt", rs.getLong("created_at"));
                    return m;
                }, ctx.getTenantId(), caseId);
    }

    @Transactional
    public Map<String, Object> create(SessionContext ctx, Map<String, String> body) {
        String customer = trimmed(body.get("customer"));
        String topic = trimmed(body.get("topic"));
        String message = trimmed(body.get("message"));
        if (customer.isEmpty() || topic.isEmpty() || message.isEmpty()) {
            throw ApiException.badRequest("Customer, topic and message are required");
        }
        if (customer.length() > 100 || topic.length() > 120 || message.length() > 4000) {
            throw ApiException.badRequest("Input exceeds maximum length");
        }
        String channel = allowedChannel(body.get("channel"));
        String priority = "high".equals(body.get("priority")) ? "high" : "normal";
        long now = System.currentTimeMillis();
        String id = uniqueCaseId(ctx.getTenantId());
        jdbc.update("INSERT INTO cases(id, tenant_id, customer, topic, message, channel, status, priority, stage, owner_id, created_at, updated_at) " +
                        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                id, ctx.getTenantId(), customer, topic, message, channel, "open", priority, "start",
                ctx.getUserId(), now, now);
        audit.log(ctx, "case_created", "case", id, customer);
        return detail(ctx, id);
    }

    @Transactional
    public Map<String, Object> updateStatus(SessionContext ctx, String caseId, String status) {
        if("done".equals(status)) throw ApiException.badRequest("WORKFLOW_REQUIRED");
        requireEditor(ctx,caseId);
        if (!STATUSES.contains(status)) {
            throw ApiException.badRequest("Unknown case status");
        }
        requireCase(ctx, caseId);
        long now = System.currentTimeMillis();
        jdbc.update("UPDATE cases SET status=?, updated_at=? WHERE id=? AND tenant_id=?",
                status, now, caseId, ctx.getTenantId());
        String noteId = Ids.shortId("N-");
        jdbc.update("INSERT INTO case_notes(id, tenant_id, case_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)",
                noteId, ctx.getTenantId(), caseId, ctx.getUserId(), "status:" + status, now);
        audit.log(ctx, "case_status_changed", "case", caseId, status);
        return detail(ctx, caseId);
    }

    @Transactional
    public Map<String, Object> addNote(SessionContext ctx, String caseId, String text) {
        requireEditor(ctx,caseId);
        if (text == null || text.trim().isEmpty()) {
            throw ApiException.badRequest("Follow-up note is required");
        }
        if (text.length() > 1400) {
            throw ApiException.badRequest("Follow-up note is too long");
        }
        requireCase(ctx, caseId);
        long now = System.currentTimeMillis();
        jdbc.update("INSERT INTO case_notes(id, tenant_id, case_id, author_id, text, created_at) VALUES (?,?,?,?,?,?)",
                Ids.shortId("N-"), ctx.getTenantId(), caseId, ctx.getUserId(), text.trim(), now);
        jdbc.update("UPDATE cases SET updated_at=? WHERE id=? AND tenant_id=?", now, caseId, ctx.getTenantId());
        audit.log(ctx, "followup_added", "case", caseId, text.trim());
        return detail(ctx, caseId);
    }

    public Map<String, Object> reply(SessionContext ctx, String caseId) {
        requireCase(ctx, caseId);
        List<Map<String, Object>> templates = jdbc.query(
                "SELECT reply_zh, reply_en, next_zh, next_en FROM reply_templates WHERE tenant_id=?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("replyZh", rs.getString("reply_zh"));
                    m.put("replyEn", rs.getString("reply_en"));
                    m.put("nextZh", rs.getString("next_zh"));
                    m.put("nextEn", rs.getString("next_en"));
                    return m;
                }, ctx.getTenantId());
        Map<String, Object> result = templates.isEmpty() ? new LinkedHashMap<String, Object>() : templates.get(0);
        List<Map<String, Object>> rules = requirements(ctx);
        result.put("requirements", rules);
        return result;
    }

    public List<Map<String, Object>> requirements(SessionContext ctx) {
        return jdbc.query(
                "SELECT id, text_zh, text_en FROM requirement_rules WHERE tenant_id=? ORDER BY sort_no",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("textZh", rs.getString("text_zh"));
                    m.put("textEn", rs.getString("text_en"));
                    return m;
                }, ctx.getTenantId());
    }

    public void auditReplyCopy(SessionContext ctx, String caseId) {
        requireCase(ctx, caseId);
        audit.log(ctx, "reply_template_copied", "case", caseId, null);
    }

    public Map<String, Object> requireCase(SessionContext ctx, String caseId) {
        List<Object> args=new ArrayList<Object>();args.add(caseId);args.add(ctx.getTenantId());
        if(!ctx.isAdmin()){args.add(ctx.getUserId());args.add(ctx.getUserId());}
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT c.id FROM cases c WHERE c.id=? AND c.tenant_id=?"+access(ctx),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    return m;
                }, args.toArray());
        if (rows.isEmpty()) {
            throw ApiException.notFound("Case not found");
        }
        return rows.get(0);
    }

    private void requireEditor(SessionContext ctx,String caseId){
        requireCase(ctx,caseId);
        String owner=jdbc.queryForObject("SELECT owner_id FROM cases WHERE tenant_id=? AND id=?",String.class,ctx.getTenantId(),caseId);
        if(!ctx.isAdmin()&&!ctx.getUserId().equals(owner)) throw ApiException.forbidden("EDITOR_REQUIRED");
        String status=jdbc.queryForObject("SELECT status FROM cases WHERE tenant_id=? AND id=?",String.class,ctx.getTenantId(),caseId);
        if("done".equals(status)) throw ApiException.badRequest("CASE_CLOSED");
    }

    private Map<String, Object> baseCase(ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", rs.getString("id"));
        m.put("customer", rs.getString("customer"));
        m.put("customerEn", rs.getString("customer_en"));
        m.put("topic", rs.getString("topic"));
        m.put("topicEn", rs.getString("topic_en"));
        m.put("message", rs.getString("message"));
        m.put("messageEn", rs.getString("message_en"));
        m.put("channel", rs.getString("channel"));
        m.put("status", rs.getString("status"));
        m.put("priority", rs.getString("priority"));
        m.put("stage", rs.getString("stage"));
        m.put("ownerId", rs.getString("owner_id"));
        m.put("ownerName", rs.getString("display_name"));
        m.put("createdAt", rs.getLong("created_at"));
        m.put("updatedAt", rs.getLong("updated_at"));
        return m;
    }

    private String uniqueCaseId(String tenantId) {
        String id = Ids.shortId("C-");
        int suffix = 0;
        while (!jdbc.queryForList("SELECT id FROM cases WHERE id=? AND tenant_id=?", id, tenantId).isEmpty()) {
            suffix++;
            id = Ids.shortId("C-") + suffix;
        }
        return id;
    }

    private String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    private String allowedChannel(String value) {
        if (value == null) {
            return "Other";
        }
        if ("WhatsApp".equals(value) || "Email".equals(value) || "Wechat".equals(value) || "Other".equals(value)) {
            return value;
        }
        return "Other";
    }
}
