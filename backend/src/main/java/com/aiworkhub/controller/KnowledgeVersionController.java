package com.aiworkhub.controller;
import com.aiworkhub.auth.*;import com.aiworkhub.service.KnowledgeVersionService;import com.fasterxml.jackson.databind.JsonNode;import org.springframework.web.bind.annotation.*;import java.util.*;
@RestController @RequestMapping("/api/knowledge/{id}")
public class KnowledgeVersionController {
    private final KnowledgeVersionService versions;public KnowledgeVersionController(KnowledgeVersionService versions){this.versions=versions;}
    @GetMapping("/versions") public List<Map<String,Object>> history(@RequestAttribute(AuthInterceptor.ATTR) SessionContext c,@PathVariable String id){return versions.history(c,id);}
    @PostMapping("/versions") public Map<String,Object> revise(@RequestAttribute(AuthInterceptor.ATTR) SessionContext c,@PathVariable String id,@RequestBody JsonNode b){return versions.revise(c,id,b);}
    @PostMapping("/versions/{version}/publish") public Map<String,Object> publish(@RequestAttribute(AuthInterceptor.ATTR) SessionContext c,@PathVariable String id,@PathVariable int version){return versions.publish(c,id,version);}
    @PostMapping("/retire") public Map<String,Boolean> retire(@RequestAttribute(AuthInterceptor.ATTR) SessionContext c,@PathVariable String id){versions.retire(c,id);return Collections.singletonMap("ok",true);}
}
