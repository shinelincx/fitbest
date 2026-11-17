import { Injectable, UnauthorizedException } from '@nestjs/common'
import { config } from '../config'
import { PrismaService } from '../prisma/prisma.module'
import { signAccess, signRefresh, verifyRefresh } from '../common/jwt'
import { parseDuration, sha256 } from '../common/tokens'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  private refreshTtlMs(): number {
    return parseDuration(config.jwt.refreshTtl, 30 * 86400000)
  }

  async issue(userId: string, device?: string, ip?: string): Promise<TokenPair> {
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        refreshHash: '',
        device,
        ip,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    })
    const refreshToken = signRefresh(userId, session.id)
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshHash: sha256(refreshToken) },
    })
    return { accessToken: signAccess(userId), refreshToken }
  }

  /** 刷新令牌并轮换 refresh token */
  async rotate(refreshToken: string): Promise<TokenPair> {
    let payload
    try {
      payload = verifyRefresh(refreshToken)
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录')
    }

    const session = await this.prisma.userSession.findUnique({ where: { id: payload.sid } })
    if (!session || session.userId !== payload.sub) throw new UnauthorizedException('登录已过期，请重新登录')
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
    if (session.refreshHash !== sha256(refreshToken)) throw new UnauthorizedException('登录凭证已失效，请重新登录')

    const nextRefresh = signRefresh(payload.sub, session.id)
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshHash: sha256(nextRefresh) },
    })
    return { accessToken: signAccess(payload.sub), refreshToken: nextRefresh }
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefresh(refreshToken)
      await this.prisma.userSession.updateMany({
        where: { id: payload.sid, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    } catch {
      // 令牌已失效时忽略
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
}
