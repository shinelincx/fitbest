package com.ifitbest.server.common.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 站点根路径使用尾斜杠，使浏览器按站点目录解析相对资源和 PWA 作用域。
 */
@Controller
public class SiteRootController {

    @GetMapping({
        "/fitbest", "/fitbest/",
        "/fitbest-hd", "/fitbest-hd/",
        "/fit-best", "/fit-best/",
        "/hyrox", "/hyrox/",
        "/hyrox/HD", "/hyrox/HD/",
        "/btwe", "/btwe/",
        "/btwe/HD", "/btwe/HD/",
        "/fitbestwebsite",
        "/console", "/console/",
    })
    public String root(HttpServletRequest request, HttpServletResponse response) {
        String path = request.getRequestURI();
        if (!path.endsWith("/")) {
            String query = request.getQueryString();
            response.setStatus(HttpStatus.PERMANENT_REDIRECT.value());
            response.setHeader("Location", path + "/" + (query == null ? "" : "?" + query));
            return null;
        }
        return "forward:" + path.substring(request.getContextPath().length()) + "index.html";
    }
}
