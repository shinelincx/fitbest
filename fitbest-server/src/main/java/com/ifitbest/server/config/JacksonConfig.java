package com.ifitbest.server.config;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;

/**
 * Jackson 兼容层 —— 与 NestJS(JSON.stringify(Date)) 契约对齐：
 *  - LocalDateTime（实体内统一存 UTC 墙钟）序列化始终输出 ISO + 毫秒 + "Z"，
 *    与 JS Date.toISOString() 完全一致（例：2026-11-16T08:30:00.000Z）
 *  - 反序列化接受带/不带 Z、带时区偏移的 ISO 字符串，统一折算为 UTC
 */
@Configuration
public class JacksonConfig {

    private static final DateTimeFormatter ISO_MS =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer fitbestJacksonCustomizer() {
        return builder -> {
            builder.postConfigurer(mapper -> {
                mapper.disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
            });
            builder.modules(new LocalDateTimeModule());
        };
    }

    /**
     * JSON 响应带 charset=utf-8 —— 与 Express res.json 行为对齐：
     * Spring 默认输出 application/json（无 charset），旧式 HTTP 客户端（如 PowerShell 5.1）
     * 会按 ISO-8859-1 解码导致中文乱码。注意：在原有支持类型基础上【前置追加】，
     * 不能替换（actuator 使用 application/vnd.spring-boot.actuator.v3+json）。
     */
    @Bean
    public org.springframework.web.servlet.config.annotation.WebMvcConfigurer jsonCharsetConfigurer() {
        return new org.springframework.web.servlet.config.annotation.WebMvcConfigurer() {
            @Override
            public void extendMessageConverters(java.util.List<org.springframework.http.converter.HttpMessageConverter<?>> converters) {
                converters.stream()
                    .filter(c -> c instanceof org.springframework.http.converter.json.MappingJackson2HttpMessageConverter)
                    .map(c -> (org.springframework.http.converter.json.MappingJackson2HttpMessageConverter) c)
                    .forEach(c -> {
                        java.util.List<org.springframework.http.MediaType> types =
                            new java.util.ArrayList<>(c.getSupportedMediaTypes());
                        types.add(0, org.springframework.http.MediaType.parseMediaType("application/json;charset=UTF-8"));
                        c.setSupportedMediaTypes(types);
                    });
            }
        };
    }

    public static String formatIsoMs(LocalDateTime utcDateTime) {
        return utcDateTime == null ? null : utcDateTime.format(ISO_MS);
    }

    /** 解析 ISO 时间字符串（兼容带 Z / 带偏移 / 纯本地格式），统一折算 UTC */
    public static LocalDateTime parseIso(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        try {
            if (v.endsWith("Z") || v.endsWith("z")) {
                return Instant.parse(v).atZone(ZoneOffset.UTC).toLocalDateTime();
            }
            if (v.indexOf('+') > 0 || v.substring(Math.max(0, v.length() - 6)).startsWith("-")) {
                return OffsetDateTime.parse(v).atZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
            }
            return LocalDateTime.parse(v);
        } catch (Exception e) {
            throw new IllegalArgumentException("时间格式不正确: " + value, e);
        }
    }

    @SuppressWarnings("serial")
    public static class LocalDateTimeModule extends SimpleModule {
        public LocalDateTimeModule() {
            addSerializer(LocalDateTime.class, new StdSerializer<>(LocalDateTime.class) {
                @Override
                public void serialize(LocalDateTime value, com.fasterxml.jackson.core.JsonGenerator gen,
                                      com.fasterxml.jackson.databind.SerializerProvider provider)
                        throws java.io.IOException {
                    gen.writeString(formatIsoMs(value));
                }
            });
            addDeserializer(LocalDateTime.class, new StdDeserializer<>(LocalDateTime.class) {
                @Override
                public LocalDateTime deserialize(com.fasterxml.jackson.core.JsonParser p,
                                                com.fasterxml.jackson.databind.DeserializationContext ctxt)
                        throws java.io.IOException {
                    String text = p.getValueAsString();
                    if (text == null || text.isBlank()) {
                        return null;
                    }
                    try {
                        return parseIso(text);
                    } catch (Exception e) {
                        throw new IllegalArgumentException("时间格式不正确");
                    }
                }
            });
        }
    }
}
