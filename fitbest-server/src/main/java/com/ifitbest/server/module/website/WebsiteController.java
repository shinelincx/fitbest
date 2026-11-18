package com.ifitbest.server.module.website;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import com.ifitbest.server.common.auth.AuthedAdmin;
import com.ifitbest.server.common.auth.CurrentAdmin;
import com.ifitbest.server.common.auth.JwtCodec.AdminPayload;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.DigestUtils;
import org.springframework.web.bind.annotation.*;

@RestController
public class WebsiteController {
    private static final String ADMIN = "/api/v1/admin/system/website";
    private final WebsiteService website;

    public WebsiteController(WebsiteService website) {
        this.website = website;
    }

    public record DraftInput(@Positive long revision, @NotNull @Valid WebsiteContent content) {}
    public record PublishInput(@Positive long revision, @Positive Long restoreVersion) {}

    @GetMapping(value = {"/fitbestwebsite/", "/fitbestwebsite/index.html"}, produces = "text/html;charset=UTF-8")
    public ResponseEntity<String> publicPage() {
        String html = website.publicPage();
        String etag = DigestUtils.md5DigestAsHex(html.getBytes(StandardCharsets.UTF_8));
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).eTag("\"" + etag + "\"").body(html);
    }

    @AuthedAdmin
    @GetMapping(ADMIN)
    public ResponseEntity<WebsiteService.State> state(@CurrentAdmin AdminPayload actor) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(website.state(actor));
    }

    @AuthedAdmin
    @PutMapping(ADMIN + "/draft")
    public ResponseEntity<WebsiteService.Draft> save(@CurrentAdmin AdminPayload actor, @Valid @RequestBody DraftInput input) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(website.save(actor, input.revision(), input.content()));
    }

    @AuthedAdmin
    @PostMapping(ADMIN + "/preview")
    public ResponseEntity<Map<String, String>> preview(@CurrentAdmin AdminPayload actor,
                                                       @Valid @RequestBody WebsiteContent content) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON)
            .body(Map.of("html", website.preview(actor, content)));
    }

    @AuthedAdmin
    @PostMapping(ADMIN + "/publications")
    public Map<String, Long> publish(@CurrentAdmin AdminPayload actor, @Valid @RequestBody PublishInput input) {
        return Map.of("version", website.publish(actor, input.revision(), input.restoreVersion()));
    }
}
