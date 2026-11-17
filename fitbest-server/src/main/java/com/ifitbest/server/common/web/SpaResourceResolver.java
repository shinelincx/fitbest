package com.ifitbest.server.common.web;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.lang.Nullable;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * SPA 资源解析：
 *   - 命中真实文件 → 直接返回
 *   - 目录请求 / 未命中的前端路由（无扩展名）→ 从请求路径所在目录【逐级向上】查找 index.html，
 *     支持嵌套子目录部署（如 /fit-best/saas/、/btwe/HD/ 各自有独立 SPA 入口），最后回退站点根
 *   - 未命中但带扩展名（如缺失的图片）→ 返回 null 保持 404，不掩盖坏链接
 */
public class SpaResourceResolver extends PathResourceResolver {

    @Override
    @Nullable
    protected Resource getResource(String resourcePath, Resource location) throws IOException {
        Resource requested = location.createRelative(resourcePath);
        if (isRegularFile(requested)) {
            return requested;
        }
        if (!resourcePath.contains(".")) {
            String dir = resourcePath.endsWith("/") ? resourcePath : resourcePath + "/";
            while (true) {
                Resource index = location.createRelative(dir + "index.html");
                if (isRegularFile(index)) {
                    return index;
                }
                if (dir.isEmpty()) {
                    break;
                }
                int slash = dir.lastIndexOf('/', dir.length() - 2);
                dir = slash >= 0 ? dir.substring(0, slash + 1) : "";
            }
        }
        return null;
    }

    /** 仅接受真实存在的普通文件（目录、不存在路径均不算命中） */
    private boolean isRegularFile(Resource resource) {
        try {
            return resource.exists() && resource.isReadable() && resource.getFile().isFile();
        } catch (IOException | UnsupportedOperationException e) {
            return false;
        }
    }
}
