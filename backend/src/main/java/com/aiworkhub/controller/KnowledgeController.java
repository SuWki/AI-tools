package com.aiworkhub.controller;

import com.aiworkhub.auth.AuthInterceptor;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.service.KnowledgeService;
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
@RequestMapping("/api/knowledge")
public class KnowledgeController {

    private final KnowledgeService knowledge;

    public KnowledgeController(KnowledgeService knowledge) {
        this.knowledge = knowledge;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                          @RequestParam(value = "q", required = false) String q) {
        return knowledge.list(ctx, q);
    }

    @PostMapping
    public Map<String, Object> create(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @RequestBody Map<String, String> body) {
        return knowledge.create(ctx, body);
    }

    @PatchMapping("/{id}/review")
    public Map<String, Object> review(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @PathVariable("id") String id) {
        return knowledge.review(ctx, id);
    }
}
