import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.module'

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(userId?: string) {
    const events = await this.prisma.eventLink.findMany({
      where: { status: 'published' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
    if (!userId) return events.map((e) => ({ ...e, registered: false }))

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { userId, eventId: { in: events.map((e) => e.id) } },
      select: { eventId: true },
    })
    const registeredSet = new Set(registrations.map((r) => r.eventId))
    return events.map((e) => ({ ...e, registered: registeredSet.has(e.id) }))
  }

  async register(userId: string, eventId: string) {
    const event = await this.prisma.eventLink.findUnique({ where: { id: eventId } })
    if (!event) throw new NotFoundException('赛事不存在')
    if (event.status !== 'published') throw new ConflictException('该赛事暂未开放报名')

    try {
      const registration = await this.prisma.eventRegistration.create({
        data: { userId, eventId },
      })
      return { id: registration.id, eventId, registered: true }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return { eventId, registered: true }
      }
      throw error
    }
  }

  async unregister(userId: string, eventId: string) {
    await this.prisma.eventRegistration.deleteMany({ where: { userId, eventId } })
    return { eventId, registered: false }
  }

  async myRegistrations(userId: string) {
    const rows = await this.prisma.eventRegistration.findMany({
      where: { userId },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      status: r.status,
      createdAt: r.createdAt,
      event: r.event,
    }))
  }
}
