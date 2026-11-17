package com.ifitbest.server.common.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SiteRootControllerTest {
    @ParameterizedTest
    @ValueSource(strings = {"/fitbest", "/fitbest-hd", "/fit-best", "/hyrox", "/hyrox/HD", "/btwe", "/btwe/HD",
        "/console", "/fitbestwebsite"})
    void canonicalizesSiteRootsAndKeepsQueryString(String root) throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new SiteRootController()).build();
        mvc.perform(get(root + "?return=1"))
            .andExpect(status().isPermanentRedirect()).andExpect(header().string("Location", root + "/?return=1"));
        mvc.perform(get(root + "/")).andExpect(status().isOk()).andExpect(forwardedUrl(root + "/index.html"));
    }
}
