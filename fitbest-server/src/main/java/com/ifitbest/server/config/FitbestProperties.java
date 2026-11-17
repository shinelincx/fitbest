package com.ifitbest.server.config;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

import jakarta.annotation.PostConstruct;

/**
 * 业务配置 —— 键名与环境变量与原 NestJS .env 完全一致，运维零心智切换
 */
@ConfigurationProperties(prefix = "fitbest")
public class FitbestProperties {

    private String env = "development";
    private String publicBaseUrl = "http://localhost:8080";
    private final Jwt jwt = new Jwt();
    private final Auth auth = new Auth();
    private final Qr qr = new Qr();
    private final Wechat wechat = new Wechat();
    private final Aliyun aliyun = new Aliyun();
    private final Mail mail = new Mail();
    private final Llm llm = new Llm();

    public boolean isProd() {
        return "production".equalsIgnoreCase(env == null ? null : env.trim());
    }

    @PostConstruct
    void validateProductionSecrets() {
        if (!isProd()) {
            return;
        }
        requireJwtSecret("JWT_ACCESS_SECRET", jwt.getAccessSecret());
        requireJwtSecret("JWT_REFRESH_SECRET", jwt.getRefreshSecret());
        requireJwtSecret("JWT_ADMIN_SECRET", jwt.getAdminSecret());
        if (jwt.getAccessSecret().equals(jwt.getRefreshSecret())
            || jwt.getAccessSecret().equals(jwt.getAdminSecret())
            || jwt.getRefreshSecret().equals(jwt.getAdminSecret())) {
            throw new IllegalStateException("生产环境的三个 JWT 密钥必须不同");
        }
    }

    private static void requireJwtSecret(String name, String value) {
        String normalized = value == null ? "" : value.strip().toLowerCase(Locale.ROOT);
        if (value == null || !value.equals(value.strip())
            || value.getBytes(StandardCharsets.UTF_8).length < 32
            || normalized.startsWith("dev-") || normalized.startsWith("replace")
            || normalized.startsWith("change") || normalized.startsWith("your-")) {
            throw new IllegalStateException("生产环境必须为 " + name + " 配置至少 32 字节的独立密钥");
        }
    }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }
    public String getPublicBaseUrl() { return publicBaseUrl; }
    public void setPublicBaseUrl(String v) { this.publicBaseUrl = v; }
    public Jwt getJwt() { return jwt; }
    public Auth getAuth() { return auth; }
    public Qr getQr() { return qr; }
    public Wechat getWechat() { return wechat; }
    public Aliyun getAliyun() { return aliyun; }
    public Mail getMail() { return mail; }
    public Llm getLlm() { return llm; }

    public static class Jwt {
        private String accessSecret = "dev-access-secret";
        private String refreshSecret = "dev-refresh-secret";
        private String adminSecret = "dev-admin-secret";
        private String accessTtl = "15m";
        private String refreshTtl = "30d";

        public String getAccessSecret() { return accessSecret; }
        public void setAccessSecret(String v) { this.accessSecret = v; }
        public String getRefreshSecret() { return refreshSecret; }
        public void setRefreshSecret(String v) { this.refreshSecret = v; }
        public String getAdminSecret() { return adminSecret; }
        public void setAdminSecret(String v) { this.adminSecret = v; }
        public String getAccessTtl() { return accessTtl; }
        public void setAccessTtl(String v) { this.accessTtl = v; }
        public String getRefreshTtl() { return refreshTtl; }
        public void setRefreshTtl(String v) { this.refreshTtl = v; }
    }

    public static class Auth {
        private int codeTtl = 300;
        private int cooldown = 60;
        private int dailyLimit = 10;
        private boolean devReturnCode = false;
        private List<String> devPhoneAllowlist = List.of();

        public int getCodeTtl() { return codeTtl; }
        public void setCodeTtl(int v) { this.codeTtl = v; }
        public int getCooldown() { return cooldown; }
        public void setCooldown(int v) { this.cooldown = v; }
        public int getDailyLimit() { return dailyLimit; }
        public void setDailyLimit(int v) { this.dailyLimit = v; }
        public boolean isDevReturnCode() { return devReturnCode; }
        public void setDevReturnCode(boolean v) { this.devReturnCode = v; }
        public List<String> getDevPhoneAllowlist() { return devPhoneAllowlist; }
        public void setDevPhoneAllowlist(List<String> v) { this.devPhoneAllowlist = v; }
    }

    public static class Qr {
        private String secret = "dev-qr-secret";

        public String getSecret() { return secret; }
        public void setSecret(String v) { this.secret = v; }
    }

    public static class Wechat {
        private String appId = "";
        private String appSecret = "";
        private String webAppId = "";
        private String webAppSecret = "";

        public String getAppId() { return appId; }
        public void setAppId(String v) { this.appId = v; }
        public String getAppSecret() { return appSecret; }
        public void setAppSecret(String v) { this.appSecret = v; }
        public String getWebAppId() { return webAppId; }
        public void setWebAppId(String v) { this.webAppId = v; }
        public String getWebAppSecret() { return webAppSecret; }
        public void setWebAppSecret(String v) { this.webAppSecret = v; }
    }

    public static class Aliyun {
        private String accessKeyId = "";
        private String accessKeySecret = "";
        private String smsSignName = "FITBEST";
        private String smsTemplateLogin = "";
        private String smsTemplateBind = "";

        public String getAccessKeyId() { return accessKeyId; }
        public void setAccessKeyId(String v) { this.accessKeyId = v; }
        public String getAccessKeySecret() { return accessKeySecret; }
        public void setAccessKeySecret(String v) { this.accessKeySecret = v; }
        public String getSmsSignName() { return smsSignName; }
        public void setSmsSignName(String v) { this.smsSignName = v; }
        public String getSmsTemplateLogin() { return smsTemplateLogin; }
        public void setSmsTemplateLogin(String v) { this.smsTemplateLogin = v; }
        public String getSmsTemplateBind() { return smsTemplateBind; }
        public void setSmsTemplateBind(String v) { this.smsTemplateBind = v; }
    }

    /** 通用 SMTP 邮件（腾讯企业邮 / QQ / 网易 / 自建等） */
    public static class Mail {
        private String host = "";
        private int port = 465;
        /** true = 465 SSL；false = 587 STARTTLS */
        private boolean ssl = true;
        private String username = "";
        private String password = "";
        private String from = "";
        private String fromName = "FITBEST";

        public String getHost() { return host; }
        public void setHost(String v) { this.host = v; }
        public int getPort() { return port; }
        public void setPort(int v) { this.port = v; }
        public boolean isSsl() { return ssl; }
        public void setSsl(boolean v) { this.ssl = v; }
        public String getUsername() { return username; }
        public void setUsername(String v) { this.username = v; }
        public String getPassword() { return password; }
        public void setPassword(String v) { this.password = v; }
        public String getFrom() { return from; }
        public void setFrom(String v) { this.from = v; }
        public String getFromName() { return fromName; }
        public void setFromName(String v) { this.fromName = v; }
    }

    public static class Llm {
        private String apiBase = "https://api.openai.com/v1";
        private String apiKey = "";
        private String model = "gpt-4o-mini";
        private int timeoutMs = 20000;

        public String getApiBase() { return apiBase; }
        public void setApiBase(String v) { this.apiBase = v; }
        public String getApiKey() { return apiKey; }
        public void setApiKey(String v) { this.apiKey = v; }
        public String getModel() { return model; }
        public void setModel(String v) { this.model = v; }
        public int getTimeoutMs() { return timeoutMs; }
        public void setTimeoutMs(int v) { this.timeoutMs = v; }
    }
}
