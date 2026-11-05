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
public class AnalysisService {

    private static final String[] CHECK_ZH = {
            "对话是否明确记录客户要解决的问题？",
            "是否确认必要的产品规格、数量或工况？",
            "报价、交期及承诺是否有授权资料依据？",
            "是否有明确的下一步跟进动作？"
    };
    private static final String[] CHECK_EN = {
            "Is the customer's actual need clear?",
            "Are required product specifications, quantity or conditions captured?",
            "Are price and delivery promises supported by approved information?",
            "Is the next follow-up action clearly defined?"
    };

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final CaseService cases;
    private final KnowledgeService knowledge;

    public AnalysisService(JdbcTemplate jdbc, AuditService audit, CaseService cases, KnowledgeService knowledge) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.cases = cases;
        this.knowledge = knowledge;
    }

    public Map<String, Object> checklist(SessionContext ctx, Map<String, String> body) {
        String conversation = body.get("conversation") == null ? "" : body.get("conversation").trim();
        if (conversation.isEmpty()) {
            throw ApiException.badRequest("Conversation is required");
        }
        boolean en = "en".equals(body.get("lang"));
        StringBuilder sb = new StringBuilder();
        sb.append(en ? "Please review these points manually; no AI is called here:"
                : "请根据以下清单由人工检查；此处没有调用 AI：").append("\n\n");
        String[] checks = en ? CHECK_EN : CHECK_ZH;
        for (int i = 0; i < checks.length; i++) {
            sb.append(i + 1).append(". ").append(checks[i]).append("\n");
        }
        sb.append("\n").append(en ? "Conversation to review:" : "待复盘对话：").append("\n").append(conversation);
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("checklist", sb.toString());
        result.put("checks", checks);
        return result;
    }

    public List<Map<String, Object>> reviews(SessionContext ctx) {
        return jdbc.query(
                "SELECT r.id, r.case_id, r.conversation, r.result, r.created_at, u.display_name " +
                        "FROM reviews r LEFT JOIN users u ON u.id=r.created_by " +
                        "WHERE r.tenant_id=? ORDER BY r.created_at DESC",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("id", rs.getString("id"));
                    m.put("caseId", rs.getString("case_id"));
                    m.put("conversation", rs.getString("conversation"));
                    m.put("result", rs.getString("result"));
                    m.put("authorName", rs.getString("display_name"));
                    m.put("createdAt", rs.getLong("created_at"));
                    return m;
                }, ctx.getTenantId());
    }

    @Transactional
    public Map<String, Object> saveReview(SessionContext ctx, Map<String, String> body) {
        String conversation = body.get("conversation") == null ? "" : body.get("conversation").trim();
        String result = body.get("result") == null ? "" : body.get("result").trim();
        if (result.isEmpty()) {
            throw ApiException.badRequest("Review conclusion is required");
        }
        if (result.length() > 8000 || conversation.length() > 8000) {
            throw ApiException.badRequest("Review content is too long");
        }
        String caseId = body.get("caseId");
        if (caseId != null && !caseId.trim().isEmpty()) {
            cases.requireCase(ctx, caseId.trim());
        } else {
            caseId = null;
        }
        String id = Ids.shortId("R-");
        long now = System.currentTimeMillis();
        jdbc.update("INSERT INTO reviews(id, tenant_id, case_id, conversation, result, created_by, created_at) " +
                        "VALUES (?,?,?,?,?,?,?)",
                id, ctx.getTenantId(), caseId, conversation, result, ctx.getUserId(), now);
        audit.log(ctx, "review_saved", "review", id, result.length() > 80 ? result.substring(0, 80) : result);
        return reviews(ctx).stream().filter(m -> id.equals(m.get("id"))).findFirst()
                .orElseThrow(() -> ApiException.notFound("Review not found"));
    }

    public Map<String, Object> prompt(SessionContext ctx, String caseId, String type, String lang) {
        List<Map<String, Object>> tenants = jdbc.query(
                "SELECT name_zh, name_en FROM tenants WHERE id=?",
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<String, Object>();
                    m.put("nameZh", rs.getString("name_zh"));
                    m.put("nameEn", rs.getString("name_en"));
                    return m;
                }, ctx.getTenantId());
        String orgZh = tenants.isEmpty() ? "" : String.valueOf(tenants.get(0).get("nameZh"));
        String orgEn = tenants.isEmpty() ? "" : String.valueOf(tenants.get(0).get("nameEn"));
        Map<String, Object> c = null;
        if (caseId != null && !caseId.trim().isEmpty()) {
            c = cases.detail(ctx, caseId);
        }
        List<Map<String, Object>> products = knowledge.list(ctx, null);
        boolean en = "en".equals(lang);
        String safeType = type == null ? "reply" : type;
        StringBuilder sb = new StringBuilder();
        if (en) {
            sb.append("You are an internal business assistant. Use only the information supplied. Never invent prices, stock, delivery dates, technical specifications, or deal outcomes.\n");
            sb.append("Business: ").append(orgEn).append(".\n");
            sb.append("Task: ").append(taskLabel(safeType, true)).append(".\n");
            if (c != null) {
                sb.append("Customer message: ").append(localized(c, "message", true)).append("\n");
                sb.append("Topic: ").append(localized(c, "topic", true)).append("\n");
            }
            sb.append("Separate confirmed facts from missing details. Use supplied product records only and do not treat unreviewed entries as approved facts.\n");
            sb.append("Reference entries (limited to these items):\n");
            for (int i = 0; i < Math.min(products.size(), 5); i++) {
                Map<String, Object> p = products.get(i);
                sb.append(p.get("sku")).append(": ").append(localized(p, "name", true)).append(" — ")
                        .append(localized(p, "summary", true)).append(" [")
                        .append(Boolean.TRUE.equals(p.get("verified")) ? "reviewed" : "unreviewed").append("]\n");
            }
            sb.append("Output: 1. Customer needs 2. Missing details 3. Draft response 4. Next action 5. Claims and specs needing human review.");
        } else {
            sb.append("你是企业内部业务辅助工具。只依据已提供的信息分析，禁止编造价格、库存、交期、产品规格或成交结论。\n");
            sb.append("公司业务：").append(orgZh).append("。\n");
            sb.append("任务：").append(taskLabel(safeType, false)).append("。\n");
            if (c != null) {
                sb.append("客户原话：").append(localized(c, "message", false)).append("\n");
                sb.append("主题：").append(localized(c, "topic", false)).append("\n");
            }
            sb.append("请先明确已知事实与缺失信息。需要产品信息时，只使用我提供的知识条目，未审核的条目不得当作确定事实。\n");
            sb.append("内部参考资料（仅限以下条目）：\n");
            for (int i = 0; i < Math.min(products.size(), 5); i++) {
                Map<String, Object> p = products.get(i);
                sb.append(p.get("sku")).append(": ").append(localized(p, "name", false)).append(" — ")
                        .append(localized(p, "summary", false)).append(" [")
                        .append(Boolean.TRUE.equals(p.get("verified")) ? "reviewed" : "unreviewed").append("]\n");
            }
            sb.append("输出格式：1.客户需求 2.缺失信息 3.参考回复 4.下步动作 5.待人工核验的承诺与参数。");
        }
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("prompt", sb.toString());
        return result;
    }

    private String localized(Map<String, Object> row, String key, boolean en) {
        if (en) {
            Object value = row.get(key + "En");
            if (value != null && !String.valueOf(value).isEmpty()) {
                return String.valueOf(value);
            }
        }
        Object value = row.get(key);
        return value == null ? "" : String.valueOf(value);
    }

    private String taskLabel(String type, boolean en) {
        if (en) {
            if ("audit".equals(type)) return "Review sales communication";
            if ("productCompare".equals(type)) return "Summarize product facts requiring validation";
            if ("content".equals(type)) return "Draft product listing copy requiring approval";
            return "Draft a customer reply";
        }
        if ("audit".equals(type)) return "诊断销售沟通话术";
        if ("productCompare".equals(type)) return "整理产品信息与待核对参数";
        if ("content".equals(type)) return "生成需人工审核的商品描述";
        return "生成销售回复建议";
    }
}
