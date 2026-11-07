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
}
