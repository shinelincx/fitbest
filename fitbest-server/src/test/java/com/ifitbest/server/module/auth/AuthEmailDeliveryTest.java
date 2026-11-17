package com.ifitbest.server.module.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.integration.EmailGateway;
import com.ifitbest.server.infra.persistence.MessageLogRepo;
import com.ifitbest.server.infra.redis.RedisCodeService;

class AuthEmailDeliveryTest {
    private static final String ADDRESS = "trainer@example.test";
    private static final String CODE = "345678";

    private final FitbestProperties props = new FitbestProperties();
    private final RedisCodeService codes = mock(RedisCodeService.class);
    private final EmailGateway email = mock(EmailGateway.class);
    private final AuthService auth = new AuthService(null, null, null, null, mock(MessageLogRepo.class),
        codes, null, null, email, null, null, props);

    AuthEmailDeliveryTest() {
        when(codes.issue(RedisCodeService.Channel.email, RedisCodeService.Scene.login, ADDRESS)).thenReturn(CODE);
    }

    @Test
    void simulatedDeliveryWithoutVisibleCodeReturnsFailure() {
        when(email.sendCode(ADDRESS, CODE)).thenReturn(new EmailGateway.SendResult("simulated", true));
        assertThatThrownBy(() -> auth.sendEmail(ADDRESS, "login"))
            .isInstanceOf(BizException.class).hasMessageContaining("邮件服务尚未配置");
    }

    @Test
    void configuredDevelopmentFlowCanReturnItsCodeButProductionRejectsSimulatedDelivery() {
        props.getAuth().setDevReturnCode(true);
        when(email.sendCode(ADDRESS, CODE)).thenReturn(new EmailGateway.SendResult("simulated", true));
        assertThat(auth.sendEmail(ADDRESS, "login")).containsEntry("devCode", CODE);

        props.setEnv("production");
        assertThatThrownBy(() -> auth.sendEmail(ADDRESS, "login"))
            .isInstanceOf(BizException.class).hasMessageContaining("邮件服务尚未配置");
        assertThatThrownBy(() -> new EmailGateway(props).sendCode(ADDRESS, CODE))
            .isInstanceOf(BizException.class).hasMessageContaining("邮件服务尚未配置");
    }

    @Test
    void gatewayConfirmationReturnsSuccessWithoutReturningTheCode() {
        props.getAuth().setDevReturnCode(true);
        when(email.sendCode(ADDRESS, CODE)).thenReturn(new EmailGateway.SendResult("delivery-confirmed", false));
        assertThat(auth.sendEmail(ADDRESS, "login")).containsEntry("sent", true).doesNotContainKey("devCode");
    }
}
