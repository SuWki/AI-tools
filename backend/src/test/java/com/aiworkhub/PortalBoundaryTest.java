package com.aiworkhub;
import com.aiworkhub.config.PortalBoundaryFilter;import org.junit.jupiter.api.Test;import org.springframework.mock.web.*;import org.springframework.test.util.ReflectionTestUtils;import static org.junit.jupiter.api.Assertions.*;
class PortalBoundaryTest {
 @Test void publicPortalBlocksInternalAuthenticationAndBuyerApis()throws Exception{
   for(String path:new String[]{"/api/auth/login","/api/procurement","/api/settings","/api/export"}){
     PortalBoundaryFilter filter=new PortalBoundaryFilter();ReflectionTestUtils.setField(filter,"portalMode",true);MockHttpServletResponse response=new MockHttpServletResponse();MockFilterChain chain=new MockFilterChain();filter.doFilter(new MockHttpServletRequest("GET",path),response,chain);assertEquals(404,response.getStatus());assertNull(chain.getRequest());
   }
   PortalBoundaryFilter filter=new PortalBoundaryFilter();ReflectionTestUtils.setField(filter,"portalMode",true);MockFilterChain chain=new MockFilterChain();filter.doFilter(new MockHttpServletRequest("GET","/api/supplier/example"),new MockHttpServletResponse(),chain);assertNotNull(chain.getRequest());
 }
}
