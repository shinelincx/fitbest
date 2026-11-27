package com.ifitbest.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * FITBEST 统一服务
 * 阶段一：静态站统一托管（7 站点 + SPA fallback）+ 健康检查 + Flyway 基线
 * 阶段二：按契约兼容原则承接原 NestJS API（/api/v1/**，12 个业务模块）
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class FitbestServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(FitbestServerApplication.class, args);
    }
}
