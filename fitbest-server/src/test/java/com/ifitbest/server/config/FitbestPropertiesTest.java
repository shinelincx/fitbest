package com.ifitbest.server.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class FitbestPropertiesTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
        .withUserConfiguration(TestConfiguration.class);

    @Test
    void developmentAllowsLocalDefaults() {
        context.run(result -> assertThat(result).hasNotFailed());
    }

    @Test
    void productionRejectsMissingSecretsAtStartup() {
        context.withPropertyValues("fitbest.env=production").run(result -> assertThat(result).hasFailed()
            .getFailure().hasRootCauseMessage("生产环境必须为 JWT_ACCESS_SECRET 配置至少 32 字节的独立密钥"));
    }

    @Test
    void productionRejectsSharedSecrets() {
        String secret = UUID.randomUUID().toString();
        context.withPropertyValues("fitbest.env=production", "fitbest.jwt.access-secret=" + secret,
            "fitbest.jwt.refresh-secret=" + secret, "fitbest.jwt.admin-secret=" + UUID.randomUUID())
            .run(result -> assertThat(result).hasFailed()
                .getFailure().hasRootCauseMessage("生产环境的三个 JWT 密钥必须不同"));
    }

    @Test
    void productionAcceptsIndependentConfiguredSecrets() {
        context.withPropertyValues("fitbest.env=production", "fitbest.jwt.access-secret=" + UUID.randomUUID(),
            "fitbest.jwt.refresh-secret=" + UUID.randomUUID(), "fitbest.jwt.admin-secret=" + UUID.randomUUID())
            .run(result -> assertThat(result).hasNotFailed());
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(FitbestProperties.class)
    static class TestConfiguration {}
}
