package com.ifitbest.server.common.error;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 异常契约验证：响应结构 { code, message } 必须与原 NestJS HttpExceptionFilter 一致
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void bizExceptionKeepsStatusAndMessage() {
        ResponseEntity<Map<String, Object>> res = handler.onBiz(BizException.conflict("该手机号已绑定其他账号"));

        assertThat(res.getStatusCode().value()).isEqualTo(409);
        assertThat(res.getBody())
            .containsEntry("code", 409)
            .containsEntry("message", "该手机号已绑定其他账号");
    }

    @Test
    void unknownExceptionReturns500WithNestCompatibleMessage() {
        ResponseEntity<Map<String, Object>> res = handler.onUnknown(new RuntimeException("boom"));

        assertThat(res.getStatusCode().value()).isEqualTo(500);
        assertThat(res.getBody())
            .containsEntry("code", 500)
            .containsEntry("message", "服务器开小差了，请稍后重试");
    }

    @Test
    void noResourceReturns404() {
        ResponseEntity<Map<String, Object>> res = handler.onNoResource(
            new org.springframework.web.servlet.resource.NoResourceFoundException(
                org.springframework.http.HttpMethod.GET, "/missing"));

        assertThat(res.getStatusCode().value()).isEqualTo(404);
        assertThat(res.getBody()).containsEntry("code", 404);
    }
}
