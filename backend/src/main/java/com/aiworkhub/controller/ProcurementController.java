package com.aiworkhub.controller;
import com.aiworkhub.auth.*;import com.aiworkhub.service.ProcurementService;import com.fasterxml.jackson.databind.JsonNode;import org.springframework.web.bind.annotation.*;import java.util.*;
@RestController @RequestMapping("/api")
public class ProcurementController {
 private final ProcurementService service;public ProcurementController(ProcurementService service){this.service=service;}
 @GetMapping("/procurement") public List<JsonNode> list(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c){return service.list(c);}
 @GetMapping("/procurement-metrics") public JsonNode metrics(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c){return service.metrics(c);}
 @PostMapping("/procurement") public JsonNode create(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c,@RequestBody JsonNode b){return service.create(c,b);}
 @GetMapping("/procurement/{id}") public JsonNode get(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c,@PathVariable String id){return service.get(c,id);}
 @PostMapping("/procurement/{id}") public JsonNode cmd(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c,@PathVariable String id,@RequestBody JsonNode b){return service.command(c,id,b);}
 @GetMapping("/procurement/{id}/comparison") public JsonNode compare(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c,@PathVariable String id){return service.compare(c,id);}
 @PostMapping("/procurement/{id}/sync") public JsonNode sync(@RequestAttribute(AuthInterceptor.ATTR)SessionContext c,@PathVariable String id){return service.sync(c,id);}
 @PostMapping("/procurement-relay/{id}") public JsonNode relay(@PathVariable String id,@RequestHeader("X-Relay-Key")String key,@RequestBody JsonNode b){service.relayAuth(key);return service.relay(id,b);}
 @GetMapping("/supplier/{id}") public JsonNode supplier(@PathVariable String id,@RequestHeader("X-Invitation")String token){return service.supplier(id,token);}
 @PostMapping("/supplier/{id}") public JsonNode submit(@PathVariable String id,@RequestHeader("X-Invitation")String token,@RequestBody JsonNode b){return service.submit(id,token,b);}
}
