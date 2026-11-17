package com.ifitbest.server.infra.integration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.common.util.Times;
import com.ifitbest.server.config.FitbestProperties;

/** 微信 OAuth2 授权码换身份 —— 与 NestJS WechatService 一致（未配置时 dev 模式模拟身份） */
@Service
public class WechatGateway {

    public record WechatIdentity(String openid, String unionid, String nickname) {
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final FitbestProperties props;

    public WechatGateway(FitbestProperties props) {
        this.props = props;
    }

    public WechatIdentity exchange(String code, String client) {
        String appId = "web".equals(client) ? props.getWechat().getWebAppId() : props.getWechat().getAppId();
        String secret = "web".equals(client) ? props.getWechat().getWebAppSecret() : props.getWechat().getAppSecret();

        if (appId == null || appId.isBlank() || secret == null || secret.isBlank()) {
            if (props.isProd()) {
                throw new IllegalStateException("微信登录未配置");
            }
            String devId = Times.sha256Hex(code).substring(0, 20);
            return new WechatIdentity("dev_" + devId, "devu_" + devId, null);
        }

        try {
            URI url = URI.create("https://api.weixin.qq.com/sns/oauth2/access_token?appid=" + appId
                + "&secret=" + secret + "&code=" + code + "&grant_type=authorization_code");
            JsonNode data = MAPPER.readTree(http.send(
                HttpRequest.newBuilder(url).GET().build(), HttpResponse.BodyHandlers.ofString()).body());
            if (!data.hasNonNull("openid")) {
                String message = data.hasNonNull("errmsg") ? data.get("errmsg").asText() : "微信授权失败";
                throw new IllegalStateException(message);
            }

            String nickname = null;
            if (data.hasNonNull("access_token")) {
                try {
                    URI infoUrl = URI.create("https://api.weixin.qq.com/sns/userinfo?access_token="
                        + data.get("access_token").asText() + "&openid=" + data.get("openid").asText());
                    JsonNode info = MAPPER.readTree(http.send(
                        HttpRequest.newBuilder(infoUrl).GET().build(), HttpResponse.BodyHandlers.ofString()).body());
                    nickname = info.hasNonNull("nickname") ? info.get("nickname").asText() : null;
                } catch (Exception ignored) {
                    // 拉取昵称失败不阻断登录
                }
            }

            return new WechatIdentity(
                data.get("openid").asText(),
                data.hasNonNull("unionid") ? data.get("unionid").asText() : null,
                nickname);
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("微信授权失败", e);
        }
    }
}
