package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.aiworkhub.common.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class KnowledgeService {

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final KnowledgeVersionService versions;

    public KnowledgeService(JdbcTemplate jdbc, AuditService audit, KnowledgeVersionService versions) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.versions = versions;
    }

    public List<Map<String, Object>> list(SessionContext ctx, String q) {
        String sql = "SELECT p.*, u.display_name FROM products p LEFT JOIN users u ON u.id=p.reviewer_id WHERE p.tenant_id=?";
        String needle = q == null ? "" : q.trim().toLowerCase();
        if (!needle.isEmpty()) {
            sql += " AND (lower(p.name) LIKE ? OR lower(p.sku) LIKE ? OR lower(p.summary) LIKE ?" +
                    " OR lower(COALESCE(p.name_en,'')) LIKE ?)";
        }
        sql += " ORDER BY p.created_at DESC";
        Object[] args;
        if (needle.isEmpty()) {
            args = new Object[]{ctx.getTenantId()};
        } else {
            String like = "%" + needle + "%";
            args = new Object[]{ctx.getTenantId(), like, like, like, like};
        }
        return jdbc.query(sql, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("id", rs.getString("id"));
            m.put("sku", rs.getString("sku"));
            m.put("name", rs.getString("name"));
            m.put("nameEn", rs.getString("name_en"));
            m.put("summary", rs.getString("summary"));
            m.put("summaryEn", rs.getString("summary_en"));
            m.put("source", rs.getString("source"));
            m.put("reviewStatus", rs.getString("review_status"));
            m.put("verified", "verified".equals(rs.getString("review_status")));
            m.put("reviewerName", rs.getString("display_name"));
            m.put("version", rs.getInt("version"));
            m.put("updatedAt", rs.getLong("updated_at"));
            return m;
        }, args);
    }

    @Transactional
    public Map<String, Object> create(SessionContext ctx, Map<String, String> body) {
        String name = body.get("name") == null ? "" : body.get("name").trim();
        String sku = body.get("sku") == null ? "" : body.get("sku").trim();
        String summary = body.get("summary") == null ? "" : body.get("summary").trim();
        if (name.isEmpty() || sku.isEmpty() || summary.isEmpty()) {
            throw ApiException.badRequest("Name, SKU and summary are required");
        }
        if (name.length() > 120 || sku.length() > 80 || summary.length() > 4000) {
            throw ApiException.badRequest("Input exceeds maximum length");
        }
        String source = body.get("source") == null || body.get("source").trim().isEmpty()
                ? "User entry" : body.get("source").trim();
        if (source.length() > 180) {
            throw ApiException.badRequest("Source is too long");
        }
        String id = Ids.shortId("P-");
        long now = System.currentTimeMillis();
        jdbc.update("INSERT INTO products(id, tenant_id, sku, name, summary, source, review_status, version, created_at, updated_at) " +
                        "VALUES (?,?,?,?,?,?,?,?,?,?)",
                id, ctx.getTenantId(), sku, name, summary, source, "unreviewed", 1, now, now);
        audit.log(ctx, "knowledge_created", "product", id, sku);
        versions.snapshot(ctx,id);
        return find(ctx, id);
    }

    @Transactional
    public Map<String, Object> review(SessionContext ctx, String productId) {
        if (!ctx.canReviewKnowledge()) {
            throw ApiException.forbidden("Only admin or product reviewer can approve knowledge");
        }
        Map<String,Object> current=find(ctx, productId);
        if(Boolean.TRUE.equals(current.get("verified"))) return current;
        List<String> authors=jdbc.query("SELECT author_id FROM knowledge_versions WHERE tenant_id=? AND product_id=? AND version=?",(rs,i)->rs.getString(1),ctx.getTenantId(),productId,current.get("version"));
        if(!authors.isEmpty() && ctx.getUserId().equals(authors.get(0))) throw ApiException.forbidden("SELF_APPROVAL_FORBIDDEN");
        if("retired".equals(current.get("reviewStatus"))) throw ApiException.badRequest("INVALID_TRANSITION");
        long now = System.currentTimeMillis();
        jdbc.update("UPDATE products SET review_status='verified', reviewer_id=?, version=version+1, updated_at=? " +
                "WHERE id=? AND tenant_id=?", ctx.getUserId(), now, productId, ctx.getTenantId());
        audit.log(ctx, "knowledge_reviewed", "product", productId, "verified");
        versions.snapshot(ctx,productId);
        return find(ctx, productId);
    }

    private Map<String, Object> find(SessionContext ctx, String productId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT p.*, u.display_name FROM products p LEFT JOIN users u ON u.id=p.reviewer_id " +
                        "WHERE p.tenant_id=? AND p.id=?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("sku", rs.getString("sku"));
                    m.put("name", rs.getString("name"));
                    m.put("nameEn", rs.getString("name_en"));
                    m.put("summary", rs.getString("summary"));
                    m.put("summaryEn", rs.getString("summary_en"));
                    m.put("source", rs.getString("source"));
                    m.put("reviewStatus", rs.getString("review_status"));
                    m.put("verified", "verified".equals(rs.getString("review_status")));
                    m.put("reviewerName", rs.getString("display_name"));
                    m.put("version", rs.getInt("version"));
                    m.put("updatedAt", rs.getLong("updated_at"));
                    return m;
                }, ctx.getTenantId(), productId);
        if (rows.isEmpty()) {
            throw ApiException.notFound("Knowledge item not found");
        }
        return rows.get(0);
    }
}
