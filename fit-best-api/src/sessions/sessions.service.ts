import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import type { MachineType, SessionSource } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.module'
import { monthStartShanghai, shanghaiDateKey, weekStartShanghai, currentWeekDays } from '../common/time'

interface CreateSessionInput {
  machineId?: string
  gymId?: string
  machineType: MachineType
  machineModel?: string
  mode?: string
  durationSec: number
  distanceM: number
  calories: number
  avgHr?: number
  avgSpeed?: number
  cadence?: number
  power?: number
  source?: SessionSource
  startedAt?: Date
  endedAt?: Date
}

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(session: {
    id: string
    userId: string
    gymId: string | null
    machineId: string | null
    machineType: MachineType
    machineModel: string | null
    mode: string
    durationSec: number
    distanceM: number
    calories: number
    avgHr: number | null
    avgSpeed: unknown
    cadence: number | null
    power: number | null
    source: SessionSource
    startedAt: Date
    endedAt: Date | null
    createdAt: Date
  }) {
    return {
      id: session.id,
      userId: session.userId,
      gymId: session.gymId,
      machineId: session.machineId,
      machineType: session.machineType,
      machineModel: session.machineModel,
      mode: session.mode,
      durationSec: session.durationSec,
      distanceM: session.distanceM,
      calories: session.calories,
      avgHr: session.avgHr,
      avgSpeed: session.avgSpeed == null ? null : Number(session.avgSpeed),
      cadence: session.cadence,
      power: session.power,
      source: session.source,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      createdAt: session.createdAt,
    }
  }

  async create(userId: string, idempotencyKey: string | undefined, input: CreateSessionInput) {
    if (idempotencyKey) {
      const existing = await this.prisma.session.findUnique({ where: { idempotencyKey } })
      if (existing) {
        if (existing.userId !== userId) throw new ConflictException('幂等键冲突')
        return this.serialize(existing)
      }
    }

    let gymId = input.gymId
    let machineType = input.machineType
    let machineModel = input.machineModel

    if (input.machineId) {
      const machine = await this.prisma.machine.findUnique({
        where: { id: input.machineId },
        include: { model: true },
      })
      if (!machine) throw new BadRequestException('器械不存在')
      gymId = machine.gymId
      machineType = machine.model.type
      machineModel = machine.model.model
    }

    try {
      const session = await this.prisma.session.create({
        data: {
          userId,
          gymId,
          machineId: input.machineId,
          machineType,
          machineModel,
          mode: input.mode ?? 'free',
          durationSec: input.durationSec,
          distanceM: input.distanceM,
          calories: input.calories,
          avgHr: input.avgHr,
          avgSpeed: input.avgSpeed,
          cadence: input.cadence,
          power: input.power,
          source: input.source ?? 'ble',
          startedAt: input.startedAt ?? new Date(),
          endedAt: input.endedAt,
          idempotencyKey,
        },
      })
      return this.serialize(session)
    } catch (error) {
      if (idempotencyKey && (error as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.session.findUnique({ where: { idempotencyKey } })
        if (existing && existing.userId === userId) return this.serialize(existing)
      }
      throw error
    }
  }

  async list(userId: string, range: 'week' | 'month' | 'all', cursor?: string, limit = 20) {
    const startedAt: { gte?: Date; lt?: Date } = {}
    if (range === 'week') startedAt.gte = weekStartShanghai()
    if (range === 'month') startedAt.gte = monthStartShanghai()
    if (cursor) startedAt.lt = new Date(cursor)

    const sessions = await this.prisma.session.findMany({
      where: { userId, ...(Object.keys(startedAt).length ? { startedAt } : {}) },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const hasMore = sessions.length > limit
    const items = sessions.slice(0, limit).map((item) => this.serialize(item))
    return {
      items,
      nextCursor: hasMore ? sessions[limit].startedAt.toISOString() : null,
    }
  }

  async weeklyStats(userId: string) {
    const weekStart = weekStartShanghai()
    const sessions = await this.prisma.session.findMany({
      where: { userId, startedAt: { gte: weekStart } },
      select: {
        machineType: true,
        durationSec: true,
        calories: true,
        distanceM: true,
        startedAt: true,
      },
    })

    const totals = { sessions: sessions.length, minutes: 0, calories: 0, distanceM: 0 }
    const byType = new Map<MachineType, { type: MachineType; sessions: number; minutes: number; calories: number; distanceM: number }>()
    const dailyCount = new Map<string, number>()

    let totalSec = 0
    for (const session of sessions) {
      totalSec += session.durationSec
      totals.calories += session.calories
      totals.distanceM += session.distanceM

      const current = byType.get(session.machineType) ?? {
        type: session.machineType,
        sessions: 0,
        minutes: 0,
        calories: 0,
        distanceM: 0,
      }
      current.sessions += 1
      current.minutes += session.durationSec
      current.calories += session.calories
      current.distanceM += session.distanceM
      byType.set(session.machineType, current)

      const key = shanghaiDateKey(session.startedAt)
      dailyCount.set(key, (dailyCount.get(key) ?? 0) + 1)
    }

    totals.minutes = Math.round(totalSec / 60)
    const byTypeList = Array.from(byType.values()).map((item) => ({
      ...item,
      minutes: Math.round(item.minutes / 60),
    }))
    const daily = currentWeekDays().map((date) => ({ date, sessions: dailyCount.get(date) ?? 0 }))

    return { weekStart: weekStart.toISOString(), totals, byType: byTypeList, daily }
  }
}
