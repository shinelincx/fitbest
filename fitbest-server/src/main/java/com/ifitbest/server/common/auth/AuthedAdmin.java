package com.ifitbest.server.common.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 标注需要管理端登录（对应 NestJS @UseGuards(AdminGuard)） */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface AuthedAdmin {
    boolean allowViewerWrite() default false;
}
