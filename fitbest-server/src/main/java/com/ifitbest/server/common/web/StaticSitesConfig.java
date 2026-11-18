package com.ifitbest.server.common.web;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * 统一静态站托管（阶段一核心）：
 *
 *  - 5 个 SPA 站点：/fitbest /fitbest-hd /fit-best /hyrox /btwe
 *      · index.html / sw.js / icons 等 → no-cache（保证发版即时生效，PWA autoUpdate 依赖此策略）
 *      · assets/**（Vite 带内容指纹的 js/css/字体）→ immutable 缓存一年
 *      · 未命中路由 → 回退各自 index.html（站点前缀隔离，互不串扰）
 *
 *  - 官网资源与模拟器：/fitbestwebsite /console → 静态文件缓存 7 天
 *    官网首页由 WebsiteController 渲染已发布的内容，使用独立的缓存策略。
 *
 * 资源根目录由 fitbest.web.root 配置（容器内默认 /opt/fitbest/web，宿主机挂载）。
 * 注意：/fit-best/api/ 由 Nginx 反代时优先匹配（^~），不会落入此处的 /fit-best/** 处理。
 */
@Configuration
public class StaticSitesConfig implements WebMvcConfigurer {

    /** SPA 站点：{URL 路径前缀, 资源目录名} */
    private static final String[][] SPA_SITES = {
        {"/fitbest", "fitbest"},
        {"/fitbest-hd", "fitbest-hd"},
        {"/fit-best", "fit-best"},
        {"/hyrox", "hyrox"},
        {"/btwe", "btwe"},
    };

    /** 无前端路由的静态资源，无需 fallback */
    private static final String[][] PLAIN_SITES = {
        {"/fitbestwebsite", "fitbestwebsite"},
        {"/console", "console"},
    };

    private final String webRoot;

    public StaticSitesConfig(@Value("${fitbest.web.root}") String webRoot) {
        // 统一为正斜杠：Windows 开发环境（如 D:\fitbest\web）下保证 file: URL 可解析
        this.webRoot = webRoot.replace('\\', '/');
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        for (String[] site : SPA_SITES) {
            String prefix = site[0];
            String location = "file:" + webRoot + "/" + site[1] + "/";

            // 带内容指纹的构建产物（Vite 默认输出在 assets/）：一年 immutable。
            // 注意：pattern /assets/** 匹配时 resourcePath 不含 assets/ 段，location 必须补上该子目录
            registry.addResourceHandler(prefix + "/assets/**")
                .addResourceLocations(location + "assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .resourceChain(true)
                .addResolver(new PathResourceResolver());

            // 站点其余资源（index.html / sw.js / manifest / icons 等）：协商缓存
            registry.addResourceHandler(prefix + "/**")
                .addResourceLocations(location)
                .setCacheControl(CacheControl.noCache())
                .resourceChain(true)
                .addResolver(new SpaResourceResolver());
        }

        for (String[] site : PLAIN_SITES) {
            registry.addResourceHandler(site[0] + "/**")
                .addResourceLocations("file:" + webRoot + "/" + site[1] + "/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(7)).cachePublic())
                .resourceChain(true)
                .addResolver(new PathResourceResolver());
        }
    }
}
