package com.aiworkhub.controller;

import com.aiworkhub.auth.AuthInterceptor;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.service.CaseService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cases")
public class CaseController {

    private final CaseService cases;

    public CaseController(CaseService cases) {
        this.cases = cases;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                          @RequestParam(value = "status", required = false) String status) {
        return cases.list(ctx, status);
    }

    @PostMapping
    public Map<String, Object> create(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @RequestBody Map<String, String> body) {
        return cases.create(ctx, body);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @PathVariable("id") String id) {
        return cases.detail(ctx, id);
    }

    @PatchMapping("/{id}/status")
    public Map<String, Object> status(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @PathVariable("id") String id,
                                      @RequestBody Map<String, String> body) {
        return cases.updateStatus(ctx, id, body.get("status"));
    }

    @PostMapping("/{id}/notes")
    public Map<String, Object> note(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                    @PathVariable("id") String id,
                                    @RequestBody Map<String, String> body) {
        return cases.addNote(ctx, id, body.get("text"));
    }

    @GetMapping("/{id}/reply")
    public Map<String, Object> reply(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                     @PathVariable("id") String id) {
        return cases.reply(ctx, id);
    }

    @PostMapping("/{id}/reply-copy")
    public Map<String, Object> replyCopy(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                         @PathVariable("id") String id) {
        cases.auditReplyCopy(ctx, id);
        return java.util.Collections.singletonMap("ok", true);
    }
}
