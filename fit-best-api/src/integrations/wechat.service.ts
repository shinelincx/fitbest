import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { config, isProd } from '../config'

export interface WechatIdentity {
  openid: string
  unionid?: string
  nickname?: string
}

@Injectable()
export class WechatService {
  async exchange(code: string, client: 'app' | 'web'): Promise<WechatIdentity> {
    const appId = client === 'web' ? config.wechat.webAppId : config.wechat.appId
    const secret = client === 'web' ? config.wechat.webAppSecret : config.wechat.appSecret

    if (!appId || !secret) {
      if (isProd) throw new Error('微信登录未配置')
      const devId = createHash('sha256').update(code).digest('hex').slice(0, 20)
      return { openid: `dev_${devId}`, unionid: `devu_${devId}` }
    }

    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', secret)
    url.searchParams.set('code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    const res = await fetch(url)
    const data = (await res.json()) as {
      openid?: string
      unionid?: string
      access_token?: string
      errcode?: number
      errmsg?: string
    }
    if (!data.openid) throw new Error(data.errmsg || '微信授权失败')

    let nickname: string | undefined
    if (data.access_token) {
      try {
        const infoRes = await fetch(
          `https://api.weixin.qq.com/sns/userinfo?access_token=${data.access_token}&openid=${data.openid}`,
        )
        const info = (await infoRes.json()) as { nickname?: string }
        nickname = info.nickname
      } catch {
        nickname = undefined
      }
    }

    return { openid: data.openid, unionid: data.unionid, nickname }
  }
}
