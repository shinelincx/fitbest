package com.ifitbest.server.common.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 可选登录：携带有效 Bearer 时注入 userId，否则匿名（对应 events / coach 的可选鉴权） */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface OptionalUser {
}
