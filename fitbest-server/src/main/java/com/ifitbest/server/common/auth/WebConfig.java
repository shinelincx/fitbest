package com.ifitbest.server.common.auth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.ifitbest.server.module.admin.AuditInterceptor;

/**
 * Web 层装配：API 认证拦截器（注解驱动）+ 参数解析器。
 * 静态资源托管配置见 common/web/StaticSitesConfig。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final UserAuthInterceptor userAuthInterceptor;
    private final AdminAuthInterceptor adminAuthInterceptor;
    private final AuditInterceptor auditInterceptor;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;
    private final CurrentAdminArgumentResolver currentAdminArgumentResolver;

    public WebConfig(UserAuthInterceptor userAuthInterceptor,
                     AdminAuthInterceptor adminAuthInterceptor,
                     @Autowired(required = false) AuditInterceptor auditInterceptor,
                     CurrentUserArgumentResolver currentUserArgumentResolver,
                     CurrentAdminArgumentResolver currentAdminArgumentResolver) {
        this.userAuthInterceptor = userAuthInterceptor;
        this.adminAuthInterceptor = adminAuthInterceptor;
        this.auditInterceptor = auditInterceptor;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
        this.currentAdminArgumentResolver = currentAdminArgumentResolver;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(userAuthInterceptor).addPathPatterns("/api/v1/**");
        registry.addInterceptor(adminAuthInterceptor).addPathPatterns("/api/v1/admin/**");
        if (auditInterceptor != null) {
            registry.addInterceptor(auditInterceptor).addPathPatterns("/api/v1/admin/**");
        }
    }

    @Override
    public void addArgumentResolvers(java.util.List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
        resolvers.add(currentAdminArgumentResolver);
    }
}
