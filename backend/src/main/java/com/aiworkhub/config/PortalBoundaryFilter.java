package com.aiworkhub.config;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import javax.servlet.*;import javax.servlet.http.*;import java.io.IOException;
/** Public supplier deployments never expose the internal login or procurement APIs. */
@Component
public class PortalBoundaryFilter extends OncePerRequestFilter {
 @Value("${procurement.portal-mode:false}") private boolean portalMode;
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
   String path=request.getRequestURI();
   if(portalMode&&path.startsWith("/api/")&&!path.startsWith("/api/supplier/")&&!path.startsWith("/api/procurement-relay/")&&!path.equals("/api/health")){
     response.setStatus(404);response.setContentType("application/json");response.getWriter().write("{\"error\":\"NOT_FOUND\"}");return;
   }
   chain.doFilter(request,response);
 }
}
