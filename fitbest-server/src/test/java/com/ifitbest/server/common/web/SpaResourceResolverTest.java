package com.ifitbest.server.common.web;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SPA 回退解析逻辑验证：站点根 / 前端路由 / 真实资源 / 缺失文件 四种场景
 */
class SpaResourceResolverTest {

    @TempDir
    Path siteRoot;

    private final SpaResourceResolver resolver = new SpaResourceResolver();
    private Resource location;

    @BeforeEach
    void setUp() throws Exception {
        // 与生产一致：file: URL location（StaticSitesConfig 的 addResourceLocations("file:...")）
        String base = siteRoot.toUri().toString();
        location = new UrlResource(base.endsWith("/") ? base : base + "/");
        Files.writeString(siteRoot.resolve("index.html"), "<html>fitbest</html>");
        Files.createDirectories(siteRoot.resolve("assets"));
        Files.writeString(siteRoot.resolve("assets/app.abc123.js"), "console.log(1)");
    }

    @Test
    void siteRootReturnsIndexHtml() throws Exception {
        Resource resource = resolver.getResource("", location);
        assertThat(resource).isNotNull();
        assertThat(resource.getFilename()).isEqualTo("index.html");
    }

    @Test
    void unmatchedRouteFallsBackToIndexHtml() throws Exception {
        // 前端路由（如 /fitbest/records）未命中文件时应回退首页
        assertThat(resolver.getResource("records", location)).isNotNull();
        assertThat(resolver.getResource("records", location).getFilename()).isEqualTo("index.html");

        // 深层路由同样回退
        assertThat(resolver.getResource("profile/settings", location)).isNotNull();
    }

    @Test
    void existingAssetIsServedDirectly() throws Exception {
        Resource resource = resolver.getResource("assets/app.abc123.js", location);
        assertThat(resource).isNotNull();
        assertThat(resource.getFilename()).isEqualTo("app.abc123.js");
    }

    @Test
    void missingFileWithExtensionStays404() throws Exception {
        // 带扩展名的缺失文件不回退，保持 404（避免掩盖坏链接）
        assertThat(resolver.getResource("missing.png", location)).isNull();
    }
}
