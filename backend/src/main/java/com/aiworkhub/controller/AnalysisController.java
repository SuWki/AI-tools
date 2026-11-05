package com.aiworkhub.controller;

import com.aiworkhub.auth.AuthInterceptor;
import com.aiworkhub.auth.SessionContext;
import com.aiworkhub.service.AnalysisService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AnalysisController {

    private final AnalysisService analysis;

    public AnalysisController(AnalysisService analysis) {
        this.analysis = analysis;
    }

    @GetMapping("/tools/prompt")
    public Map<String, Object> prompt(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                      @RequestParam(value = "caseId", required = false) String caseId,
                                      @RequestParam(value = "type", required = false) String type,
                                      @RequestParam(value = "lang", required = false) String lang) {
        return analysis.prompt(ctx, caseId, type, lang);
    }

    @PostMapping("/analysis/checklist")
    public Map<String, Object> checklist(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                         @RequestBody Map<String, String> body) {
        return analysis.checklist(ctx, body);
    }

    @GetMapping("/analysis/reviews")
    public List<Map<String, Object>> reviews(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx) {
        return analysis.reviews(ctx);
    }

    @PostMapping("/analysis/reviews")
    public Map<String, Object> saveReview(@RequestAttribute(AuthInterceptor.ATTR) SessionContext ctx,
                                          @RequestBody Map<String, String> body) {
        return analysis.saveReview(ctx, body);
    }
}
