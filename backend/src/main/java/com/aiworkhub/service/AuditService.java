package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuditService {

    private final JdbcTemplate jdbc;

    public AuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void log(SessionContext ctx, String action, String entityType, String entityId, String detail) {
        jdbc.update("INSERT INTO audit_logs(id, tenant_id, actor_id, action, entity_type, entity_id, detail, created_at) " +
                        "VALUES (?,?,?,?,?,?,?,?)",
                Ids.shortId("A-"), ctx.getTenantId(), ctx.getUserId(), action, entityType, entityId, detail,
                System.currentTimeMillis());
    }

    public List<Map<String, Object>> list(SessionContext ctx, int limit) {
        return jdbc.query(
                "SELECT a.id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at, u.display_name " +
                        "FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id " +
                        "WHERE a.tenant_id=? ORDER BY a.created_at DESC LIMIT ?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("action", rs.getString("action"));
                    m.put("entityType", rs.getString("entity_type"));
                    m.put("entityId", rs.getString("entity_id"));
                    m.put("detail", rs.getString("detail"));
                    m.put("actorName", rs.getString("display_name"));
                    m.put("createdAt", rs.getLong("created_at"));
                    return m;
                }, ctx.getTenantId(), limit);
    }
}
