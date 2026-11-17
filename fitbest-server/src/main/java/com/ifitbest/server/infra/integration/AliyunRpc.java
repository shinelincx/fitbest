package com.ifitbest.server.infra.integration;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.config.FitbestProperties;

/**
 * 阿里云 RPC 风格 API 签名（短信 SendSms / 邮件 SingleSendMail 共用）——
 * 与原 NestJS integrations/aliyun-rpc.ts 逻辑一致（HMAC-SHA1 + RFC3986 编码）。
 */
@Component
public class AliyunRpc {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter ISO_S = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'");

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final FitbestProperties props;

    public AliyunRpc(FitbestProperties props) {
        this.props = props;
    }

    public JsonNode call(String host, String action, String version, Map<String, String> params) {
        String accessKeyId = props.getAliyun().getAccessKeyId();
        String accessKeySecret = props.getAliyun().getAccessKeySecret();
        if (accessKeyId == null || accessKeyId.isBlank() || accessKeySecret == null || accessKeySecret.isBlank()) {
            throw new IllegalStateException("阿里云 AccessKey 未配置");
        }

        TreeMap<String, String> all = new TreeMap<>();
        all.put("AccessKeyId", accessKeyId);
        all.put("Action", action);
        all.put("Format", "JSON");
        all.put("SignatureMethod", "HMAC-SHA1");
        all.put("SignatureNonce", UUID.randomUUID().toString());
        all.put("SignatureVersion", "1.0");
        all.put("Timestamp", Instant.now().atZone(ZoneOffset.UTC).format(ISO_S));
        all.put("Version", version);
        all.putAll(params);

        StringBuilder canonical = new StringBuilder();
        for (Map.Entry<String, String> e : all.entrySet()) {
            if (canonical.length() > 0) {
                canonical.append('&');
            }
            canonical.append(encode(e.getKey())).append('=').append(encode(e.getValue()));
        }
        String stringToSign = "GET&" + encode("/") + "&" + encode(canonical.toString());
        String signature = hmacSha1(stringToSign, accessKeySecret + "&");

        try {
            String url = "https://" + host + "/?" + canonical + "&Signature=" + encode(signature);
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).GET().build();
            HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode data = MAPPER.readTree(res.body());
            if (res.statusCode() < 200 || res.statusCode() >= 300
                || (data.has("Code") && !"OK".equals(data.path("Code").asText()))) {
                String message = data.hasNonNull("Message") ? data.get("Message").asText()
                    : "阿里云接口调用失败（" + res.statusCode() + "）";
                throw new IllegalStateException(message);
            }
            return data;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("阿里云接口调用失败", e);
        }
    }

    /** RFC3986 编码（与 Node encodeURIComponent + 替换 !'()* 一致） */
    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
            .replace("+", "%20")
            .replace("*", "%2A")
            .replace("%7E", "~")
            .replace("!", "%21")
            .replace("'", "%27")
            .replace("(", "%28")
            .replace(")", "%29");
    }

    private static String hmacSha1(String data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return java.util.Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
