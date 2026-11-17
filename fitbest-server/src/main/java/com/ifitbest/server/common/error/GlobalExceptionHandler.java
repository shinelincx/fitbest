package com.ifitbest.server.common.error;

import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常处理 —— 契约与原 NestJS HttpExceptionFilter 完全一致：
 *   失败响应 = HTTP 4xx/5xx + { code: <status>, message: <可读中文> }
 *   - 校验失败取第一条错误消息（对齐 ZodPipe 首条 issue 行为）
 *   - 未知异常 500，兜底文案与 NestJS 相同
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 业务异常：状态码与响应体 code 一致 */
    @ExceptionHandler(BizException.class)
    public ResponseEntity<Map<String, Object>> onBiz(BizException e) {
        return body(e.getCode(), e.getMessage());
    }

    /** Bean Validation（@Valid 请求体）：取第一条字段错误消息 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> onValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
            .map(FieldError::getDefaultMessage)
            .filter(Objects::nonNull)
            .findFirst()
            .orElse("参数不正确");
        return body(400, message);
    }

    /** Bean Validation（方法参数级，如 @RequestParam @Pattern） */
    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<Map<String, Object>> onHandlerValidation(HandlerMethodValidationException e) {
        String message = e.getAllErrors().stream()
            .map(MessageSourceResolvable::getDefaultMessage)
            .filter(Objects::nonNull)
            .findFirst()
            .orElse("参数不正确");
        return body(400, message);
    }

    /** 请求体不可读（非法 JSON 等） */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> onUnreadable(HttpMessageNotReadableException e) {
        return body(400, "请求体格式不正确");
    }

    /** 静态资源 / 路由未命中 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> onNoResource(NoResourceFoundException e) {
        return body(404, "资源不存在");
    }

    /** Spring Security 拒绝（阶段二起生效） */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> onAccessDenied(AccessDeniedException e) {
        return body(403, "无权访问");
    }

    /** 兜底：与 NestJS 文案一致；服务端记录堆栈 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> onUnknown(Exception e) {
        log.error("未处理异常", e);
        return body(500, "服务器开小差了，请稍后重试");
    }

    private ResponseEntity<Map<String, Object>> body(int code, String message) {
        return ResponseEntity.status(code).body(Map.of("code", code, "message", message));
    }
}
