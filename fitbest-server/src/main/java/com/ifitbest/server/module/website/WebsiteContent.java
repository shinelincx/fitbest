package com.ifitbest.server.module.website;

import java.net.URI;
import java.util.Set;

import com.ifitbest.server.common.error.BizException;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WebsiteContent(
    @NotBlank @Size(max = 160) String seoTitle,
    @NotBlank @Size(max = 320) String seoDescription,
    @NotBlank @Size(max = 80) String heroHeadline,
    @NotBlank @Size(max = 80) String heroEmphasis,
    @NotBlank @Size(max = 380) String heroDescription,
    @NotBlank @Size(max = 1000) String heroImage,
    @NotBlank @Size(max = 120) String heroImageAlt,
    @NotBlank @Size(max = 120) String productTitle,
    @NotBlank @Size(max = 120) String equipmentTitle,
    @NotBlank @Size(max = 380) String equipmentDescription,
    @NotBlank @Size(max = 120) String trainingTitle,
    @NotBlank @Size(max = 120) String treadmillTitle,
    @NotBlank @Size(max = 120) String hyroxTitle,
    @NotBlank @Size(max = 120) String btweTitle,
    @NotBlank @Size(max = 120) String downloadTitle,
    @NotBlank @Size(max = 380) String downloadDescription,
    @NotBlank @Size(max = 1000) String storeApple,
    @NotBlank @Size(max = 1000) String storeGoogle,
    @NotBlank @Size(max = 240) String webUrl,
    @NotBlank @Size(max = 240) String hdUrl,
    @NotBlank @Size(max = 240) String treadmillUrl,
    @NotBlank @Size(max = 240) String hyroxUrl,
    @NotBlank @Size(max = 240) String btweUrl,
    @NotBlank @Size(max = 254) @Email String supportEmail
) {
    private static final Set<String> TRAINING_PATHS = Set.of("/fitbest/", "/fitbest-hd/", "/hyrox/", "/hyrox/HD/",
        "/btwe/", "/btwe/HD/", "/fitbest/#/train/treadmill", "/fitbest/#/machines", "/fitbest/#/strength",
        "/fitbest/#/pin", "/hyrox/#/train", "/hyrox/#/plans", "/btwe/#/train", "/btwe/#/plans");

    public void validateLinks() {
        requireHttps(storeApple, Set.of("apps.apple.com"), "App Store 地址");
        requireHttps(storeGoogle, Set.of("play.google.com"), "Google Play 地址");
        requireHttps(heroImage, Set.of("images.unsplash.com", "cloud.thinkfiter.com"), "主图地址");
        for (String path : new String[]{webUrl, hdUrl, treadmillUrl, hyroxUrl, btweUrl}) {
            if (!TRAINING_PATHS.contains(path)) throw BizException.badRequest("请选择已支持的训练入口");
        }
        if (!supportEmail.matches("[A-Za-z0-9.!$*+_~-]+@[A-Za-z0-9.-]+")) {
            throw BizException.badRequest("请输入有效的联系邮箱");
        }
    }

    private static void requireHttps(String url, Set<String> hosts, String label) {
        try {
            var uri = URI.create(url);
            if ("https".equals(uri.getScheme()) && uri.getHost() != null && hosts.contains(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1 && uri.getPath().startsWith("/")
                && uri.getPath().length() > 1) return;
        } catch (IllegalArgumentException ignored) {
            // Invalid URLs use the same validation message below.
        }
        throw BizException.badRequest(label + "必须使用受支持域名的 HTTPS 链接");
    }
}
