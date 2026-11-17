package com.ifitbest.server.infra.integration;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.ifitbest.server.config.FitbestProperties;

/** 短信验证码发送（阿里云 dysmsapi），未配置时 dev 模式 —— 与 NestJS SmsService 行为一致 */
@Service
public class SmsGateway {

    private static final Logger log = LoggerFactory.getLogger(SmsGateway.class);

    public record SendResult(String providerMsgId, boolean dev) {
    }

    private final FitbestProperties props;
    private final AliyunRpc aliyunRpc;

    public SmsGateway(FitbestProperties props, AliyunRpc aliyunRpc) {
        this.props = props;
        this.aliyunRpc = aliyunRpc;
    }

    public SendResult sendCode(String phone, String code, String scene) {
        String template = "bind".equals(scene)
            ? props.getAliyun().getSmsTemplateBind()
            : props.getAliyun().getSmsTemplateLogin();

        if (props.getAliyun().getAccessKeyId().isBlank() || template == null || template.isBlank()) {
            log.info("[sms:dev] {} scene={} code={}", phone, scene, code);
            return new SendResult("dev-" + System.currentTimeMillis(), true);
        }

        JsonNode data = aliyunRpc.call("dysmsapi.aliyuncs.com", "SendSms", "2017-05-25", Map.of(
            "PhoneNumbers", phone,
            "SignName", props.getAliyun().getSmsSignName(),
            "TemplateCode", template,
            "TemplateParam", "{\"code\":\"" + code + "\"}"
        ));
        return new SendResult(data.path("RequestId").asText(""), false);
    }
}
