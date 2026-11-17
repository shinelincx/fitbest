import { Injectable } from '@nestjs/common'
import { config } from '../config'
import { aliyunRpc } from './aliyun-rpc'

@Injectable()
export class SmsService {
  async sendCode(phone: string, code: string, scene: 'login' | 'bind'): Promise<{ providerMsgId: string; dev: boolean }> {
    const template = scene === 'bind' ? config.aliyun.smsTemplateBind : config.aliyun.smsTemplateLogin

    if (!config.aliyun.accessKeyId || !template) {
      console.log(`[sms:dev] ${phone} scene=${scene} code=${code}`)
      return { providerMsgId: `dev-${Date.now()}`, dev: true }
    }

    const data = await aliyunRpc('dysmsapi.aliyuncs.com', 'SendSms', '2017-05-25', {
      PhoneNumbers: phone,
      SignName: config.aliyun.smsSignName,
      TemplateCode: template,
      TemplateParam: JSON.stringify({ code }),
    })

    return { providerMsgId: data.RequestId ?? '', dev: false }
  }
}
