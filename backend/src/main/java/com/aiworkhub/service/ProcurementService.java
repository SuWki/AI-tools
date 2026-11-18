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
 private final org.springframework.transaction.support.TransactionTemplate tx;
 public ProcurementService(JdbcTemplate db,ObjectMapper json,org.springframework.transaction.PlatformTransactionManager manager){this.db=db;this.json=json;this.tx=new org.springframework.transaction.support.TransactionTemplate(manager);}
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
 public List<Map<String,Object>> suppliers(SessionContext context){
   permission(context);
   return db.queryForList("SELECT id,name FROM procurement_suppliers WHERE tenant_id=? ORDER BY name,id",context.getTenantId());
 }

 @Transactional
 public JsonNode registerSupplier(SessionContext context,JsonNode body){
   permission(context);
   String name=text(body,"name");
   require(name.length()<=160,"INVALID_NAME");
   String id=UUID.randomUUID().toString();
   db.update("INSERT INTO procurement_suppliers(id,tenant_id,name,created_at) VALUES(?,?,?,?)",
       id,context.getTenantId(),name,System.currentTimeMillis());
   return json.createObjectNode().put("id",id).put("name",name);
 }

 private String supplierName(SessionContext context,String id){
   List<String> names=db.query("SELECT name FROM procurement_suppliers WHERE tenant_id=? AND id=?",
       (row,index)->row.getString(1),context.getTenantId(),id);
   if(names.isEmpty())throw ApiException.notFound("SUPPLIER_NOT_FOUND");
   return names.get(0);
 }

 private void requireUnusedSupplier(JsonNode project,String supplierId){
   for(JsonNode invitation:project.path("invitations")){
     require(!supplierId.equals(invitation.path("supplierRecordId").asText()),"SUPPLIER_ALREADY_INVITED");
   }
 }

 private JsonNode quoteWithdrawal(JsonNode project,String invitationId){
   for(JsonNode record:project.path("quoteWithdrawals")){
     if(invitationId.equals(record.path("supplierId").asText()))return record;
   }
   return MissingNode.getInstance();
 }

 public JsonNode metrics(SessionContext c){
   permission(c);ObjectNode result=json.createObjectNode();Map<String,ObjectNode> groups=new LinkedHashMap<>();
   for(JsonNode project:list(c))for(JsonNode invitation:project.path("invitations")){
     String name=invitation.path("name").asText();
     String supplierKey=invitation.path("supplierRecordId").asText("legacy:"+invitation.path("id").asText());
     ObjectNode row=groups.get(supplierKey);
     if(row==null){row=json.createObjectNode().put("name",name).put("supplierKey",supplierKey).put("quoteWithdrawals",0).put("endedInvitations",0).put("quoted",0).put("awards",0).put("withdrawals",0).put("completed",0).put("completedWithChanges",0);groups.put(supplierKey,row);}
     String supplier=invitation.path("id").asText();boolean ended=System.currentTimeMillis()>=project.path("deadline").asLong(),quoted=false;
     for(JsonNode q:project.path("quotes"))if(supplier.equals(q.path("supplierId").asText()))quoted=true;
     if(!quoteWithdrawal(project,supplier).isMissingNode())row.put("quoteWithdrawals",row.path("quoteWithdrawals").asInt()+1);
     if(ended){row.put("endedInvitations",row.path("endedInvitations").asInt()+1);if(quoted)row.put("quoted",row.path("quoted").asInt()+1);}
     if(supplier.equals(project.path("award").path("supplierId").asText())){
       row.put("awards",row.path("awards").asInt()+1);
       if(project.has("withdrawal"))row.put("withdrawals",row.path("withdrawals").asInt()+1);
       if(project.has("completedAt")){row.put("completed",row.path("completed").asInt()+1);boolean changed=false;for(JsonNode change:project.path("changes"))if(change.path("status").asText().equals("approved"))changed=true;if(changed)row.put("completedWithChanges",row.path("completedWithChanges").asInt()+1);}
     }
   }
   ArrayNode rows=result.putArray("suppliers");groups.values().forEach(rows::add);result.put("identityBasis","supplier record ID, or individual unlinked invitation");return result;
 }
 public void relayAuth(String key){if(relayKey==null||relayKey.length()<32||!MessageDigest.isEqual(relayKey.getBytes(StandardCharsets.UTF_8),key.getBytes(StandardCharsets.UTF_8)))throw ApiException.forbidden("RELAY_DISABLED_OR_UNAUTHORISED");}
 @Transactional public JsonNode relay(String id,JsonNode publication){
   ObjectNode p;boolean fresh=db.queryForObject("SELECT COUNT(*) FROM procurement_projects WHERE id=?",Integer.class,id)==0;
   if(fresh){p=json.createObjectNode().put("id",id).put("tenantId","relay").put("revision",0);for(String k:Arrays.asList("quotes","responses","quoteWithdrawals","events","changes"))p.putArray(k);}else {p=read(id);require("relay".equals(p.path("tenantId").asText()),"PROJECT_NOT_FOUND");}
   int revision=p.path("revision").asInt();require(fresh||publication.path("publicationRevision").asInt(-1)>=p.path("sourceRevision").asInt(-1),"STALE_PUBLICATION");p.put("sourceRevision",publication.path("publicationRevision").asInt());for(String k:Arrays.asList("title","route","cargo","terms","currency","deadline","status","items","invitations","offers"))p.set(k,publication.path(k));
   p.put("responsesFrozen",p.path("responsesFrozen").asBoolean()||publication.path("responsesFrozen").asBoolean());
   JsonNode awardRequest=publication.path("awardRequest");
   boolean confirmed=false;
   if(awardRequest.isObject()){
     String requestId=text(awardRequest,"requestId");
     confirmed=requestId.equals(p.path("confirmedAwardRequest").asText());
     if(!confirmed&&!p.path("responsesFrozen").asBoolean()&&matchesAcceptance(p,awardRequest)){
       p.put("confirmedAwardRequest",requestId);
       p.put("responsesFrozen",true);
       confirmed=true;
     }
   }
   if(fresh){try{db.update("INSERT INTO procurement_projects(id,tenant_id,revision,content) VALUES(?,'relay',0,?)",id,json.writeValueAsString(p));}catch(Exception e){throw new IllegalStateException(e);}}else save(p,revision);
   ObjectNode result=json.createObjectNode();result.set("quotes",p.path("quotes"));result.set("responses",p.path("responses"));result.set("quoteWithdrawals",p.withArray("quoteWithdrawals"));result.put("portalRevision",p.path("revision").asInt());
   if(awardRequest.isObject())result.put("awardConfirmed",confirmed);
   return result;
 }
 @Transactional private boolean portalConfigured(){return portalUrl!=null&&!portalUrl.trim().isEmpty();}

 private ObjectNode publication(ObjectNode project){
   ObjectNode payload=json.createObjectNode().put("publicationRevision",project.path("revision").asInt());
   for(String field:Arrays.asList("title","route","cargo","terms","currency","deadline","status","items","invitations","offers")){
     payload.set(field,project.path(field));
   }
   ArrayNode publicInvitations=json.createArrayNode();
   for(JsonNode invitation:project.path("invitations")){
     ObjectNode copy=invitation.deepCopy();
     copy.remove("supplierRecordId");
     publicInvitations.add(copy);
   }
   payload.set("invitations",publicInvitations);
   return payload.put("responsesFrozen",project.has("award"));
 }

 private JsonNode exchange(String id,ObjectNode payload){
   require(portalConfigured()&&relayKey!=null&&relayKey.length()>=32,"PORTAL_NOT_CONFIGURED");
   require(portalUrl.startsWith("https://")||portalUrl.startsWith("http://127.0.0.1:"),"HTTPS_REQUIRED");
   org.springframework.http.HttpHeaders headers=new org.springframework.http.HttpHeaders();
   headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
   headers.set("X-Relay-Key",relayKey);
   org.springframework.http.client.SimpleClientHttpRequestFactory factory=new org.springframework.http.client.SimpleClientHttpRequestFactory();
   factory.setConnectTimeout(5000);
   factory.setReadTimeout(15000);
   JsonNode receipt;
   try{
     receipt=new org.springframework.web.client.RestTemplate(factory).postForObject(portalUrl+"/api/procurement-relay/"+id,new org.springframework.http.HttpEntity<>(payload,headers),JsonNode.class);
   }catch(org.springframework.web.client.RestClientException ex){
     throw new ApiException(HttpStatus.BAD_GATEWAY,"PORTAL_SYNC_FAILED");
   }
   require(receipt!=null&&receipt.path("quotes").isArray()&&receipt.path("responses").isArray(),"INVALID_RECEIPT");
   return receipt;
 }

 private void importReceipt(ObjectNode project,JsonNode receipt){
   if(!project.has("award")){
     project.set("quotes",receipt.path("quotes"));
     project.set("responses",receipt.path("responses"));
     for(JsonNode withdrawal:receipt.path("quoteWithdrawals")){
       String invitationId=withdrawal.path("supplierId").asText();
       if(!quoteWithdrawal(project,invitationId).isMissingNode())continue;
       for(JsonNode invitation:project.path("invitations")){
         if(!invitationId.equals(invitation.path("id").asText()))continue;
         project.withArray("quoteWithdrawals").add(withdrawal);
         event(project,"withdrawQuote",invitation.path("name").asText(),withdrawal.path("reason").asText());
         break;
       }
     }
   }
   project.put("syncedAt",System.currentTimeMillis());
   project.put("remoteComplete",project.path("status").asText().equals("closed"));
 }

 public JsonNode sync(SessionContext c,String id){
   permission(c);
   ObjectNode snapshot=own(c,id);
   require(!snapshot.has("pendingAward"),"AWARD_CONFIRMATION_PENDING");
   int revision=snapshot.path("revision").asInt();
   JsonNode receipt=exchange(id,publication(snapshot));
   return tx.execute(status->{
     ObjectNode current=own(c,id);
     require(current.path("revision").asInt()==revision,"REVISION_CONFLICT");
     importReceipt(current,receipt);
     event(current,"sync",c.getDisplayName(),"portal revision "+receipt.path("portalRevision").asInt());
     save(current,revision);
     return current;
   });
 }

 private JsonNode latestResponse(JsonNode project,String supplierId,String offerId){
   JsonNode latest=com.fasterxml.jackson.databind.node.MissingNode.getInstance();
   for(JsonNode response:project.path("responses")){
     if(supplierId.equals(response.path("supplierId").asText())&&offerId.equals(response.path("offerId").asText()))latest=response;
   }
   return latest;
 }

 private boolean matchesAcceptance(JsonNode project,JsonNode candidate){
   JsonNode offers=project.path("offers");
   if(offers.isEmpty()||!offers.get(offers.size()-1).path("id").asText().equals(candidate.path("offerId").asText()))return false;
   String invitationId=candidate.path("supplierId").asText();
   if(!quoteWithdrawal(project,invitationId).isMissingNode())return false;
   JsonNode response=latestResponse(project,invitationId,candidate.path("offerId").asText());
   return response.path("decision").asText().equals("accept")
       &&response.path("id").asText().equals(candidate.path("responseId").asText());
 }

 public JsonNode executeCommand(SessionContext c,String id,JsonNode body){
   if(!"award".equals(body.path("op").asText())||!portalConfigured())return tx.execute(status->command(c,id,body));
   permission(c);
   ObjectNode snapshot=tx.execute(status->{
     ObjectNode project=own(c,id);
     if(sameAward(project.path("award"),body))return project;
     require(!project.has("award"),"ALREADY_AWARDED");
     if(project.has("pendingAward")){
       require(sameAward(project.path("pendingAward"),body),"AWARD_CONFIRMATION_PENDING");
       return project;
     }
     int revision=project.path("revision").asInt();
     require(body.path("revision").asInt(-1)==revision,"REVISION_CONFLICT");
     require(matchesAcceptance(project,body),"SUPPLIER_ACCEPTANCE_REQUIRED");
     project.putObject("pendingAward").put("requestId",UUID.randomUUID().toString())
         .put("supplierId",text(body,"supplierId")).put("offerId",text(body,"offerId"))
         .put("responseId",text(body,"responseId")).put("reason",text(body,"reason"));
     save(project,revision);
     return project;
   });
   if(snapshot.has("award"))return snapshot;
   JsonNode pending=snapshot.path("pendingAward");
   ObjectNode payload=publication(snapshot);
   ObjectNode candidate=json.createObjectNode();
   for(String field:Arrays.asList("requestId","supplierId","offerId","responseId"))candidate.set(field,pending.get(field));
   payload.set("awardRequest",candidate);
   JsonNode receipt=exchange(id,payload);
   require(receipt.path("awardConfirmed").isBoolean(),"PORTAL_UPGRADE_REQUIRED");
   boolean confirmed=receipt.path("awardConfirmed").asBoolean();
   ObjectNode result=tx.execute(status->{
     ObjectNode project=own(c,id);
     if(sameAward(project.path("award"),body))return project;
     require(project.path("pendingAward").equals(pending),"REVISION_CONFLICT");
     int revision=project.path("revision").asInt();
     importReceipt(project,receipt);
     if(confirmed){
       require(matchesAcceptance(project,pending),"INVALID_RECEIPT");
       ObjectNode award=((ObjectNode)pending).deepCopy();
       award.remove("requestId");
       award.put("at",System.currentTimeMillis());
       project.set("award",award);
       event(project,"award",c.getDisplayName(),award.path("reason").asText());
     }
     project.remove("pendingAward");
     save(project,revision);
     return project;
   });
   require(confirmed,"PORTAL_ACCEPTANCE_CHANGED");
   return result;
 }

 private boolean sameAward(JsonNode award,JsonNode candidate){
   return award.isObject()&&award.path("supplierId").equals(candidate.path("supplierId"))
       &&award.path("offerId").equals(candidate.path("offerId"))
       &&award.path("responseId").equals(candidate.path("responseId"));
 }
 @Transactional public JsonNode create(SessionContext c,JsonNode b){permission(c);ObjectNode p=json.createObjectNode();p.put("id",UUID.randomUUID().toString());p.put("tenantId",c.getTenantId());p.put("title",text(b,"title"));p.put("route",text(b,"route"));p.put("cargo",text(b,"cargo"));p.put("terms",text(b,"terms"));p.put("currency",text(b,"currency"));require(b.path("deadline").asLong()>System.currentTimeMillis(),"INVALID_DEADLINE");p.put("deadline",b.path("deadline").asLong());
 require(b.path("items").isArray()&&b.path("items").size()>0&&b.path("items").size()<=30,"INVALID_ITEMS");ArrayNode items=p.putArray("items");for(JsonNode item:b.path("items"))items.addObject().put("id","fee-"+(items.size()+1)).put("name",text(item,"name"));p.put("status","published");p.put("revision",0);for(String key:Arrays.asList("invitations","quotes","offers","responses","quoteWithdrawals","events","changes"))p.putArray(key);event(p,"published",c.getDisplayName(),"Frozen scope and fee items");try{db.update("INSERT INTO procurement_projects(id,tenant_id,revision,content) VALUES(?,?,0,?)",p.path("id").asText(),c.getTenantId(),json.writeValueAsString(p));}catch(Exception e){throw new IllegalStateException(e);}return p;}
 @Transactional public JsonNode command(SessionContext c,String id,JsonNode b){permission(c);ObjectNode p=own(c,id);int old=p.path("revision").asInt();require(b.path("revision").asInt(-1)==old,"REVISION_CONFLICT");String op=text(b,"op"),token=null;
 require(!p.has("pendingAward"),"AWARD_CONFIRMATION_PENDING");
 if("award".equals(op))require(!portalConfigured(),"PORTAL_CONFIRMATION_REQUIRED");
 if(Arrays.asList("change","approveChange","withdraw","complete").contains(op))require(p.has("award")&&!p.has("withdrawal")&&!p.has("completedAt"),"INVALID_TRANSITION");
 if(Arrays.asList("invite","close","offer","award").contains(op))require(!p.has("award"),"ALREADY_AWARDED");
 switch(op){
 case "invite": {
   require(p.path("status").asText().equals("published")&&System.currentTimeMillis()<p.path("deadline").asLong(),"ROUND_CLOSED");
   String supplierRecordId=b.path("supplierRecordId").asText("").trim();
   String name;
   if(supplierRecordId.isEmpty()){
     JsonNode supplier=registerSupplier(c,b);
     supplierRecordId=supplier.path("id").asText();
     name=supplier.path("name").asText();
   }else{
     name=supplierName(c,supplierRecordId);
     requireUnusedSupplier(p,supplierRecordId);
   }
   token=UUID.randomUUID().toString()+UUID.randomUUID();
   p.withArray("invitations").addObject().put("id",UUID.randomUUID().toString()).put("name",name)
       .put("supplierRecordId",supplierRecordId).put("tokenHash",hash(token));
   break;
 }
 case "linkSupplier": {
   String supplierRecordId=text(b,"supplierRecordId");
   supplierName(c,supplierRecordId);
   String invitationId=text(b,"invitationId");
   ObjectNode invitation=null;
   for(JsonNode row:p.path("invitations")){
     if(invitationId.equals(row.path("id").asText()))invitation=(ObjectNode)row;
   }
   require(invitation!=null,"INVITATION_NOT_FOUND");
   require(!invitation.hasNonNull("supplierRecordId"),"SUPPLIER_ALREADY_LINKED");
   requireUnusedSupplier(p,supplierRecordId);
   invitation.put("supplierRecordId",supplierRecordId);
   break;
 }
 case "close":require(System.currentTimeMillis()>=p.path("deadline").asLong(),"BEFORE_DEADLINE");p.put("status","closed");break;
 case "offer":require(p.path("status").asText().equals("closed"),"CLOSE_ROUND_FIRST");ArrayNode prices=prices(p,b.path("amounts"));require(b.path("replyDeadline").asLong()>System.currentTimeMillis(),"INVALID_DEADLINE");p.withArray("offers").addObject().put("id",UUID.randomUUID().toString()).put("terms",text(b,"terms")).put("replyDeadline",b.path("replyDeadline").asLong()).set("amounts",prices);break;
 case "award":{String supplier=text(b,"supplierId");require(quoteWithdrawal(p,supplier).isMissingNode(),"QUOTE_WITHDRAWN");require(p.withArray("offers").size()>0&&p.withArray("offers").get(p.withArray("offers").size()-1).path("id").asText().equals(text(b,"offerId")),"OFFER_SUPERSEDED");JsonNode accepted=null;for(JsonNode r:p.withArray("responses"))if(r.path("supplierId").asText().equals(supplier)&&r.path("offerId").asText().equals(text(b,"offerId")))accepted=r;require(accepted!=null&&accepted.path("decision").asText().equals("accept")&&(!b.has("responseId")||accepted.path("id").equals(b.path("responseId"))),"SUPPLIER_ACCEPTANCE_REQUIRED");require(!p.has("award"),"ALREADY_AWARDED");p.putObject("award").put("supplierId",supplier).put("offerId",text(b,"offerId")).put("reason",text(b,"reason")).put("at",System.currentTimeMillis());break;}
 case "complete":require(p.has("award")&&!p.has("withdrawal")&&!p.has("completedAt"),"INVALID_TRANSITION");for(JsonNode change:p.path("changes"))require(!change.path("status").asText().equals("proposed"),"PENDING_CHANGES");p.put("completedAt",System.currentTimeMillis());break;
 case "withdraw":require(p.has("award")&&!p.has("withdrawal"),"INVALID_TRANSITION");p.putObject("withdrawal").put("reason",text(b,"reason")).put("at",System.currentTimeMillis());break;
 case "change":{require(p.has("award"),"AWARD_REQUIRED");BigDecimal delta=money(b.path("delta"),true);p.withArray("changes").addObject().put("id",UUID.randomUUID().toString()).put("delta",delta.toPlainString()).put("reason",text(b,"reason")).put("cause",text(b,"cause")).put("status","proposed");break;}
 case "approveChange":{boolean found=false;for(JsonNode change:p.withArray("changes"))if(change.path("id").asText().equals(text(b,"changeId"))){require(change.path("status").asText().equals("proposed"),"INVALID_TRANSITION");((ObjectNode)change).put("status","approved").put("confirmation",text(b,"confirmation"));found=true;}require(found,"CHANGE_NOT_FOUND");break;}
 default:throw ApiException.badRequest("UNKNOWN_COMMAND");}
 event(p,op,c.getDisplayName(),b.path("reason").asText(op));save(p,old);ObjectNode result=p.deepCopy();if(token!=null)result.put("invitationToken",token);return result;}
 private BigDecimal money(JsonNode value,boolean signed){try{BigDecimal d=new BigDecimal(value.asText()).setScale(2,java.math.RoundingMode.UNNECESSARY);require((signed||d.signum()>=0)&&d.abs().compareTo(new BigDecimal("999999999999"))<=0,"INVALID_AMOUNT");return d;}catch(NumberFormatException|ArithmeticException e){throw ApiException.badRequest("INVALID_AMOUNT");}}
 private ArrayNode prices(ObjectNode p,JsonNode input){require(input.isArray()&&input.size()==p.withArray("items").size(),"ALL_FEES_REQUIRED");ArrayNode out=json.createArrayNode();for(JsonNode amount:input)out.add(money(amount,false).toPlainString());return out;}
 private JsonNode invite(ObjectNode p,String token){for(JsonNode i:p.withArray("invitations"))if(MessageDigest.isEqual(i.path("tokenHash").asText().getBytes(StandardCharsets.UTF_8),hash(token).getBytes(StandardCharsets.UTF_8)))return i;throw ApiException.notFound("INVITATION_NOT_FOUND");}
 public JsonNode supplier(String id,String token){ObjectNode p=read(id);JsonNode i=invite(p,token);ObjectNode view=json.createObjectNode();for(String k:Arrays.asList("id","title","route","cargo","terms","currency","deadline","status","items","offers"))view.set(k,p.path(k));view.put("responsesFrozen",p.has("award")||p.has("pendingAward")||p.path("responsesFrozen").asBoolean());JsonNode withdrawal=quoteWithdrawal(p,i.path("id").asText());if(!withdrawal.isMissingNode())view.set("quoteWithdrawal",withdrawal);view.set("supplier",json.createObjectNode().put("id",i.path("id").asText()).put("name",i.path("name").asText()));for(String key:Arrays.asList("quotes","responses")){ArrayNode a=view.putArray(key);for(JsonNode n:p.withArray(key))if(n.path("supplierId").asText().equals(i.path("id").asText()))a.add(n);}return view;}
 @Transactional public JsonNode submit(String id,String token,JsonNode b){ObjectNode p=read(id);JsonNode i=invite(p,token);String requestId=text(b,"requestId");for(String key:Arrays.asList("quotes","responses","quoteWithdrawals"))for(JsonNode n:p.path(key))if(requestId.equals(n.path("requestId").asText())&&i.path("id").asText().equals(n.path("supplierId").asText()))return supplier(id,token);
 String op=text(b,"op");ObjectNode record=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("supplierId",i.path("id").asText()).put("requestId",requestId).put("at",System.currentTimeMillis());
 require(quoteWithdrawal(p,i.path("id").asText()).isMissingNode(),"QUOTE_WITHDRAWN");
 if(op.equals("withdrawQuote")){
   require(!p.has("award")&&!p.has("pendingAward")&&!p.path("responsesFrozen").asBoolean(),"ALREADY_AWARDED");
   boolean quoted=false;
   for(JsonNode quote:p.path("quotes"))if(i.path("id").equals(quote.path("supplierId")))quoted=true;
   require(quoted,"QUOTE_REQUIRED");
   record.put("reason",text(b,"reason"));
   p.withArray("quoteWithdrawals").add(record);
 }else if(op.equals("quote")){require(p.path("status").asText().equals("published")&&System.currentTimeMillis()<=p.path("deadline").asLong(),"ROUND_CLOSED");record.set("amounts",prices(p,b.path("amounts")));record.put("conditions",b.path("conditions").asText(""));p.withArray("quotes").add(record);}
 else if(op.equals("respond")){require(!p.has("award")&&!p.has("pendingAward")&&!p.path("responsesFrozen").asBoolean(),"ALREADY_AWARDED");JsonNode offer=null;for(JsonNode o:p.withArray("offers"))if(o.path("id").asText().equals(text(b,"offerId")))offer=o;require(offer!=null&&offer==p.withArray("offers").get(p.withArray("offers").size()-1),"OFFER_SUPERSEDED");require(System.currentTimeMillis()<=offer.path("replyDeadline").asLong(),"OFFER_EXPIRED");String decision=text(b,"decision");require(Arrays.asList("accept","reject","conditional").contains(decision),"INVALID_DECISION");if(!decision.equals("accept"))text(b,"note");record.put("offerId",offer.path("id").asText()).put("decision",decision).put("note",b.path("note").asText(""));p.withArray("responses").add(record);}
 else throw ApiException.badRequest("UNKNOWN_COMMAND");event(p,op,i.path("name").asText(),record.path("id").asText());save(p,p.path("revision").asInt());return supplier(id,token);}
 public JsonNode compare(SessionContext c,String id){permission(c);ObjectNode p=own(c,id);require(portalUrl==null||portalUrl.isEmpty()||p.path("remoteComplete").asBoolean(),"SYNC_CLOSED_ROUND_FIRST");require(p.path("status").asText().equals("closed"),"CLOSE_ROUND_FIRST");Map<String,JsonNode> latest=new LinkedHashMap<>();for(JsonNode q:p.withArray("quotes"))latest.put(q.path("supplierId").asText(),q);ObjectNode out=json.createObjectNode();ArrayNode mins=out.putArray("minimums");BigDecimal reference=BigDecimal.ZERO,best=null;String bestId="";List<JsonNode> comparable=new ArrayList<>();int excludedWithdrawn=0;for(JsonNode q:latest.values()){if(!quoteWithdrawal(p,q.path("supplierId").asText()).isMissingNode())excludedWithdrawn++;else if(q.path("conditions").asText().trim().isEmpty())comparable.add(q);}require(!comparable.isEmpty(),"NO_COMPARABLE_QUOTES");for(int x=0;x<p.withArray("items").size();x++){BigDecimal min=null;String source="";for(JsonNode q:comparable){BigDecimal v=money(q.path("amounts").get(x),false);if(min==null||v.compareTo(min)<0){min=v;source=q.path("supplierId").asText();}}mins.addObject().put("amount",min.toPlainString()).put("supplierId",source);reference=reference.add(min);}for(JsonNode q:comparable){BigDecimal total=BigDecimal.ZERO;for(JsonNode v:q.path("amounts"))total=total.add(money(v,false));if(best==null||total.compareTo(best)<0){best=total;bestId=q.path("supplierId").asText();}}out.put("referenceTotal",reference.toPlainString()).put("bestWholeTotal",best.toPlainString()).put("bestSupplierId",bestId).put("excludedConditionalQuotes",latest.size()-comparable.size()-excludedWithdrawn).put("excludedWithdrawnQuotes",excludedWithdrawn).put("executable",false);return out;}
}
