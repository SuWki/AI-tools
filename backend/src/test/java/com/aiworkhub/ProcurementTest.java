package com.aiworkhub;
import com.aiworkhub.auth.SessionContext;import com.aiworkhub.service.ProcurementService;import com.aiworkhub.common.ApiException;import com.fasterxml.jackson.databind.*;import com.fasterxml.jackson.databind.node.*;import org.junit.jupiter.api.*;import org.springframework.beans.factory.annotation.Autowired;import org.springframework.boot.test.context.SpringBootTest;import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.test.util.ReflectionTestUtils;import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(properties="spring.datasource.url=jdbc:sqlite:file:procurement-tests?mode=memory&cache=shared")
class ProcurementTest {
 @Autowired ProcurementService service;@Autowired ObjectMapper json;@Autowired JdbcTemplate db;
 SessionContext c=new SessionContext("U-ADMIN","t-compressor","ADMIN","test","Buyer","zh");
 JsonNode b(String s)throws Exception{return json.readTree(s);}
 JsonNode create()throws Exception{return service.create(c,b("{\"title\":\"Freight\",\"route\":\"A to B\",\"cargo\":\"10 tonnes\",\"currency\":\"CNY\",\"terms\":\"Same scope, tax included\",\"deadline\":"+(System.currentTimeMillis()+3600000)+",\"items\":[{\"name\":\"Pickup\"},{\"name\":\"Delivery\"}]}"));}
 JsonNode cmd(String id,String body)throws Exception{ObjectNode n=(ObjectNode)b(body);n.put("revision",service.get(c,id).path("revision").asInt());return service.command(c,id,n);}
 String invite(String id,String name)throws Exception{return cmd(id,"{\"op\":\"invite\",\"name\":\""+name+"\"}").path("invitationToken").asText();}
 void end(String id)throws Exception{ObjectNode p=(ObjectNode)service.get(c,id);p.put("deadline",System.currentTimeMillis()-1);db.update("UPDATE procurement_projects SET content=? WHERE id=?",p.toString(),id);cmd(id,"{\"op\":\"close\"}");}
 @Test void lowestCombinationIsNotExecutableAndSuppliersAreIsolated()throws Exception{
 String id=create().path("id").asText(),a=invite(id,"Supplier A"),b=invite(id,"Supplier B");
 service.submit(id,a,b("{\"op\":\"quote\",\"requestId\":\"a1\",\"amounts\":[\"100\",\"300\"]}"));service.submit(id,b,b("{\"op\":\"quote\",\"requestId\":\"b1\",\"amounts\":[\"200\",\"150\"]}"));
 JsonNode own=service.supplier(id,a);assertEquals(1,own.path("quotes").size());assertFalse(own.has("invitations"));assertFalse(own.has("events"));assertThrows(ApiException.class,()->service.supplier(id,"wrong"));end(id);
 JsonNode compare=service.compare(c,id);assertEquals("250.00",compare.path("referenceTotal").asText());assertEquals("350.00",compare.path("bestWholeTotal").asText());assertFalse(compare.path("executable").asBoolean());
 }
 @Test void amountsIdempotencyAndConditionalExclusion()throws Exception{
 String id=create().path("id").asText(),a=invite(id,"A"),b=invite(id,"B");JsonNode quote=b("{\"op\":\"quote\",\"requestId\":\"same\",\"amounts\":[\"0\",\"10.25\"]}");service.submit(id,a,quote);service.submit(id,a,quote);assertEquals(1,service.supplier(id,a).path("quotes").size());
 assertThrows(ApiException.class,()->service.submit(id,a,b("{\"op\":\"quote\",\"requestId\":\"bad\",\"amounts\":[\"\",\"-1\"]}")));
 service.submit(id,b,b("{\"op\":\"quote\",\"requestId\":\"condition\",\"amounts\":[\"0\",\"0\"],\"conditions\":\"Bundled conditional price\"}"));end(id);assertEquals("10.25",service.compare(c,id).path("referenceTotal").asText());assertEquals(1,service.compare(c,id).path("excludedConditionalQuotes").asInt());
 }
 @Test void acceptanceRequiredBeforeAwardAndFeeChanges()throws Exception{
 String id=create().path("id").asText(),token=invite(id,"A");end(id);JsonNode p=cmd(id,"{\"op\":\"offer\",\"amounts\":[\"100\",\"150\"],\"terms\":\"Whole scope\",\"replyDeadline\":"+(System.currentTimeMillis()+3600000)+"}");String offer=p.path("offers").get(0).path("id").asText(),supplier=p.path("invitations").get(0).path("id").asText();
 final String award="{\"op\":\"award\",\"supplierId\":\""+supplier+"\",\"offerId\":\""+offer+"\",\"reason\":\"Confirmed\"}";assertThrows(ApiException.class,()->cmd(id,award));service.submit(id,token,b("{\"op\":\"respond\",\"requestId\":\"accept\",\"decision\":\"accept\",\"offerId\":\""+offer+"\"}"));cmd(id,award);p=cmd(id,"{\"op\":\"change\",\"delta\":\"12.50\",\"reason\":\"Scope changed\",\"cause\":\"Buyer request\"}");assertEquals("proposed",p.path("changes").get(0).path("status").asText());
 }
 @Test void tenantAndRevisionGuards()throws Exception{String id=create().path("id").asText();SessionContext other=new SessionContext("x","t-alpaca","ADMIN","x","x","zh");assertThrows(ApiException.class,()->service.get(other,id));assertThrows(ApiException.class,()->service.command(c,id,b("{\"op\":\"invite\",\"revision\":99,\"name\":\"x\"}")));assertThrows(ApiException.class,()->service.relayAuth("unconfigured"));}
 @Test void outboundSyncUsesPublicationOnlyAndRepeatedPullDoesNotDuplicate()throws Exception{
   String id=create().path("id").asText();java.util.concurrent.atomic.AtomicReference<JsonNode> received=new java.util.concurrent.atomic.AtomicReference<>();
   com.sun.net.httpserver.HttpServer server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
   server.createContext("/api/procurement-relay/",exchange->{received.set(json.readTree(exchange.getRequestBody()));byte[] response="{\"quotes\":[],\"responses\":[],\"portalRevision\":1}".getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,response.length);exchange.getResponseBody().write(response);exchange.close();});server.start();
   try{ReflectionTestUtils.setField(service,"portalUrl","http://127.0.0.1:"+server.getAddress().getPort());ReflectionTestUtils.setField(service,"relayKey","01234567890123456789012345678901");service.sync(c,id);service.sync(c,id);assertFalse(received.get().has("events"));assertFalse(received.get().has("tenantId"));assertTrue(service.get(c,id).has("syncedAt"));assertEquals(0,service.get(c,id).path("quotes").size());}
   finally{server.stop(0);ReflectionTestUtils.setField(service,"portalUrl","");ReflectionTestUtils.setField(service,"relayKey","");}
 }

 String[] awarded()throws Exception{String id=create().path("id").asText(),token=invite(id,"A");end(id);JsonNode p=cmd(id,"{\"op\":\"offer\",\"amounts\":[\"100\",\"150\"],\"terms\":\"Whole\",\"replyDeadline\":"+(System.currentTimeMillis()+3600000)+"}");String offer=p.path("offers").get(0).path("id").asText(),supplier=p.path("invitations").get(0).path("id").asText();service.submit(id,token,b("{\"op\":\"respond\",\"requestId\":\"ok\",\"decision\":\"accept\",\"offerId\":\""+offer+"\"}"));cmd(id,"{\"op\":\"award\",\"supplierId\":\""+supplier+"\",\"offerId\":\""+offer+"\",\"reason\":\"Confirmed\"}");return new String[]{id,token,offer};}
 @Test void pendingChangesBlockCompletionAndTerminalStatesFreezeCommands()throws Exception{for(boolean withdraw:new boolean[]{false,true}){String[] a=awarded();String id=a[0];JsonNode p=cmd(id,"{\"op\":\"change\",\"delta\":\"10\",\"reason\":\"More work\",\"cause\":\"Scope\"}");assertThrows(ApiException.class,()->cmd(id,"{\"op\":\"complete\"}"));String change=p.path("changes").get(0).path("id").asText();if(!withdraw)cmd(id,"{\"op\":\"approveChange\",\"changeId\":\""+change+"\",\"confirmation\":\"Both confirmed\"}");cmd(id,withdraw?"{\"op\":\"withdraw\",\"reason\":\"No capacity\"}":"{\"op\":\"complete\"}");String before=service.get(c,id).toString();for(String op:new String[]{"change","approveChange","withdraw","complete","offer"})assertThrows(ApiException.class,()->cmd(id,"{\"op\":\""+op+"\",\"changeId\":\""+change+"\"}"));assertEquals(before,service.get(c,id).toString());}}
 @Test void awardFreezesTargetsAndNewSupplierRepliesButKeepsReceipts()throws Exception{String[] a=awarded();String before=service.get(c,a[0]).toString();assertThrows(ApiException.class,()->cmd(a[0],"{\"op\":\"offer\"}"));assertThrows(ApiException.class,()->service.submit(a[0],a[1],b("{\"op\":\"respond\",\"requestId\":\"late\",\"decision\":\"reject\",\"note\":\"late\",\"offerId\":\""+a[2]+"\"}")));service.submit(a[0],a[1],b("{\"op\":\"respond\",\"requestId\":\"ok\"}"));assertEquals(before,service.get(c,a[0]).toString());}
 @Test void portalFreezeFlagBlocksLateResponses()throws Exception{String[] a=awarded();ObjectNode publication=((ObjectNode)service.get(c,a[0])).deepCopy();publication.put("publicationRevision",100);publication.put("responsesFrozen",true);service.relay("portal-"+a[0],publication);assertTrue(service.supplier("portal-"+a[0],a[1]).path("responsesFrozen").asBoolean());assertThrows(ApiException.class,()->service.submit("portal-"+a[0],a[1],b("{\"op\":\"respond\",\"requestId\":\"late\",\"decision\":\"accept\",\"offerId\":\""+a[2]+"\"}")));}

 @Test void portalRejectsStaleAcceptanceAndRetriesLostConfirmation() throws Exception {
   String id=create().path("id").asText(),token=invite(id,"A"),portalId="remote-"+id;
   end(id);
   JsonNode project=cmd(id,"{\"op\":\"offer\",\"amounts\":[\"100\",\"150\"],\"terms\":\"Whole\",\"replyDeadline\":"+(System.currentTimeMillis()+3600000)+"}");
   String offer=project.path("offers").get(0).path("id").asText();
   String supplier=project.path("invitations").get(0).path("id").asText();
   java.util.concurrent.atomic.AtomicBoolean dropReply=new java.util.concurrent.atomic.AtomicBoolean();
   com.sun.net.httpserver.HttpServer server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
   server.createContext("/api/procurement-relay/",exchange->{
     try{
       JsonNode publication=json.readTree(exchange.getRequestBody());
       JsonNode result=service.relay(portalId,publication);
       if(dropReply.getAndSet(false)){exchange.sendResponseHeaders(503,-1);return;}
       byte[] response=json.writeValueAsBytes(result);
       exchange.getResponseHeaders().set("Content-Type","application/json");
       exchange.sendResponseHeaders(200,response.length);
       exchange.getResponseBody().write(response);
     }finally{exchange.close();}
   });
   server.start();
   try{
     ReflectionTestUtils.setField(service,"portalUrl","http://127.0.0.1:"+server.getAddress().getPort());
     ReflectionTestUtils.setField(service,"relayKey","01234567890123456789012345678901");
     service.sync(c,id);
     ObjectNode response=json.createObjectNode().put("op","respond").put("offerId",offer).put("requestId","accept-1").put("decision","accept");
     service.submit(portalId,token,response);
     JsonNode synced=service.sync(c,id);
     ObjectNode award=json.createObjectNode().put("op","award").put("supplierId",supplier).put("offerId",offer)
         .put("reason","Confirmed").put("responseId",synced.path("responses").get(0).path("id").asText())
         .put("revision",synced.path("revision").asInt());
     service.submit(portalId,token,response.put("requestId","reject").put("decision","reject").put("note","No capacity"));
     assertEquals("PORTAL_ACCEPTANCE_CHANGED",assertThrows(ApiException.class,()->service.executeCommand(c,id,award)).getMessage());
     assertFalse(service.get(c,id).has("award"));
     assertEquals("reject",service.get(c,id).path("responses").get(1).path("decision").asText());
     service.submit(portalId,token,response.put("requestId","accept-2").put("decision","accept"));
     synced=service.sync(c,id);
     award.put("responseId",synced.path("responses").get(2).path("id").asText()).put("revision",synced.path("revision").asInt());
     dropReply.set(true);
     assertEquals("PORTAL_SYNC_FAILED",assertThrows(ApiException.class,()->service.executeCommand(c,id,award)).getMessage());
     assertTrue(service.get(c,id).has("pendingAward"));
     assertTrue(service.supplier(portalId,token).path("responsesFrozen").asBoolean());
     assertThrows(ApiException.class,()->service.submit(portalId,token,response.put("requestId","late")));
     JsonNode confirmed=service.executeCommand(c,id,award);
     assertFalse(confirmed.has("pendingAward"));
     assertEquals(award.path("responseId"),confirmed.path("award").path("responseId"));
     assertEquals(confirmed,service.executeCommand(c,id,award));
   }finally{
     server.stop(0);
     ReflectionTestUtils.setField(service,"portalUrl","");
     ReflectionTestUtils.setField(service,"relayKey","");
   }
 }

 @Test void supplierIdsSeparateNamesAndBlockDuplicateInvitations() throws Exception {
   String first=service.registerSupplier(c,b("{\"name\":\"Same name\"}")).path("id").asText();
   String second=service.registerSupplier(c,b("{\"name\":\"Same name\"}")).path("id").asText();
   assertNotEquals(first,second);
   String project=create().path("id").asText(), other=create().path("id").asText();
   String inviteFirst="{\"op\":\"invite\",\"supplierRecordId\":\""+first+"\"}";
   assertEquals(first,cmd(project,inviteFirst).path("invitations").get(0).path("supplierRecordId").asText());
   assertEquals("SUPPLIER_ALREADY_INVITED",assertThrows(ApiException.class,()->cmd(project,inviteFirst)).getMessage());
   cmd(project,"{\"op\":\"invite\",\"supplierRecordId\":\""+second+"\"}");
   cmd(other,inviteFirst);
   SessionContext anotherTenant=new SessionContext("U-ADMIN","t-alpaca","ADMIN","test","Buyer","zh");
   assertFalse(service.suppliers(anotherTenant).stream().anyMatch(row->first.equals(row.get("id"))));
   end(project);end(other);
   JsonNode summaries=service.metrics(c).path("suppliers");
   for(JsonNode summary:summaries){
     if(first.equals(summary.path("supplierKey").asText()))assertEquals(2,summary.path("endedInvitations").asInt());
     if(second.equals(summary.path("supplierKey").asText()))assertEquals(1,summary.path("endedInvitations").asInt());
   }
 }

 @Test void preAwardWithdrawalPreservesQuoteAndExcludesItFromComparison() throws Exception {
   String id=create().path("id").asText(),a=invite(id,"A"),other=invite(id,"B");
   service.submit(id,a,b("{\"op\":\"quote\",\"requestId\":\"a1\",\"amounts\":[\"10\",\"10\"]}"));
   service.submit(id,other,b("{\"op\":\"quote\",\"requestId\":\"b1\",\"amounts\":[\"90\",\"90\"]}"));
   end(id);
   JsonNode project=cmd(id,"{\"op\":\"offer\",\"amounts\":[\"10\",\"10\"],\"terms\":\"Same scope\",\"replyDeadline\":"+(System.currentTimeMillis()+3600000)+"}");
   String offer=project.path("offers").get(0).path("id").asText(),supplier=project.path("invitations").get(0).path("id").asText();
   service.submit(id,a,b("{\"op\":\"respond\",\"requestId\":\"accept\",\"offerId\":\""+offer+"\",\"decision\":\"accept\"}"));
   JsonNode request=b("{\"op\":\"withdrawQuote\",\"requestId\":\"withdraw\",\"reason\":\"No capacity\"}");
   service.submit(id,a,request);
   service.submit(id,a,request);
   assertEquals(1,service.get(c,id).path("quoteWithdrawals").size());
   assertEquals(1,service.supplier(id,a).path("quotes").size());
   assertFalse(service.supplier(id,other).has("quoteWithdrawal"));
   assertEquals("180.00",service.compare(c,id).path("bestWholeTotal").asText());
   assertEquals(1,service.compare(c,id).path("excludedWithdrawnQuotes").asInt());
   assertEquals("QUOTE_WITHDRAWN",assertThrows(ApiException.class,()->cmd(id,"{\"op\":\"award\",\"supplierId\":\""+supplier+"\",\"offerId\":\""+offer+"\",\"reason\":\"Old acceptance\"}")).getMessage());
 }

 @Test void portalRefusesToFreezeAnAcceptanceAfterQuoteWithdrawal() throws Exception {
   String id=create().path("id").asText(), token=invite(id,"A"), remote="relay-"+id;
   service.submit(id,token,b("{\"op\":\"quote\",\"requestId\":\"local\",\"amounts\":[\"10\",\"20\"]}"));
   ObjectNode publication=((ObjectNode)service.get(c,id)).deepCopy().put("publicationRevision",1);
   service.relay(remote,publication);
   service.submit(remote,token,b("{\"op\":\"quote\",\"requestId\":\"quote\",\"amounts\":[\"10\",\"20\"]}"));
   publication.put("status","closed").put("publicationRevision",2);
   publication.withArray("offers").addObject().put("id","offer-1").put("replyDeadline",System.currentTimeMillis()+60000);
   service.relay(remote,publication);
   JsonNode accepted=service.submit(remote,token,b("{\"op\":\"respond\",\"requestId\":\"accept\",\"offerId\":\"offer-1\",\"decision\":\"accept\"}"));
   service.submit(remote,token,b("{\"op\":\"withdrawQuote\",\"requestId\":\"withdraw\",\"reason\":\"No capacity\"}"));
   publication.put("publicationRevision",3).putObject("awardRequest").put("requestId","award")
       .put("supplierId",publication.path("invitations").get(0).path("id").asText())
       .put("offerId","offer-1").put("responseId",accepted.path("responses").get(0).path("id").asText());
   JsonNode receipt=service.relay(remote,publication);
   assertFalse(receipt.path("awardConfirmed").asBoolean());
   assertEquals(1,receipt.path("quoteWithdrawals").size());
   assertFalse(service.supplier(remote,token).path("responsesFrozen").asBoolean());
 }
}
