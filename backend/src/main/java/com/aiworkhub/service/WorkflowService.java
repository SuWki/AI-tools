package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.aiworkhub.common.Ids;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Versioned aggregate; every command checks tenant access and optimistic revision. */
@Service
public class WorkflowService {
    private final JdbcTemplate jdbc;
    private final CaseService cases;
    private final AuditService audit;
    private final ObjectMapper json;
    private final JsonNode profiles;

    public WorkflowService(JdbcTemplate jdbc, CaseService cases, AuditService audit, ObjectMapper json) throws Exception {
        this.jdbc = jdbc; this.cases = cases; this.audit = audit; this.json = json;
        try (java.io.InputStream input = new ClassPathResource("profiles.json").getInputStream()) { profiles = json.readTree(input); }
    }
    public JsonNode profile(SessionContext ctx) { return profiles.path(ctx.getTenantId()); }
    public List<Map<String,Object>> members(SessionContext ctx) {
        return jdbc.queryForList("SELECT u.id, u.display_name AS name, m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=?", ctx.getTenantId());
    }
    public ObjectNode get(SessionContext ctx, String id) {
        cases.requireCase(ctx,id);
        List<String> rows = jdbc.query("SELECT content FROM case_workflows WHERE tenant_id=? AND case_id=?", (rs,i)->rs.getString(1),ctx.getTenantId(),id);
        if (!rows.isEmpty()) { try { return (ObjectNode)json.readTree(rows.get(0)); } catch(Exception e) { throw new IllegalStateException(e); } }
        ObjectNode state=json.createObjectNode(); state.put("revision",0);
        state.put("scenario",profile(ctx).path("scenarios").get(0).path("id").asText());
        state.set("fields",json.createObjectNode());
        for(String key:Arrays.asList("replies","tasks","events","evidence")) state.set(key,json.createArrayNode());
        state.put("result",""); return state;
    }
    private String text(JsonNode b,String key,int max,boolean required) {
        String s=b.path(key).asText("").trim();
        if ((required && s.isEmpty()) || s.length()>max) fail("INVALID_INPUT");
        return s;
    }
    private void fail(String code) { throw ApiException.badRequest(code); }
    private ObjectNode item(ObjectNode state,String key,String id) {
        for(JsonNode n:state.withArray(key)) if(n.path("id").asText().equals(id)) return (ObjectNode)n;
        throw ApiException.notFound("NOT_FOUND");
    }
    private String memberRole(SessionContext ctx,String id) {
        List<String> r=jdbc.query("SELECT role FROM memberships WHERE tenant_id=? AND user_id=?",(rs,i)->rs.getString(1),ctx.getTenantId(),id);
        if(r.isEmpty()) fail("INVALID_ASSIGNEE"); return r.get(0);
    }
    private void grant(SessionContext ctx,String caseId,String userId) {
        memberRole(ctx,userId);
        jdbc.update("INSERT OR IGNORE INTO case_access(tenant_id,case_id,user_id) VALUES(?,?,?)",ctx.getTenantId(),caseId,userId);
    }
    private JsonNode scenario(SessionContext ctx,String id) {
        for(JsonNode s:profile(ctx).path("scenarios")) if(s.path("id").asText().equals(id)) return s;
        throw ApiException.badRequest("INVALID_SCENARIO");
    }
    private void invalidate(ObjectNode state) {
        for(JsonNode n:state.withArray("replies")) if(Arrays.asList("approved","pending").contains(n.path("status").asText())) ((ObjectNode)n).put("status","stale");
    }
    private void validateReply(SessionContext ctx,ObjectNode state,ObjectNode reply) {
        if(!reply.path("risk").asText().equals("clarification")) {
            for(JsonNode f:scenario(ctx,state.path("scenario").asText()).path("fields")) {
                JsonNode value=state.path("fields").path(f.path("key").asText());
                if(!value.path("status").asText().equals("confirmed") || value.path("value").asText("").trim().isEmpty() || value.path("source").asText("").trim().isEmpty()) fail("MISSING_CONFIRMED_FIELDS");
            }
            if(state.withArray("evidence").size()==0) fail("EVIDENCE_REQUIRED");
        }
        for(JsonNode e:state.withArray("evidence")) {
            Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM products WHERE tenant_id=? AND id=? AND version=? AND review_status='verified'",Integer.class,ctx.getTenantId(),e.path("id").asText(),e.path("version").asInt());
            if(count==null||count==0) fail("EVIDENCE_CHANGED");
        }
        if(reply.path("body").asText().matches("(?s).*\\{\\{.*") || reply.path("body").asText().contains("[待填写]")) fail("UNRESOLVED_PLACEHOLDER");
    }
    @Transactional
    public ObjectNode command(SessionContext ctx,String id,JsonNode body) {
        ObjectNode state=get(ctx,id);
        int revision=state.path("revision").asInt();
        if(!body.has("revision") || body.path("revision").asInt(-1)!=revision) throw new ApiException(HttpStatus.CONFLICT,"REVISION_CONFLICT");
        String op=text(body,"op",40,true);
        Map<String,Object> c=jdbc.queryForMap("SELECT status,owner_id FROM cases WHERE tenant_id=? AND id=?",ctx.getTenantId(),id);
        boolean editor=ctx.isAdmin() || ctx.getUserId().equals(c.get("owner_id"));
        if(!editor && !Arrays.asList("approve","reject","taskComplete").contains(op)) throw ApiException.forbidden("EDITOR_REQUIRED");
        if("done".equals(c.get("status")) && !"reopen".equals(op)) fail("CASE_CLOSED");
        String detail=op; long now=System.currentTimeMillis();
        switch(op) {
            case "fields": {
                JsonNode sc=scenario(ctx,text(body,"scenario",50,true));
                ObjectNode fields=json.createObjectNode();
                for(JsonNode def:sc.path("fields")) {
                    String key=def.path("key").asText(); JsonNode raw=body.path("fields").path(key);
                    ObjectNode f=json.createObjectNode(); String status=text(raw,"status",30,false);
                    if(!Arrays.asList("missing","unverified","confirmed").contains(status)) status="missing";
                    f.put("value",text(raw,"value",1000,false)); f.put("source",text(raw,"source",500,false)); f.put("status",status);
                    if("confirmed".equals(status) && (f.path("value").asText().isEmpty()||f.path("source").asText().isEmpty())) fail("CONFIRMATION_SOURCE_REQUIRED");
                    f.put("actorId",ctx.getUserId());f.put("at",now); fields.set(key,f);
                }
                if(!fields.equals(state.path("fields")) || !sc.path("id").asText().equals(state.path("scenario").asText())) invalidate(state);
                state.set("fields",fields); state.put("scenario",sc.path("id").asText()); break;
            }
            case "evidence": {
                ArrayNode refs=json.createArrayNode();
                if(!body.path("ids").isArray() || body.path("ids").size()>30) fail("INVALID_INPUT");
                Set<String> seen=new HashSet<>();
                for(JsonNode ref:body.path("ids")) {
                    if(!seen.add(ref.asText())) continue;
                    List<Map<String,Object>> rows=jdbc.queryForList("SELECT id,sku,name,summary,source,version FROM products WHERE tenant_id=? AND id=? AND review_status='verified'",ctx.getTenantId(),ref.asText());
                    if(rows.isEmpty()) fail("EVIDENCE_REQUIRED"); refs.add(json.valueToTree(rows.get(0)));
                }
                state.set("evidence",refs); invalidate(state); break;
            }
            case "draft": {
                ObjectNode reply=json.createObjectNode(); reply.put("id",Ids.uuid()); reply.put("version",state.withArray("replies").size()+1);
                reply.put("body",text(body,"text",12000,true)); reply.put("lang",text(body,"lang",10,true));
                String risk=text(body,"risk",30,true); if(!Arrays.asList("clarification","technical","commercial","aftersales").contains(risk)) fail("INVALID_RISK");
                reply.put("risk",risk);reply.put("authorId",ctx.getUserId());reply.put("authorName",ctx.getDisplayName());reply.put("createdAt",now);reply.put("status","draft");
                reply.set("fields",state.path("fields").deepCopy());reply.set("evidence",state.path("evidence").deepCopy());
                invalidate(state);state.withArray("replies").add(reply); break;
            }
            case "submit": case "approve": case "reject": case "copy": case "dispatch": {
                ObjectNode reply=item(state,"replies",text(body,"id",100,true));String status=reply.path("status").asText();
                boolean latest=state.withArray("replies").get(state.withArray("replies").size()-1)==reply;
                if(!latest) fail("REPLY_SUPERSEDED");
                if("submit".equals(op)) {
                    if(!"draft".equals(status)) fail("INVALID_TRANSITION");
                    validateReply(ctx,state,reply);
                    reply.set("fields",state.path("fields").deepCopy());reply.set("evidence",state.path("evidence").deepCopy());
                    if(reply.path("risk").asText().equals("clarification")) {reply.put("status","approved");reply.put("reviewerId",ctx.getUserId());reply.put("reviewerName",ctx.getDisplayName());reply.put("reviewedAt",now);}
                    else {
                        String reviewer=text(body,"reviewerId",100,true);String role=memberRole(ctx,reviewer);
                        if(reviewer.equals(reply.path("authorId").asText())) fail("SELF_APPROVAL_FORBIDDEN");
                        String required=reply.path("risk").asText().equals("technical")?"REVIEWER":"MANAGER";
                        if(!required.equals(role)) fail("REVIEW_AUTHORITY_REQUIRED");
                        reply.put("reviewerId",reviewer);reply.put("status","pending");grant(ctx,id,reviewer);
                    }
                } else if("approve".equals(op)||"reject".equals(op)) {
                    String required=reply.path("risk").asText().equals("technical")?"REVIEWER":"MANAGER";
                    if(!ctx.getUserId().equals(reply.path("reviewerId").asText()) || !required.equals(ctx.getRole()) || ctx.getUserId().equals(reply.path("authorId").asText())) throw ApiException.forbidden("REVIEW_AUTHORITY_REQUIRED");
                    if(!"pending".equals(status)) fail("INVALID_TRANSITION");
                    if("approve".equals(op)) validateReply(ctx,state,reply);
                    reply.put("reviewNote",text(body,"note",2000,"reject".equals(op)));reply.put("reviewerName",ctx.getDisplayName());reply.put("reviewedAt",now);reply.put("status","approve".equals(op)?"approved":"rejected");
                } else {
                    if(!Arrays.asList("approved","sent").contains(status)) fail("APPROVAL_REQUIRED");
                    validateReply(ctx,state,reply);
                    if("dispatch".equals(op)) {
                        if("sent".equals(status)) fail("ALREADY_SENT");
                        String channel=text(body,"channel",50,true);long sentAt=body.path("sentAt").asLong();
                        if(sentAt<=0||sentAt>now+60_000) fail("INVALID_TIME");
                        reply.put("channel",channel);reply.put("sentAt",sentAt);reply.put("dispatchedBy",ctx.getUserId());reply.put("status","sent");
                    }
                }
                detail=op+" V"+reply.path("version").asInt(); break;
            }
            case "task": {
                ObjectNode task=json.createObjectNode();task.put("id",Ids.uuid());task.put("title",text(body,"title",300,true));
                String assignee=text(body,"assigneeId",100,true);grant(ctx,id,assignee);
                long due=body.path("dueAt").asLong(); if(due<=0) fail("INVALID_TIME");
                String zone=text(body,"timeZone",80,true);try {java.time.ZoneId.of(zone);}catch(Exception e){fail("INVALID_TIMEZONE");}
                task.put("assigneeId",assignee);task.put("dueAt",due);task.put("timeZone",zone);task.put("status","open");task.put("createdAt",now);state.withArray("tasks").add(task);break;
            }
            case "taskComplete": case "taskCancel": {
                ObjectNode task=item(state,"tasks",text(body,"id",100,true));
                if(!editor && !ctx.getUserId().equals(task.path("assigneeId").asText())) throw ApiException.forbidden("TASK_ASSIGNEE_REQUIRED");
                if(!"open".equals(task.path("status").asText())) fail("INVALID_TRANSITION");
                task.put("result",text(body,"note",2000,true));task.put("status","taskComplete".equals(op)?"done":"cancelled");task.put("completedAt",now);break;
            }
            case "assign": {
                String owner=text(body,"ownerId",100,true);grant(ctx,id,owner);
                jdbc.update("UPDATE cases SET owner_id=? WHERE tenant_id=? AND id=?",owner,ctx.getTenantId(),id); break;
            }
            case "status": {
                String status=text(body,"status",30,true);
                if(!Arrays.asList("open","progress","waiting_customer","waiting_internal").contains(status)) fail("INVALID_TRANSITION");
                if(status.startsWith("waiting")) {
                    text(body,"note",2000,true);boolean active=false;for(JsonNode task:state.withArray("tasks")) if("open".equals(task.path("status").asText())) active=true;
                    if(!active) fail("FOLLOWUP_REQUIRED");
                }
                String stage=text(body,"stage",40,true); if(!Arrays.asList("clarify","verify","commercial","followup").contains(stage)) fail("INVALID_TRANSITION");
                jdbc.update("UPDATE cases SET status=?,stage=? WHERE tenant_id=? AND id=?",status,stage,ctx.getTenantId(),id);detail=status+" "+text(body,"note",2000,false);break;
            }
            case "close": {
                for(JsonNode task:state.withArray("tasks")) if("open".equals(task.path("status").asText())) fail("OPEN_TASKS");
                for(JsonNode reply:state.withArray("replies")) if("pending".equals(reply.path("status").asText())) fail("PENDING_APPROVAL");
                String result=text(body,"result",40,true);if(!Arrays.asList("order","answered","lost","deferred","invalid").contains(result)) fail("INVALID_INPUT");
                state.put("result",result);state.put("conclusion",text(body,"note",2000,true));state.put("closedAt",now);
                jdbc.update("UPDATE cases SET status='done' WHERE tenant_id=? AND id=?",ctx.getTenantId(),id);break;
            }
            case "reopen": {detail=text(body,"note",2000,true);state.put("result","");jdbc.update("UPDATE cases SET status='open' WHERE tenant_id=? AND id=?",ctx.getTenantId(),id);break;}
            default: fail("UNKNOWN_COMMAND");
        }
        ObjectNode event=json.createObjectNode();event.put("id",Ids.uuid());event.put("action",op);event.put("detail",detail);event.put("actor",ctx.getDisplayName());event.put("at",now);state.withArray("events").add(event);
        state.put("revision",revision+1);
        try {
            if(revision==0) jdbc.update("INSERT INTO case_workflows(tenant_id,case_id,revision,content) VALUES(?,?,?,?)",ctx.getTenantId(),id,1,json.writeValueAsString(state));
            else if(jdbc.update("UPDATE case_workflows SET content=?,revision=? WHERE tenant_id=? AND case_id=? AND revision=?",json.writeValueAsString(state),revision+1,ctx.getTenantId(),id,revision)!=1) throw new ApiException(HttpStatus.CONFLICT,"REVISION_CONFLICT");
        } catch(org.springframework.dao.DuplicateKeyException e) {throw new ApiException(HttpStatus.CONFLICT,"REVISION_CONFLICT");}
        catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
        jdbc.update("UPDATE cases SET updated_at=? WHERE tenant_id=? AND id=?",now,ctx.getTenantId(),id);
        audit.log(ctx,"workflow_"+op,"case",id,"revision:"+(revision+1)); return state;
    }
    public List<JsonNode> inbox(SessionContext ctx) {
        List<JsonNode> out=new ArrayList<>();
        for(Map<String,Object> c:cases.list(ctx,null)) {
            ObjectNode state=get(ctx,String.valueOf(c.get("id")));
            for(String key:Arrays.asList("tasks","replies")) for(JsonNode n:state.withArray(key)) {
                boolean visible="tasks".equals(key) ? "open".equals(n.path("status").asText())&&ctx.getUserId().equals(n.path("assigneeId").asText()) : "pending".equals(n.path("status").asText())&&ctx.getUserId().equals(n.path("reviewerId").asText());
                if(visible){ObjectNode row=n.deepCopy();row.put("kind",key);row.put("caseId",String.valueOf(c.get("id")));row.put("topic",String.valueOf(c.get("topic")));out.add(row);}
            }
        }
        return out;
    }
}
