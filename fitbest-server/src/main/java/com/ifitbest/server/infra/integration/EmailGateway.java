package com.ifitbest.server.infra.integration;

import java.util.Date;
import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import com.ifitbest.server.common.error.BizException;
import com.ifitbest.server.config.FitbestProperties;

import jakarta.mail.internet.MimeMessage;

/**
 * 验证码邮件 —— 通用 SMTP 实现（腾讯企业邮 / QQ / 网易 / 自建等），
 * 未配置 SMTP 时 dev 模式（与原阿里云 DirectMail 版行为一致）。
 */
@Service
public class EmailGateway {

    private static final Logger log = LoggerFactory.getLogger(EmailGateway.class);

    public record SendResult(String providerMsgId, boolean dev) {
    }

    private final FitbestProperties props;

    public EmailGateway(FitbestProperties props) {
        this.props = props;
    }

    public SendResult sendCode(String email, String code) {
        FitbestProperties.Mail mail = props.getMail();
        if (mail.getHost().isBlank() || mail.getUsername().isBlank() || mail.getPassword().isBlank()) {
            if (props.isProd()) throw BizException.badRequest("邮件服务尚未配置，请使用其他登录方式");
            log.info("[email:dev] {} code={}", email, code);
            return new SendResult("dev-" + System.currentTimeMillis(), true);
        }

        String html = "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;padding:24px\">"
            + "<h2 style=\"margin:0 0 12px\">FITBEST 验证码</h2>"
            + "<p>你的验证码是 <strong style=\"font-size:24px;letter-spacing:2px\">" + code + "</strong></p>"
            + "<p style=\"color:#666\">5 分钟内有效，请勿泄露给他人。</p>"
            + "</div>";

        try {
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setHost(mail.getHost());
            sender.setPort(mail.getPort());
            sender.setUsername(mail.getUsername());
            sender.setPassword(mail.getPassword());
            sender.setDefaultEncoding("UTF-8");

            Properties javaMailProps = new Properties();
            javaMailProps.put("mail.smtp.auth", "true");
            javaMailProps.put("mail.smtp.connectiontimeout", "10000");
            javaMailProps.put("mail.smtp.timeout", "10000");
            javaMailProps.put("mail.smtp.writetimeout", "10000");
            if (mail.isSsl()) {
                // 465 隐式 SSL
                javaMailProps.put("mail.smtp.ssl.enable", "true");
            } else {
                // 587 显式 STARTTLS
                javaMailProps.put("mail.smtp.starttls.enable", "true");
            }
            sender.setJavaMailProperties(javaMailProps);

            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setFrom(fromAddress(mail), mail.getFromName());
            helper.setTo(email);
            helper.setSubject("FITBEST 登录验证码");
            helper.setText(html, true);
            sender.send(message);

            String messageId = message.getMessageID() != null ? message.getMessageID() : String.valueOf(new Date().getTime());
            return new SendResult(messageId, false);
        } catch (Exception e) {
            throw new IllegalStateException("邮件发送失败：" + e.getMessage(), e);
        }
    }

    /**
     * 发件地址：MAIL_FROM 留空用 SMTP 账号；
     * 若误填了 "名称 <addr>" 显示名格式，则提取尖括号内的纯地址（显示名始终由 fromName 承担）
     */
    private String fromAddress(FitbestProperties.Mail mail) {
        String raw = mail.getFrom().isBlank() ? mail.getUsername() : mail.getFrom();
        int lt = raw.lastIndexOf('<');
        int gt = raw.lastIndexOf('>');
        if (lt >= 0 && gt > lt) {
            return raw.substring(lt + 1, gt).trim();
        }
        return raw.trim();
    }
}
