import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { IdentityType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.module'
import { buildProfile, PROFILE_INCLUDE, maskEmail, maskPhone, maskWechat } from '../common/profile'
import { CodeService } from '../auth/code.service'
import { TokenService } from '../auth/token.service'
import { WechatService } from '../integrations/wechat.service'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: CodeService,
    private readonly tokens: TokenService,
    private readonly wechat: WechatService,
  ) {}

  private async loadUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: PROFILE_INCLUDE })
    if (!user || user.status !== 'active') throw new NotFoundException('账号不存在')
    return user
  }

  async getMe(userId: string) {
    return buildProfile(await this.loadUser(userId))
  }

  async updateMe(
    userId: string,
    data: {
      nickname?: string
      avatar?: string | null
      gender?: string | null
      birthYear?: number | null
      heightCm?: number | null
      weightKg?: number | null
    },
  ) {
    await this.loadUser(userId)
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: data.nickname,
        avatar: data.avatar,
        gender: data.gender,
        birthYear: data.birthYear,
        heightCm: data.heightCm,
        weightKg: data.weightKg,
      },
      include: PROFILE_INCLUDE,
    })
    return buildProfile(user)
  }

  async updateGoals(userId: string, data: { weeklySessions: number; weeklyMinutes: number }) {
    await this.loadUser(userId)
    await this.prisma.userGoal.upsert({
      where: { userId },
      update: { weeklySessions: data.weeklySessions, weeklyMinutes: data.weeklyMinutes },
      create: { userId, ...data },
    })
    return buildProfile(await this.loadUser(userId))
  }

  async listIdentities(userId: string) {
    const identities = await this.prisma.userIdentity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
    const mask = (type: IdentityType, identifier: string) =>
      type === 'phone' ? maskPhone(identifier) : type === 'email' ? maskEmail(identifier) : maskWechat(identifier)
    return identities.map((item) => ({
      type: item.type,
      identifier: mask(item.type, item.identifier),
      verifiedAt: item.verifiedAt,
      createdAt: item.createdAt,
    }))
  }

  private async assertIdentifierFree(type: IdentityType, identifier: string) {
    const existing = await this.prisma.userIdentity.findUnique({
      where: { type_identifier: { type, identifier } },
    })
    if (existing) throw new ConflictException(type === 'phone' ? '该手机号已被其他账号绑定' : '该账号已被其他用户绑定')
  }

  async bindPhone(userId: string, phone: string, code: string) {
    await this.codes.verify('sms', 'bind', phone, code)
    await this.assertIdentifierFree('phone', phone)
    try {
      await this.prisma.userIdentity.create({
        data: { userId, type: 'phone', identifier: phone, verifiedAt: new Date() },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该手机号已被其他账号绑定')
      throw error
    }
    return this.getMe(userId)
  }

  async bindEmail(userId: string, email: string, code: string) {
    await this.codes.verify('email', 'bind', email, code)
    await this.assertIdentifierFree('email', email)
    try {
      await this.prisma.userIdentity.create({
        data: { userId, type: 'email', identifier: email, verifiedAt: new Date() },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该邮箱已被其他用户绑定')
      throw error
    }
    return this.getMe(userId)
  }

  async bindWechat(userId: string, code: string, client: 'app' | 'web') {
    const identity = await this.wechat.exchange(code, client)
    const identifier = identity.unionid ?? identity.openid
    const existing = await this.prisma.userIdentity.findUnique({
      where: { type_identifier: { type: 'wechat', identifier } },
    })
    if (existing) {
      if (existing.userId === userId) return this.getMe(userId)
      throw new ConflictException('该微信已绑定其他账号')
    }
    try {
      await this.prisma.userIdentity.create({
        data: { userId, type: 'wechat', identifier, verifiedAt: new Date() },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该微信已绑定其他账号')
      throw error
    }
    return this.getMe(userId)
  }

  async unbind(userId: string, type: 'email' | 'wechat') {
    const total = await this.prisma.userIdentity.count({ where: { userId } })
    if (total <= 1) throw new BadRequestException('至少保留一种登录方式')
    const result = await this.prisma.userIdentity.deleteMany({ where: { userId, type } })
    if (result.count === 0) throw new BadRequestException('尚未绑定该账号')
    return this.getMe(userId)
  }

  async setPassword(userId: string, password: string, oldPassword?: string) {
    const credential = await this.prisma.userCredential.findUnique({ where: { userId } })
    if (credential) {
      if (!oldPassword) throw new BadRequestException('请填写原密码')
      const ok = await bcrypt.compare(oldPassword, credential.passwordHash)
      if (!ok) throw new BadRequestException('原密码不正确')
    }
    const passwordHash = await bcrypt.hash(password, 10)
    await this.prisma.userCredential.upsert({
      where: { userId },
      update: { passwordHash },
      create: { userId, passwordHash },
    })
    return { ok: true }
  }

  async deleteAccount(userId: string, password?: string) {
    const credential = await this.prisma.userCredential.findUnique({ where: { userId } })
    if (credential) {
      if (!password) throw new BadRequestException('请填写密码以确认注销')
      const ok = await bcrypt.compare(password, credential.passwordHash)
      if (!ok) throw new BadRequestException('密码不正确')
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'deleted', deletedAt: new Date() },
    })
    await this.tokens.revokeAll(userId)
    return { ok: true }
  }
}
