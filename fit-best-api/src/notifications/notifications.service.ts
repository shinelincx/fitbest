import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.module'

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = 20) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 50),
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } })
    if (!notification) throw new NotFoundException('通知不存在')
    if (!notification.readAt) {
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
    }
    return { ok: true }
  }
}
