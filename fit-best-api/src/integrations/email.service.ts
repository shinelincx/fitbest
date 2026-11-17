import { Injectable } from '@nestjs/common'
import { config } from '../config'
import { aliyunRpc } from './aliyun-rpc'

@Injectable()
export class EmailService {
  async sendCode(email: string, code: string): Promise<{ providerMsgId: string; dev: boolean }> {
    const html = [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',sans-serif;padding:24px">',
      '<h2 style="margin:0 0 12px">FITBEST 验证码</h2>',
      `<p>你的验证码是 <strong style="font-size:24px;letter-spacing:2px">${code}</strong></p>`,
      '<p style="color:#666">5 分钟内有效，请勿泄露给他人。</p>',
      '</div>',
    ].join('')

    if (!config.aliyun.accessKeyId || !config.aliyun.dmAccount) {
      console.log(`[email:dev] ${email} code=${code}`)
      return { providerMsgId: `dev-${Date.now()}`, dev: true }
    }

    const data = await aliyunRpc('dm.aliyuncs.com', 'SingleSendMail', '2015-11-23', {
      AccountName: config.aliyun.dmAccount,
      AddressType: '1',
      ReplyToAddress: 'false',
      ToAddress: email,
      Subject: 'FITBEST 登录验证码',
      HtmlBody: html,
    })

    return { providerMsgId: data.RequestId ?? '', dev: false }
  }
}
