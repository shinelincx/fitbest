package com.ifitbest.server.infra.integration;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ifitbest.server.config.FitbestProperties;

/** OpenAI 兼容 Chat Completions 客户端（AI 教练），失败由调用方降级到本地规则 */
@Service
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final FitbestProperties props;

    public LlmClient(FitbestProperties props) {
        this.props = props;
    }

    /** message role: system / user / assistant */
    public String chat(List<Map<String, String>> messages, double temperature, int maxTokens) {
        String base = props.getLlm().getApiBase();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        try {
            Map<String, Object> payload = new java.util.LinkedHashMap<>();
            payload.put("model", props.getLlm().getModel());
            payload.put("temperature", temperature);
            payload.put("max_tokens", maxTokens);
            payload.put("messages", messages);
            // qwen3 系列默认深度思考，验证码级问答无需思考——禁用以避免超时
            if (props.getLlm().getModel().startsWith("qwen")) {
                payload.put("enable_thinking", false);
            }
            String body = MAPPER.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder(URI.create(base + "/chat/completions"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + props.getLlm().getApiKey())
                .timeout(Duration.ofMillis(props.getLlm().getTimeoutMs()))
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
            HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() < 200 || res.statusCode() >= 300) {
                throw new IllegalStateException("LLM HTTP " + res.statusCode());
            }
            JsonNode data = MAPPER.readTree(res.body());
            String content = data.path("choices").path(0).path("message").path("content").asText("").trim();
            return content.isEmpty() ? null : content;
        } catch (Exception e) {
            log.warn("[coach] LLM 调用失败，回退本地规则：{}", e.getMessage());
            return null;
        }
    }
}
