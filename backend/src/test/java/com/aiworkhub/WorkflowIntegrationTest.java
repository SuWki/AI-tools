package com.aiworkhub;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:sqlite:file:workflow-tests?mode=memory&cache=shared"})
@AutoConfigureMockMvc
class WorkflowIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    String login(String email)throws Exception{return call("POST","/api/auth/login",null,"{\"email\":\""+email+"\",\"password\":\"demo1234\"}",200).path("token").asText();}
    JsonNode call(String method,String path,String token,String body,int expected)throws Exception {
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request;
        if("GET".equals(method))request=get(path);else if("PATCH".equals(method))request=patch(path);else request=post(path);
        request.contentType(MediaType.APPLICATION_JSON);if(token!=null)request.header("Authorization","Bearer "+token);if(body!=null)request.content(body);
        MvcResult result=mvc.perform(request).andExpect(status().is(expected)).andReturn();
        String output=result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);return output.isEmpty()?json.createObjectNode():json.readTree(output);
    }
    String create(String token)throws Exception{return call("POST","/api/cases",token,"{\"customer\":\"Test\",\"topic\":\"Integration enquiry\",\"message\":\"Please clarify requirements\",\"channel\":\"Email\"}",200).path("id").asText();}
    JsonNode cmd(String token,String id,int revision,String payload,int status)throws Exception {
        ObjectNode b=(ObjectNode)json.readTree(payload);b.put("revision",revision);return call("POST","/api/cases/"+id+"/workflow",token,b.toString(),status);
    }
    @Test void clarificationTaskDispatchAndClosure()throws Exception{
        String token=login("sales@compressor.demo"),id=create(token);
        JsonNode s=cmd(token,id,0,"{\"op\":\"draft\",\"text\":\"Please confirm air demand.\",\"lang\":\"en\",\"risk\":\"clarification\"}",200);
        String reply=s.path("replies").get(0).path("id").asText();
        cmd(token,id,1,"{\"op\":\"copy\",\"id\":\""+reply+"\"}",400);
        s=cmd(token,id,1,"{\"op\":\"submit\",\"id\":\""+reply+"\"}",200);assertEquals("approved",s.path("replies").get(0).path("status").asText());
        s=cmd(token,id,2,"{\"op\":\"copy\",\"id\":\""+reply+"\"}",200);assertFalse(s.path("replies").get(0).has("sentAt"));
        s=cmd(token,id,3,"{\"op\":\"dispatch\",\"id\":\""+reply+"\",\"channel\":\"Email\",\"sentAt\":"+(System.currentTimeMillis()-1000)+"}",200);assertEquals("sent",s.path("replies").get(0).path("status").asText());
        s=cmd(token,id,4,"{\"op\":\"task\",\"title\":\"Follow up\",\"assigneeId\":\"U-SALES-C\",\"timeZone\":\"Asia/Shanghai\",\"dueAt\":"+(System.currentTimeMillis()+3600000)+"}",200);
        cmd(token,id,5,"{\"op\":\"close\",\"result\":\"answered\",\"note\":\"Resolved\"}",400);
        s=cmd(token,id,5,"{\"op\":\"taskComplete\",\"id\":\""+s.path("tasks").get(0).path("id").asText()+"\",\"note\":\"Customer replied\"}",200);
        cmd(token,id,6,"{\"op\":\"close\",\"result\":\"answered\",\"note\":\"Resolved\"}",200);
        assertEquals("done",call("GET","/api/cases/"+id,token,null,200).path("status").asText());
        cmd(token,id,7,"{\"op\":\"draft\",\"text\":\"Illegal edit\",\"lang\":\"en\",\"risk\":\"clarification\"}",400);
        cmd(token,id,7,"{\"op\":\"reopen\",\"note\":\"Customer has another question\"}",200);
    }
    @Test void commitmentsRequireFieldsEvidenceAndIndependentAuthorisedReviewer()throws Exception{
        String sales=login("sales@compressor.demo"),reviewer=login("reviewer@compressor.demo"),admin=login("admin@workhub.demo"),id=create(sales);
        cmd(sales,id,0,"{\"op\":\"draft\",\"text\":\"Technical conclusion\",\"lang\":\"en\",\"risk\":\"technical\"}",200);
        JsonNode s=call("GET","/api/cases/"+id+"/workflow",sales,null,200);String reply=s.path("replies").get(0).path("id").asText();
        assertEquals("MISSING_CONFIRMED_FIELDS",cmd(sales,id,1,"{\"op\":\"submit\",\"id\":\""+reply+"\",\"reviewerId\":\"U-REVIEWER-C\"}",400).path("error").asText());
        ObjectNode fields=json.createObjectNode();for(JsonNode f:call("GET","/api/workflow/profile",sales,null,200).path("scenarios").get(0).path("fields")){
            ObjectNode v=fields.putObject(f.path("key").asText());v.put("value","confirmed value with units");v.put("source","customer message");v.put("status","confirmed");
        }
        ObjectNode b=json.createObjectNode();b.put("op","fields");b.put("scenario","stationary");b.set("fields",fields);cmd(sales,id,1,b.toString(),200);
        String doc=call("POST","/api/knowledge",sales,"{\"name\":\"Approved evidence\",\"sku\":\"TEST-1\",\"summary\":\"Scope of technical evidence\",\"source\":\"Authorised technical reference\"}",200).path("id").asText();
        call("PATCH","/api/knowledge/"+doc+"/review",reviewer,null,200);
        cmd(sales,id,2,"{\"op\":\"evidence\",\"ids\":[\""+doc+"\"]}",200);
        assertEquals("REVIEW_AUTHORITY_REQUIRED",cmd(sales,id,3,"{\"op\":\"submit\",\"id\":\""+reply+"\",\"reviewerId\":\"U-ADMIN\"}",400).path("error").asText());
        cmd(sales,id,3,"{\"op\":\"submit\",\"id\":\""+reply+"\",\"reviewerId\":\"U-REVIEWER-C\"}",200);
        call("GET","/api/cases/"+id,reviewer,null,200);
        cmd(admin,id,4,"{\"op\":\"approve\",\"id\":\""+reply+"\"}",403);
        s=cmd(reviewer,id,4,"{\"op\":\"approve\",\"id\":\""+reply+"\",\"note\":\"Checked\"}",200);assertEquals("approved",s.path("replies").get(0).path("status").asText());
        s=cmd(sales,id,5,b.toString(),200);assertEquals("stale",s.path("replies").get(0).path("status").asText());
        cmd(sales,id,6,"{\"op\":\"copy\",\"id\":\""+reply+"\"}",400);
        cmd(sales,id,6,"{\"op\":\"submit\",\"id\":\""+reply+"\",\"reviewerId\":\"U-REVIEWER-C\"}",400);
    }
    @Test void revisionConflictDoesNotOverwriteState()throws Exception{
        String token=login("admin@workhub.demo"),id=create(token);
        cmd(token,id,0,"{\"op\":\"draft\",\"text\":\"First version\",\"lang\":\"en\",\"risk\":\"clarification\"}",200);
        cmd(token,id,0,"{\"op\":\"draft\",\"text\":\"Stale overwrite\",\"lang\":\"en\",\"risk\":\"clarification\"}",409);
        assertEquals(1,call("GET","/api/cases/"+id+"/workflow",token,null,200).path("replies").size());
    }
    @Test void tenantIsolationAndAssignmentScopeAreEnforced()throws Exception{
        String sales=login("sales@compressor.demo"),other=login("sales@lubricant.demo"),reviewer=login("reviewer@compressor.demo"),id=create(sales);
        call("GET","/api/cases/"+id+"/workflow",other,null,404);call("GET","/api/cases/"+id,reviewer,null,404);
        cmd(sales,id,0,"{\"op\":\"task\",\"title\":\"Leak\",\"assigneeId\":\"U-SALES-L\",\"timeZone\":\"Asia/Shanghai\",\"dueAt\":1000}",400);
        call("GET","/api/export",sales,null,403);
        call("PATCH","/api/cases/"+id+"/status",sales,"{\"status\":\"done\"}",400);
    }
    @Test void switchingOnlyChangesCurrentSessionAndLogoutRevokesIt()throws Exception{
        String first=login("admin@workhub.demo"),second=login("admin@workhub.demo");
        call("POST","/api/auth/switch-tenant",first,"{\"tenantId\":\"t-alpaca\"}",200);
        assertEquals("t-alpaca",call("GET","/api/auth/me",first,null,200).path("activeTenantId").asText());
        assertEquals("t-compressor",call("GET","/api/auth/me",second,null,200).path("activeTenantId").asText());
        mvc.perform(get("/api/cases").header("Authorization","Bearer "+first).header("X-Workspace-Id","t-compressor")).andExpect(status().isConflict());
        call("POST","/api/auth/logout",first,null,200);call("GET","/api/auth/me",first,null,401);call("GET","/api/auth/me",second,null,200);
        jdbc.update("UPDATE sessions SET created_at=0 WHERE token=?",second);call("GET","/api/auth/me",second,null,401);
    }
    @Test void profilesReflectAllThreeCompanies()throws Exception{
        String token=login("admin@workhub.demo");
        for(String tenant:new String[]{"t-compressor","t-alpaca","t-lubricant"}){
            call("POST","/api/auth/switch-tenant",token,"{\"tenantId\":\""+tenant+"\"}",200);
            assertEquals(3,call("GET","/api/workflow/profile",token,null,200).path("scenarios").size());
        }
        assertEquals("上海安特瑞商贸有限公司",call("GET","/api/auth/me",token,null,200).path("activeTenant").path("nameZh").asText());
    }
    @Test void publishedKnowledgeRevisionsInvalidatePendingDispatch()throws Exception{
        String sales=login("sales@compressor.demo"),reviewer=login("reviewer@compressor.demo"),id=create(sales);
        String doc=call("POST","/api/knowledge",sales,"{\"name\":\"Versioned reference\",\"sku\":\"V-TEST\",\"summary\":\"Original facts\",\"source\":\"Approved source\"}",200).path("id").asText();
        JsonNode published=call("PATCH","/api/knowledge/"+doc+"/review",reviewer,null,200);
        cmd(sales,id,0,"{\"op\":\"evidence\",\"ids\":[\""+doc+"\"]}",200);
        JsonNode s=cmd(sales,id,1,"{\"op\":\"draft\",\"text\":\"Please confirm these facts.\",\"lang\":\"en\",\"risk\":\"clarification\"}",200);String reply=s.path("replies").get(0).path("id").asText();
        cmd(sales,id,2,"{\"op\":\"submit\",\"id\":\""+reply+"\"}",200);
        JsonNode next=call("POST","/api/knowledge/"+doc+"/versions",sales,"{\"version\":"+published.path("version").asInt()+",\"name\":\"Updated reference\",\"summary\":\"Corrected facts\",\"source\":\"Revised source\"}",200);
        assertEquals("Original facts",call("GET","/api/knowledge",sales,null,200).findValuesAsText("summary").stream().filter(v->v.equals("Original facts")).findFirst().orElse(""));
        call("POST","/api/knowledge/"+doc+"/versions/"+next.path("version").asInt()+"/publish",sales,null,403);
        call("POST","/api/knowledge/"+doc+"/versions/"+next.path("version").asInt()+"/publish",reviewer,null,200);
        assertEquals("EVIDENCE_CHANGED",cmd(sales,id,3,"{\"op\":\"copy\",\"id\":\""+reply+"\"}",400).path("error").asText());
        assertTrue(call("GET","/api/knowledge/"+doc+"/versions",sales,null,200).size()>=3);
    }
}
