package com.aiworkhub.service;

import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.common.ApiException;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import java.math.BigDecimal;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Service
public class ProcurementService {
 @org.springframework.beans.factory.annotation.Value("${procurement.portal-url:}") private String portalUrl;
 @org.springframework.beans.factory.annotation.Value("${procurement.relay-key:}") private String relayKey;
 private final JdbcTemplate db; private final ObjectMapper json;
 public ProcurementService(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
 private void require(boolean ok,String code){if(!ok)throw ApiException.badRequest(code);}
 private String text(JsonNode b,String k){String s=b.path(k).asText("").trim();require(!s.isEmpty()&&s.length()<4000,"INVALID_"+k.toUpperCase());return s;}
 private String hash(String s){try{byte[] bytes=MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte v:bytes)out.append(String.format("%02x",v));return out.toString();}catch(Exception e){throw new IllegalStateException(e);}}
 private ObjectNode read(String id){List<String> rows=db.query("SELECT content FROM procurement_projects WHERE id=?",(r,i)->r.getString(1),id);if(rows.isEmpty())throw ApiException.notFound("PROJECT_NOT_FOUND");try{return (ObjectNode)json.readTree(rows.get(0));}catch(Exception e){throw new IllegalStateException(e);}}
 private ObjectNode own(SessionContext c,String id){ObjectNode p=read(id);if(!c.getTenantId().equals(p.path("tenantId").asText()))throw ApiException.notFound("PROJECT_NOT_FOUND");return p;}
 private void permission(SessionContext c){if(!c.isAdmin()&&!"MANAGER".equals(c.getRole()))throw ApiException.forbidden("PROCUREMENT_AUTHORITY_REQUIRED");}
 private void save(ObjectNode p,int old){p.put("revision",old+1);try{String body=json.writeValueAsString(p);int n=db.update("UPDATE procurement_projects SET content=?,revision=? WHERE id=? AND revision=?",body,old+1,p.path("id").asText(),old);if(n!=1)throw new ApiException(HttpStatus.CONFLICT,"REVISION_CONFLICT");}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}}
 private void event(ObjectNode p,String action,String actor,String detail){p.withArray("events").addObject().put("id",UUID.randomUUID().toString()).put("action",action).put("actor",actor).put("detail",detail).put("at",System.currentTimeMillis());}
 public List<JsonNode> list(SessionContext c){permission(c);List<JsonNode> out=new ArrayList<>();for(Map<String,Object> row:db.queryForList("SELECT id FROM procurement_projects WHERE tenant_id=?",c.getTenantId()))out.add(own(c,String.valueOf(row.get("id"))));return out;}
 public JsonNode get(SessionContext c,String id){permission(c);return own(c,id);}
 public JsonNode metrics(SessionContext c){
   permission(c);ObjectNode result=json.createObjectNode();Map<String,ObjectNode> groups=new LinkedHashMap<>();
   for(JsonNode project:list(c))for(JsonNode invitation:project.path("invitations")){
     String name=invitation.path("name").asText();ObjectNode row=groups.get(name);
     if(row==null){row=json.createObjectNode().put("name",name).put("endedInvitations",0).put("quoted",0).put("awards",0).put("withdrawals",0).put("completed",0).put("completedWithChanges",0);groups.put(name,row);}
     String supplier=invitation.path("id").asText();boolean ended=System.currentTimeMillis()>=project.path("deadline").asLong(),quoted=false;
     for(JsonNode q:project.path("quotes"))if(supplier.equals(q.path("supplierId").asText()))quoted=true;
     if(ended){row.put("endedInvitations",row.path("endedInvitations").asInt()+1);if(quoted)row.put("quoted",row.path("quoted").asInt()+1);}
     if(supplier.equals(project.path("award").path("supplierId").asText())){
       row.put("awards",row.path("awards").asInt()+1);
       if(project.has("withdrawal"))row.put("withdrawals",row.path("withdrawals").asInt()+1);
       if(project.has("completedAt")){row.put("completed",row.path("completed").asInt()+1);boolean changed=false;for(JsonNode change:project.path("changes"))if(change.path("status").asText().equals("approved"))changed=true;if(changed)row.put("completedWithChanges",row.path("completedWithChanges").asInt()+1);}
     }
   }
   ArrayNode rows=result.putArray("suppliers");groups.values().forEach(rows::add);result.put("identityBasis","supplier display name; verify identity before business evaluation");return result;
 }
 public void relayAuth(String key){if(relayKey==null||relayKey.length()<32||!MessageDigest.isEqual(relayKey.getBytes(StandardCharsets.UTF_8),key.getBytes(StandardCharsets.UTF_8)))throw ApiException.forbidden("RELAY_DISABLED_OR_UNAUTHORISED");}
 @Transactional public JsonNode relay(String id,JsonNode publication){
   ObjectNode p;boolean fresh=db.queryForObject("SELECT COUNT(*) FROM procurement_projects WHERE id=?",Integer.class,id)==0;
   if(fresh){p=json.createObjectNode().put("id",id).put("tenantId","relay").put("revision",0);for(String k:Arrays.asList("quotes","responses","events","changes"))p.putArray(k);}else p=read(id);
   int revision=p.path("revision").asInt();require(fresh||publication.path("publicationRevision").asInt(-1)>=p.path("sourceRevision").asInt(-1),"STALE_PUBLICATION");p.put("sourceRevision",publication.path("publicationRevision").asInt());for(String k:Arrays.asList("title","route","cargo","terms","currency","deadline","status","items","invitations","offers"))p.set(k,publication.path(k));
   p.put("responsesFrozen",publication.path("responsesFrozen").asBoolean());
   if(fresh){try{db.update("INSERT INTO procurement_projects(id,tenant_id,revision,content) VALUES(?,'relay',0,?)",id,json.writeValueAsString(p));}catch(Exception e){throw new IllegalStateException(e);}}else save(p,revision);
   ObjectNode result=json.createObjectNode();result.set("quotes",p.path("quotes"));result.set("responses",p.path("responses"));result.put("portalRevision",p.path("revision").asInt());return result;
 }
 @Transactional public JsonNode sync(SessionContext c,String id){permission(c);require(portalUrl!=null&&!portalUrl.isEmpty()&&relayKey!=null&&relayKey.length()>=32,"PORTAL_NOT_CONFIGURED");require(portalUrl.startsWith("https://")||portalUrl.startsWith("http://127.0.0.1:"),"HTTPS_REQUIRED");ObjectNode p=own(c,id),publication=json.createObjectNode();int old=p.path("revision").asInt();publication.put("publicationRevision",old);for(String k:Arrays.asList("title","route","cargo","terms","currency","deadline","status","items","invitations","offers"))publication.set(k,p.path(k));publication.put("responsesFrozen",p.has("award"));
   org.springframework.http.HttpHeaders headers=new org.springframework.http.HttpHeaders();headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);headers.set("X-Relay-Key",relayKey);
   org.springframework.http.client.SimpleClientHttpRequestFactory factory=new org.springframework.http.client.SimpleClientHttpRequestFactory();factory.setConnectTimeout(5000);factory.setReadTimeout(15000);
   JsonNode receipt=new org.springframework.web.client.RestTemplate(factory).postForObject(portalUrl+"/api/procurement-relay/"+id,new org.springframework.http.HttpEntity<>(publication,headers),JsonNode.class);
   require(receipt!=null&&receipt.path("quotes").isArray()&&receipt.path("responses").isArray(),"INVALID_RECEIPT");if(!p.has("award")){p.set("quotes",receipt.path("quotes"));p.set("responses",receipt.path("responses"));}p.put("syncedAt",System.currentTimeMillis());p.put("remoteComplete",p.path("status").asText().equals("closed"));event(p,"sync",c.getDisplayName(),"portal revision "+receipt.path("portalRevision").asInt());save(p,old);return p;
 }
 @Transactional public JsonNode create(SessionContext c,JsonNode b){permission(c);ObjectNode p=json.createObjectNode();p.put("id",UUID.randomUUID().toString());p.put("tenantId",c.getTenantId());p.put("title",text(b,"title"));p.put("route",text(b,"route"));p.put("cargo",text(b,"cargo"));p.put("terms",text(b,"terms"));p.put("currency",text(b,"currency"));require(b.path("deadline").asLong()>System.currentTimeMillis(),"INVALID_DEADLINE");p.put("deadline",b.path("deadline").asLong());
 require(b.path("items").isArray()&&b.path("items").size()>0&&b.path("items").size()<=30,"INVALID_ITEMS");ArrayNode items=p.putArray("items");for(JsonNode item:b.path("items"))items.addObject().put("id","fee-"+(items.size()+1)).put("name",text(item,"name"));p.put("status","published");p.put("revision",0);for(String key:Arrays.asList("invitations","quotes","offers","responses","events","changes"))p.putArray(key);event(p,"published",c.getDisplayName(),"Frozen scope and fee items");try{db.update("INSERT INTO procurement_projects(id,tenant_id,revision,content) VALUES(?,?,0,?)",p.path("id").asText(),c.getTenantId(),json.writeValueAsString(p));}catch(Exception e){throw new IllegalStateException(e);}return p;}
 @Transactional public JsonNode command(SessionContext c,String id,JsonNode b){permission(c);ObjectNode p=own(c,id);int old=p.path("revision").asInt();require(b.path("revision").asInt(-1)==old,"REVISION_CONFLICT");String op=text(b,"op"),token=null;
 if(Arrays.asList("change","approveChange","withdraw","complete").contains(op))require(p.has("award")&&!p.has("withdrawal")&&!p.has("completedAt"),"INVALID_TRANSITION");
 if(Arrays.asList("invite","close","offer","award").contains(op))require(!p.has("award"),"ALREADY_AWARDED");
 switch(op){
 case "invite":require(p.path("status").asText().equals("published")&&System.currentTimeMillis()<p.path("deadline").asLong(),"ROUND_CLOSED");token=UUID.randomUUID().toString()+UUID.randomUUID();p.withArray("invitations").addObject().put("id",UUID.randomUUID().toString()).put("name",text(b,"name")).put("tokenHash",hash(token));break;
 case "close":require(System.currentTimeMillis()>=p.path("deadline").asLong(),"BEFORE_DEADLINE");p.put("status","closed");break;
 case "offer":require(p.path("status").asText().equals("closed"),"CLOSE_ROUND_FIRST");ArrayNode prices=prices(p,b.path("amounts"));require(b.path("replyDeadline").asLong()>System.currentTimeMillis(),"INVALID_DEADLINE");p.withArray("offers").addObject().put("id",UUID.randomUUID().toString()).put("terms",text(b,"terms")).put("replyDeadline",b.path("replyDeadline").asLong()).set("amounts",prices);break;
 case "award":{String supplier=text(b,"supplierId");require(p.withArray("offers").size()>0&&p.withArray("offers").get(p.withArray("offers").size()-1).path("id").asText().equals(text(b,"offerId")),"OFFER_SUPERSEDED");JsonNode accepted=null;for(JsonNode r:p.withArray("responses"))if(r.path("supplierId").asText().equals(supplier)&&r.path("offerId").asText().equals(text(b,"offerId")))accepted=r;require(accepted!=null&&accepted.path("decision").asText().equals("accept"),"SUPPLIER_ACCEPTANCE_REQUIRED");require(!p.has("award"),"ALREADY_AWARDED");p.putObject("award").put("supplierId",supplier).put("offerId",text(b,"offerId")).put("reason",text(b,"reason")).put("at",System.currentTimeMillis());break;}
 case "complete":require(p.has("award")&&!p.has("withdrawal")&&!p.has("completedAt"),"INVALID_TRANSITION");for(JsonNode change:p.path("changes"))require(!change.path("status").asText().equals("proposed"),"PENDING_CHANGES");p.put("completedAt",System.currentTimeMillis());break;
 case "withdraw":require(p.has("award")&&!p.has("withdrawal"),"INVALID_TRANSITION");p.putObject("withdrawal").put("reason",text(b,"reason")).put("at",System.currentTimeMillis());break;
 case "change":{require(p.has("award"),"AWARD_REQUIRED");BigDecimal delta=money(b.path("delta"),true);p.withArray("changes").addObject().put("id",UUID.randomUUID().toString()).put("delta",delta.toPlainString()).put("reason",text(b,"reason")).put("cause",text(b,"cause")).put("status","proposed");break;}
 case "approveChange":{boolean found=false;for(JsonNode change:p.withArray("changes"))if(change.path("id").asText().equals(text(b,"changeId"))){require(change.path("status").asText().equals("proposed"),"INVALID_TRANSITION");((ObjectNode)change).put("status","approved").put("confirmation",text(b,"confirmation"));found=true;}require(found,"CHANGE_NOT_FOUND");break;}
 default:throw ApiException.badRequest("UNKNOWN_COMMAND");}
 event(p,op,c.getDisplayName(),b.path("reason").asText(op));save(p,old);ObjectNode result=p.deepCopy();if(token!=null)result.put("invitationToken",token);return result;}
 private BigDecimal money(JsonNode value,boolean signed){try{BigDecimal d=new BigDecimal(value.asText()).setScale(2,java.math.RoundingMode.UNNECESSARY);require((signed||d.signum()>=0)&&d.abs().compareTo(new BigDecimal("999999999999"))<=0,"INVALID_AMOUNT");return d;}catch(NumberFormatException|ArithmeticException e){throw ApiException.badRequest("INVALID_AMOUNT");}}
 private ArrayNode prices(ObjectNode p,JsonNode input){require(input.isArray()&&input.size()==p.withArray("items").size(),"ALL_FEES_REQUIRED");ArrayNode out=json.createArrayNode();for(JsonNode amount:input)out.add(money(amount,false).toPlainString());return out;}
 private JsonNode invite(ObjectNode p,String token){for(JsonNode i:p.withArray("invitations"))if(MessageDigest.isEqual(i.path("tokenHash").asText().getBytes(StandardCharsets.UTF_8),hash(token).getBytes(StandardCharsets.UTF_8)))return i;throw ApiException.notFound("INVITATION_NOT_FOUND");}
 public JsonNode supplier(String id,String token){ObjectNode p=read(id);JsonNode i=invite(p,token);ObjectNode view=json.createObjectNode();for(String k:Arrays.asList("id","title","route","cargo","terms","currency","deadline","status","items","offers"))view.set(k,p.path(k));view.put("responsesFrozen",p.has("award")||p.path("responsesFrozen").asBoolean());view.set("supplier",json.createObjectNode().put("id",i.path("id").asText()).put("name",i.path("name").asText()));for(String key:Arrays.asList("quotes","responses")){ArrayNode a=view.putArray(key);for(JsonNode n:p.withArray(key))if(n.path("supplierId").asText().equals(i.path("id").asText()))a.add(n);}return view;}
 @Transactional public JsonNode submit(String id,String token,JsonNode b){ObjectNode p=read(id);JsonNode i=invite(p,token);String requestId=text(b,"requestId");for(String key:Arrays.asList("quotes","responses"))for(JsonNode n:p.withArray(key))if(requestId.equals(n.path("requestId").asText())&&i.path("id").asText().equals(n.path("supplierId").asText()))return supplier(id,token);
 String op=text(b,"op");ObjectNode record=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("supplierId",i.path("id").asText()).put("requestId",requestId).put("at",System.currentTimeMillis());
 if(op.equals("quote")){require(p.path("status").asText().equals("published")&&System.currentTimeMillis()<=p.path("deadline").asLong(),"ROUND_CLOSED");record.set("amounts",prices(p,b.path("amounts")));record.put("conditions",b.path("conditions").asText(""));p.withArray("quotes").add(record);}
 else if(op.equals("respond")){require(!p.has("award")&&!p.path("responsesFrozen").asBoolean(),"ALREADY_AWARDED");JsonNode offer=null;for(JsonNode o:p.withArray("offers"))if(o.path("id").asText().equals(text(b,"offerId")))offer=o;require(offer!=null&&offer==p.withArray("offers").get(p.withArray("offers").size()-1),"OFFER_SUPERSEDED");require(System.currentTimeMillis()<=offer.path("replyDeadline").asLong(),"OFFER_EXPIRED");String decision=text(b,"decision");require(Arrays.asList("accept","reject","conditional").contains(decision),"INVALID_DECISION");if(!decision.equals("accept"))text(b,"note");record.put("offerId",offer.path("id").asText()).put("decision",decision).put("note",b.path("note").asText(""));p.withArray("responses").add(record);}
 else throw ApiException.badRequest("UNKNOWN_COMMAND");event(p,op,i.path("name").asText(),record.path("id").asText());save(p,p.path("revision").asInt());return supplier(id,token);}
 public JsonNode compare(SessionContext c,String id){permission(c);ObjectNode p=own(c,id);require(portalUrl==null||portalUrl.isEmpty()||p.path("remoteComplete").asBoolean(),"SYNC_CLOSED_ROUND_FIRST");require(p.path("status").asText().equals("closed"),"CLOSE_ROUND_FIRST");Map<String,JsonNode> latest=new LinkedHashMap<>();for(JsonNode q:p.withArray("quotes"))latest.put(q.path("supplierId").asText(),q);ObjectNode out=json.createObjectNode();ArrayNode mins=out.putArray("minimums");BigDecimal reference=BigDecimal.ZERO,best=null;String bestId="";List<JsonNode> comparable=new ArrayList<>();for(JsonNode q:latest.values())if(q.path("conditions").asText().trim().isEmpty())comparable.add(q);require(!comparable.isEmpty(),"NO_COMPARABLE_QUOTES");for(int x=0;x<p.withArray("items").size();x++){BigDecimal min=null;String source="";for(JsonNode q:comparable){BigDecimal v=money(q.path("amounts").get(x),false);if(min==null||v.compareTo(min)<0){min=v;source=q.path("supplierId").asText();}}mins.addObject().put("amount",min.toPlainString()).put("supplierId",source);reference=reference.add(min);}for(JsonNode q:comparable){BigDecimal total=BigDecimal.ZERO;for(JsonNode v:q.path("amounts"))total=total.add(money(v,false));if(best==null||total.compareTo(best)<0){best=total;bestId=q.path("supplierId").asText();}}out.put("referenceTotal",reference.toPlainString()).put("bestWholeTotal",best.toPlainString()).put("bestSupplierId",bestId).put("excludedConditionalQuotes",latest.size()-comparable.size()).put("executable",false);return out;}
}
