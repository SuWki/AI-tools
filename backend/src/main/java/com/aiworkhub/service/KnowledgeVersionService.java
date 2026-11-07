package com.aiworkhub.service;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.fasterxml.jackson.databind.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class KnowledgeVersionService {
    private final JdbcTemplate jdbc;private final ObjectMapper json;private final AuditService audit;
    public KnowledgeVersionService(JdbcTemplate jdbc,ObjectMapper json,AuditService audit){this.jdbc=jdbc;this.json=json;this.audit=audit;}
    private Map<String,Object> product(SessionContext ctx,String id){List<Map<String,Object>> rows=jdbc.queryForList("SELECT * FROM products WHERE tenant_id=? AND id=?",ctx.getTenantId(),id);if(rows.isEmpty())throw ApiException.notFound("NOT_FOUND");return rows.get(0);}
    public void snapshot(SessionContext ctx,String id){
        Map<String,Object> p=product(ctx,id);try{jdbc.update("INSERT OR IGNORE INTO knowledge_versions(tenant_id,product_id,version,content,status,author_id,created_at) VALUES(?,?,?,?,?,?,?)",ctx.getTenantId(),id,p.get("version"),json.writeValueAsString(p),"verified".equals(p.get("review_status"))?"published":"draft",ctx.getUserId(),System.currentTimeMillis());}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
    }
    public List<Map<String,Object>> history(SessionContext ctx,String id){snapshot(ctx,id);return jdbc.queryForList("SELECT version,content,status,author_id AS authorId,created_at AS createdAt,reviewer_id AS reviewerId,reviewed_at AS reviewedAt FROM knowledge_versions WHERE tenant_id=? AND product_id=? ORDER BY version DESC",ctx.getTenantId(),id);}
    @Transactional public Map<String,Object> revise(SessionContext ctx,String id,JsonNode body){
        Map<String,Object> current=product(ctx,id);snapshot(ctx,id);
        if(body.path("version").asInt()!=((Number)current.get("version")).intValue())throw new ApiException(org.springframework.http.HttpStatus.CONFLICT,"REVISION_CONFLICT");
        int next=jdbc.queryForObject("SELECT MAX(version) FROM knowledge_versions WHERE tenant_id=? AND product_id=?",Integer.class,ctx.getTenantId(),id)+1;
        String name=body.path("name").asText("").trim(),summary=body.path("summary").asText("").trim(),source=body.path("source").asText("").trim();
        if(name.isEmpty()||summary.isEmpty()||source.isEmpty()||name.length()>120||summary.length()>4000||source.length()>180)throw ApiException.badRequest("INVALID_INPUT");
        Map<String,Object> draft=new LinkedHashMap<>(current);draft.put("name",name);draft.put("summary",summary);draft.put("source",source);draft.put("name_en",null);draft.put("summary_en",null);draft.put("version",next);
        try{jdbc.update("INSERT INTO knowledge_versions(tenant_id,product_id,version,content,status,author_id,created_at) VALUES(?,?,?,?,?,?,?)",ctx.getTenantId(),id,next,json.writeValueAsString(draft),"pending",ctx.getUserId(),System.currentTimeMillis());}catch(Exception e){throw new IllegalStateException(e);}
        audit.log(ctx,"knowledge_revision_submitted","product",id,"version:"+next);return draft;
    }
    @Transactional public Map<String,Object> publish(SessionContext ctx,String id,int version){
        if(!ctx.canReviewKnowledge())throw ApiException.forbidden("REVIEW_AUTHORITY_REQUIRED");
        Map<String,Object> current=product(ctx,id);
        List<Map<String,Object>> rows=jdbc.queryForList("SELECT * FROM knowledge_versions WHERE tenant_id=? AND product_id=? AND version=? AND status='pending'",ctx.getTenantId(),id,version);
        if(rows.isEmpty()||version<=((Number)current.get("version")).intValue())throw ApiException.badRequest("INVALID_TRANSITION");
        Map<String,Object> draft=rows.get(0);if(ctx.getUserId().equals(draft.get("author_id")))throw ApiException.forbidden("SELF_APPROVAL_FORBIDDEN");
        try{JsonNode p=json.readTree(String.valueOf(draft.get("content")));long now=System.currentTimeMillis();
            jdbc.update("UPDATE products SET name=?,summary=?,source=?,name_en=NULL,summary_en=NULL,version=?,review_status='verified',reviewer_id=?,updated_at=? WHERE tenant_id=? AND id=?",p.path("name").asText(),p.path("summary").asText(),p.path("source").asText(),version,ctx.getUserId(),now,ctx.getTenantId(),id);
            jdbc.update("UPDATE knowledge_versions SET status='superseded' WHERE tenant_id=? AND product_id=? AND status='published'",ctx.getTenantId(),id);
            jdbc.update("UPDATE knowledge_versions SET status='published',reviewer_id=?,reviewed_at=? WHERE tenant_id=? AND product_id=? AND version=?",ctx.getUserId(),now,ctx.getTenantId(),id,version);
        }catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
        audit.log(ctx,"knowledge_version_published","product",id,"version:"+version);return product(ctx,id);
    }
    @Transactional public void retire(SessionContext ctx,String id){if(!ctx.canReviewKnowledge())throw ApiException.forbidden("REVIEW_AUTHORITY_REQUIRED");snapshot(ctx,id);jdbc.update("UPDATE products SET review_status='retired',updated_at=? WHERE tenant_id=? AND id=?",System.currentTimeMillis(),ctx.getTenantId(),id);jdbc.update("UPDATE knowledge_versions SET status='retired' WHERE tenant_id=? AND product_id=? AND status='published'",ctx.getTenantId(),id);audit.log(ctx,"knowledge_retired","product",id,"");}
}
