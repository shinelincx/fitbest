import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import type { IdentityType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { config } from '../config'
import { PrismaService } from '../prisma/prisma.module'
import { RedisService } from '../redis/redis.module'
import { EmailService } from '../integrations/email.service'
import { SmsService } from '../integrations/sms.service'
import { WechatService } from '../integrations/wechat.service'
import { buildProfile, PROFILE_INCLUDE, type UserWithProfile } from '../common/profile'
import { CodeService, type CodeScene } from './code.service'
import { TokenService, type TokenPair } from './token.service'

const BIND_TTL = 600

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly codes: CodeService,
    private readonly tokens: TokenService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly wechat: WechatService,
  ) {}

  /** dev 短信/邮件未真实发送时，是否允许把验证码回传给客户端（生产仅白名单号码） */
  private devCodeVisible(target: string): boolean {
    if (config.auth.devReturnCode) return true
    return config.auth.devPhoneAllowlist.includes(target)
  }

  private async logMessage(
    channel: 'sms' | 'email',
    target: string,
    scene: string,
    template: string | undefined,
    result: { providerMsgId: string; dev: boolean } | { error: string },
  ) {
    await this.prisma.messageLog
      .create({
        data: {
          channel,
          target,
          scene,
          template,
          providerMsgId: 'providerMsgId' in result ? result.providerMsgId : null,
          status: 'error' in result ? 'failed' : result.dev ? 'dev' : 'sent',
          error: 'error' in result ? result.error : null,
        },
      })
      .catch(() => undefined)
  }

  async sendSms(phone: string, scene: CodeScene) {
    const code = await this.codes.issue('sms', scene, phone)
    const template = scene === 'bind' ? config.aliyun.smsTemplateBind : config.aliyun.smsTemplateLogin
    try {
      const result = await this.sms.sendCode(phone, code, scene)
      await this.logMessage('sms', phone, scene, template, result)
      // 短信服务未配置时不会真实下发，明确告知而不是假装已发送
      if (result.dev && !this.devCodeVisible(phone)) {
        throw new BadRequestException('短信服务尚未配置，当前仅支持测试号码登录')
      }
      return {
        sent: true,
        cooldown: config.auth.cooldown,
        ...(result.dev && this.devCodeVisible(phone) ? { devCode: code } : {}),
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      const message = error instanceof Error ? error.message : '短信发送失败'
      await this.logMessage('sms', phone, scene, template, { error: message })
      throw new BadRequestException('短信发送失败，请稍后重试')
    }
  }

  async sendEmail(email: string, scene: CodeScene) {
    const code = await this.codes.issue('email', scene, email)
    try {
      const result = await this.email.sendCode(email, code)
      await this.logMessage('email', email, scene, 'FITBEST_LOGIN_CODE', result)
      return {
        sent: true,
        cooldown: config.auth.cooldown,
        ...(result.dev && this.devCodeVisible(email) ? { devCode: code } : {}),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '邮件发送失败'
      await this.logMessage('email', email, scene, 'FITBEST_LOGIN_CODE', { error: message })
      throw new BadRequestException('邮件发送失败，请稍后重试')
    }
  }

  private async findUser(type: IdentityType, identifier: string): Promise<UserWithProfile | null> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { type_identifier: { type, identifier } },
      include: { user: { include: PROFILE_INCLUDE } },
    })
    if (!identity) return null
    if (identity.user.status !== 'active') throw new UnauthorizedException('该账号已注销')
    return identity.user
  }

  private async ensureUser(type: IdentityType, identifier: string, nickname: string): Promise<UserWithProfile> {
    const found = await this.findUser(type, identifier)
    if (found) return found
    try {
      return await this.prisma.user.create({
        data: {
          nickname,
          identities: { create: { type, identifier, verifiedAt: new Date() } },
          goal: { create: {} },
        },
        include: PROFILE_INCLUDE,
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const user = await this.findUser(type, identifier)
        if (user) return user
      }
      throw error
    }
  }

  private async finishLogin(userId: string, device?: string, ip?: string) {
    const [tokens, user] = await Promise.all([
      this.tokens.issue(userId, device, ip),
      this.prisma.user.findUnique({ where: { id: userId }, include: PROFILE_INCLUDE }),
    ])
    if (!user) throw new UnauthorizedException('账号不存在')
    return { ...tokens, user: buildProfile(user) }
  }

  async loginWithSms(phone: string, code: string, device?: string, ip?: string) {
    await this.codes.verify('sms', 'login', phone, code)
    const user = await this.ensureUser('phone', phone, `训练者${phone.slice(-4)}`)
    return this.finishLogin(user.id, device, ip)
  }

  async loginWithEmail(email: string, code: string, device?: string, ip?: string) {
    await this.codes.verify('email', 'login', email, code)
    const user = await this.ensureUser('email', email, email.split('@')[0] || '训练者')
    return this.finishLogin(user.id, device, ip)
  }

  async loginWithPassword(account: string, password: string, device?: string, ip?: string) {
    const type: IdentityType = account.includes('@') ? 'email' : 'phone'
    const user = await this.findUser(type, account)
    if (!user) throw new UnauthorizedException('账号或密码错误')
    if (!user.credential) throw new BadRequestException('该账号未设置密码，请使用验证码登录')
    const ok = await bcrypt.compare(password, user.credential.passwordHash)
    if (!ok) throw new UnauthorizedException('账号或密码错误')
    return this.finishLogin(user.id, device, ip)
  }

  async register(input: {
    phone?: string
    email?: string
    code: string
    password: string
    device?: string
    ip?: string
  }) {
    const type: IdentityType = input.phone ? 'phone' : 'email'
    const identifier = input.phone ?? input.email ?? ''
    if (!identifier) throw new BadRequestException('请填写手机号或邮箱')

    await this.codes.verify(type === 'phone' ? 'sms' : 'email', 'login', identifier, input.code)
    if (await this.findUser(type, identifier)) throw new ConflictException('该账号已注册，请直接登录')

    const nickname = type === 'phone' ? `训练者${identifier.slice(-4)}` : identifier.split('@')[0] || '训练者'
    const passwordHash = await bcrypt.hash(input.password, 10)
    try {
      const user = await this.prisma.user.create({
        data: {
          nickname,
          identities: { create: { type, identifier, verifiedAt: new Date() } },
          credential: { create: { passwordHash } },
          goal: { create: {} },
        },
      })
      return this.finishLogin(user.id, input.device, input.ip)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('该账号已注册，请直接登录')
      }
      throw error
    }
  }

  async loginWithWechat(code: string, client: 'app' | 'web', device?: string, ip?: string) {
    const identity = await this.wechat.exchange(code, client)
    const identifier = identity.unionid ?? identity.openid
    const user = await this.findUser('wechat', identifier)
    if (user) return this.finishLogin(user.id, device, ip)

    const bindTicket = randomBytes(24).toString('hex')
    await this.redis.client.set(
      `wx:bind:${bindTicket}`,
      JSON.stringify({ identifier, nickname: identity.nickname }),
      'EX',
      BIND_TTL,
    )
    return { needBindPhone: true, bindTicket }
  }

  async bindWechatPhone(input: {
    bindTicket: string
    phone: string
    code: string
    device?: string
    ip?: string
  }) {
    await this.codes.verify('sms', 'bind', input.phone, input.code)
    const raw = await this.redis.client.get(`wx:bind:${input.bindTicket}`)
    if (!raw) throw new BadRequestException('绑定已过期，请重新授权微信登录')
    const ticket = JSON.parse(raw) as { identifier: string; nickname?: string }

    const existingWechat = await this.findUser('wechat', ticket.identifier)
    if (existingWechat) {
      await this.redis.client.del(`wx:bind:${input.bindTicket}`)
      return this.finishLogin(existingWechat.id, input.device, input.ip)
    }

    const phoneUser = await this.findUser('phone', input.phone)
    if (phoneUser) {
      if (phoneUser.identities.some((item) => item.type === 'wechat')) {
        throw new ConflictException('该手机号已绑定其他微信账号')
      }
      try {
        await this.prisma.userIdentity.create({
          data: { userId: phoneUser.id, type: 'wechat', identifier: ticket.identifier, verifiedAt: new Date() },
        })
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException('该微信已绑定其他账号')
        }
        throw error
      }
      await this.redis.client.del(`wx:bind:${input.bindTicket}`)
      return this.finishLogin(phoneUser.id, input.device, input.ip)
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          nickname: ticket.nickname?.trim() || `训练者${input.phone.slice(-4)}`,
          identities: {
            create: [
              { type: 'phone', identifier: input.phone, verifiedAt: new Date() },
              { type: 'wechat', identifier: ticket.identifier, verifiedAt: new Date() },
            ],
          },
          goal: { create: {} },
        },
      })
      await this.redis.client.del(`wx:bind:${input.bindTicket}`)
      return this.finishLogin(user.id, input.device, input.ip)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('该账号已被绑定，请重新登录')
      }
      throw error
    }
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken)
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.tokens.revokeByToken(refreshToken)
      return
    }
    await this.tokens.revokeAll(userId)
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: PROFILE_INCLUDE })
    if (!user) throw new UnauthorizedException('账号不存在')
    if (user.status !== 'active') throw new UnauthorizedException('该账号已注销')
    return buildProfile(user)
  }
}
