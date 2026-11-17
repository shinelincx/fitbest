import { Injectable, UnauthorizedException } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.module'
import { signAdmin, type AdminPayload } from '../common/jwt'

@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(admin: {
    id: string
    name: string
    phone: string
    role: AdminPayload['role']
    orgId: string
    gymId: string | null
    org?: { name: string } | null
    gym?: { name: string } | null
  }) {
    return {
      id: admin.id,
      name: admin.name,
      phone: admin.phone,
      role: admin.role,
      orgId: admin.orgId,
      orgName: admin.org?.name ?? null,
      gymId: admin.gymId,
      gymName: admin.gym?.name ?? null,
    }
  }

  async login(phone: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { phone },
      include: { org: { select: { name: true } }, gym: { select: { name: true } } },
    })
    if (!admin || admin.status !== 'active') throw new UnauthorizedException('账号或密码错误')

    const ok = await bcrypt.compare(password, admin.passwordHash)
    if (!ok) throw new UnauthorizedException('账号或密码错误')

    const token = signAdmin({ aid: admin.id, role: admin.role, orgId: admin.orgId, gymId: admin.gymId })
    return { token, admin: this.serialize(admin) }
  }

  async me(payload: AdminPayload) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.aid },
      include: { org: { select: { name: true } }, gym: { select: { name: true } } },
    })
    if (!admin || admin.status !== 'active') throw new UnauthorizedException('后台登录已过期')
    return this.serialize(admin)
  }
}
