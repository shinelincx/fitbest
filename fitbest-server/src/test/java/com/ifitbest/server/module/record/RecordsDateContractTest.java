package com.ifitbest.server.module.record;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.ifitbest.server.common.auth.CurrentUserArgumentResolver;
import com.ifitbest.server.common.auth.UserAuthInterceptor;
import com.ifitbest.server.common.error.GlobalExceptionHandler;
import com.ifitbest.server.config.JacksonConfig;

class RecordsDateContractTest {
    @ParameterizedTest
    @CsvSource({
        "hyrox,2026-11-17,2026-11-17T00:00:00",
        "btwe,2026-11-17,2026-11-17T00:00:00",
        "btwe,2026-11-17T08:10:30+08:00,2026-11-17T00:10:30"
    })
    void acceptsLegacyAndTimestampRecords(String app, String input, String expected) throws Exception {
        RecordsService records = mock(RecordsService.class);
        UUID userId = UUID.randomUUID();
        when(records.create(eq(userId), any())).thenReturn(Map.of("id", "record"));
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new JacksonConfig().fitbestJacksonCustomizer().customize(builder);
        var mvc = MockMvcBuilders.standaloneSetup(new RecordsController(records))
            .setCustomArgumentResolvers(new CurrentUserArgumentResolver())
            .setControllerAdvice(new GlobalExceptionHandler())
            .setMessageConverters(new MappingJackson2HttpMessageConverter(builder.build())).build();

        mvc.perform(post("/api/v1/me/training-records")
            .requestAttr(UserAuthInterceptor.ATTR_USER_ID, userId.toString())
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"clientId":"offline","app":"%s","totalTimeSec":270,"startedAt":"%s"}
                """.formatted(app, input)))
            .andExpect(status().isOk());

        var captured = ArgumentCaptor.forClass(RecordsService.CreateInput.class);
        verify(records).create(eq(userId), captured.capture());
        assertThat(captured.getValue().startedAt()).isEqualTo(LocalDateTime.parse(expected));
    }
}
