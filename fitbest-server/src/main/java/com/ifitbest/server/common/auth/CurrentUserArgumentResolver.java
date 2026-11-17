package com.ifitbest.server.common.auth;

import java.util.UUID;

import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import jakarta.servlet.http.HttpServletRequest;

/** 解析 @CurrentUser 参数 → 请求属性中的 userId（支持 String 与 UUID 两种参数类型） */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        if (!parameter.hasParameterAnnotation(CurrentUser.class)) {
            return false;
        }
        Class<?> type = parameter.getParameterType();
        return String.class.isAssignableFrom(type) || UUID.class.isAssignableFrom(type);
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        CurrentUser annotation = parameter.getParameterAnnotation(CurrentUser.class);
        boolean required = annotation == null || annotation.required();
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        String userId = request == null ? null : (String) request.getAttribute(UserAuthInterceptor.ATTR_USER_ID);
        if (userId == null) {
            if (!required) {
                return null;
            }
            throw new IllegalStateException("当前请求无用户上下文（缺少 @Authed）");
        }
        if (UUID.class.isAssignableFrom(parameter.getParameterType())) {
            return UUID.fromString(userId);
        }
        return userId;
    }
}
