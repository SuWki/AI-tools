package com.aiworkhub.controller;
import com.aiworkhub.auth.*;
import com.aiworkhub.service.WorkflowService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api")
public class WorkflowController {
    private final WorkflowService workflows;
    public WorkflowController(WorkflowService workflows){this.workflows=workflows;}
    @GetMapping("/workflow/profile") public JsonNode profile(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx){return workflows.profile(ctx);}
    @GetMapping("/workflow/members") public List<Map<String,Object>> members(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx){return workflows.members(ctx);}
    @GetMapping("/workflow/inbox") public List<JsonNode> inbox(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx){return workflows.inbox(ctx);}
    @GetMapping("/cases/{id}/workflow") public JsonNode get(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,@PathVariable String id){return workflows.get(ctx,id);}
    @PostMapping("/cases/{id}/workflow") public JsonNode command(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,@PathVariable String id,@RequestBody JsonNode body){return workflows.command(ctx,id,body);}
}
