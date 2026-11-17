package com.ifitbest.server.common.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.FitbestProperties;
import com.ifitbest.server.infra.persistence.AdminUser;
import com.ifitbest.server.infra.persistence.AdminUserRepo;

class AdminAuthInterceptorTest {
    private final FitbestProperties properties = new FitbestProperties();
    private final JwtCodec tokens = new JwtCodec(properties);
    private final AdminUserRepo admins = mock(AdminUserRepo.class);
    private final AdminAuthInterceptor interceptor = new AdminAuthInterceptor(tokens, properties, admins);

    @Test
    void activeAdministratorWithCurrentPermissionsCanUseTheSession() throws Exception {
        AdminUser admin = admin();
        when(admins.findById(admin.getId())).thenReturn(Optional.of(admin));
        MockHttpServletRequest request = signedRequest(admin);

        assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), protectedHandler())).isTrue();
        assertThat(request.getAttribute(AdminAuthInterceptor.ATTR_ADMIN)).isInstanceOf(JwtCodec.AdminPayload.class);
    }

    @Test
    void viewerCanReadButCannotUseWriteMethods() throws Exception {
        AdminUser admin = admin();
        admin.setRole("viewer");
        when(admins.findById(admin.getId())).thenReturn(Optional.of(admin));
        MockHttpServletRequest request = signedRequest(admin);
        request.setMethod("GET");
        assertThat(interceptor.preHandle(request, new MockHttpServletResponse(), protectedHandler())).isTrue();
        for (String method : new String[]{"POST", "PUT", "PATCH", "DELETE"}) {
            request.setMethod(method);
            assertThatThrownBy(() -> interceptor.preHandle(request, new MockHttpServletResponse(), protectedHandler()))
                .isInstanceOfSatisfying(BizException.class, error -> assertThat(error.getCode()).isEqualTo(403));
        }
    }

    @ParameterizedTest
    @MethodSource("permissionChanges")
    void changesToAdministratorInvalidateTheExistingSession(Consumer<AdminUser> change) throws Exception {
        AdminUser admin = admin();
        MockHttpServletRequest request = signedRequest(admin);
        change.accept(admin);
        when(admins.findById(admin.getId())).thenReturn(Optional.of(admin));
        HandlerMethod handler = protectedHandler();

        assertThatThrownBy(() -> interceptor.preHandle(request, new MockHttpServletResponse(), handler))
            .isInstanceOfSatisfying(BizException.class, error -> assertThat(error.getCode()).isEqualTo(401));
        assertThat(request.getAttribute(AdminAuthInterceptor.ATTR_ADMIN)).isNull();
    }

    static Stream<Consumer<AdminUser>> permissionChanges() {
        return Stream.of(
            admin -> admin.setStatus("disabled"),
            admin -> admin.setRole("viewer"),
            admin -> admin.setOrgId(UUID.randomUUID()),
            admin -> admin.setGymId(UUID.randomUUID())
        );
    }

    private static AdminUser admin() {
        AdminUser admin = new AdminUser();
        admin.setId(UUID.randomUUID());
        admin.setOrgId(UUID.randomUUID());
        admin.setGymId(UUID.randomUUID());
        admin.setRole("gym_admin");
        return admin;
    }

    private MockHttpServletRequest signedRequest(AdminUser admin) {
        JwtCodec.AdminPayload payload = new JwtCodec.AdminPayload(admin.getId().toString(), admin.getRole(),
            admin.getOrgId().toString(), admin.getGymId().toString());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + tokens.signAdmin(payload));
        return request;
    }

    private static HandlerMethod protectedHandler() throws NoSuchMethodException {
        return new HandlerMethod(new ProtectedController(), ProtectedController.class.getMethod("read"));
    }

    @AuthedAdmin
    static class ProtectedController {
        public void read() {}
    }
}
