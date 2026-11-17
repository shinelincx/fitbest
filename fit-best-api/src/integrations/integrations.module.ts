import { Module } from '@nestjs/common'
import { EmailService } from './email.service'
import { SmsService } from './sms.service'
import { WechatService } from './wechat.service'

@Module({
  providers: [SmsService, EmailService, WechatService],
  exports: [SmsService, EmailService, WechatService],
})
export class IntegrationsModule {}
