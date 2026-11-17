import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.module'

interface CreateRecordInput {
  clientId?: string
  app: 'hyrox' | 'btwe'
  planId?: string
  completed: boolean
  totalTimeSec: number
  distanceM: number
  moduleTimes?: number[]
  runSplits?: number[]
  avgHr?: number
  maxHr?: number
  rpe?: number
  weakestStation?: string
  startedAt?: string
}

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateRecordInput) {
    const parsedStart = input.startedAt ? new Date(input.startedAt) : undefined
    const startedAt = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : undefined

    // clientId 用作幂等键：重复上传同一客户端记录不会产生重复行
    if (input.clientId) {
      const existing = await this.prisma.trainingRecord.findFirst({
        where: { userId, app: input.app, clientKey: input.clientId },
      })
      if (existing) return existing
    }

    return this.prisma.trainingRecord.create({
      data: {
        userId,
        app: input.app,
        clientKey: input.clientId,
        planId: input.planId,
        completed: input.completed,
        totalTimeSec: input.totalTimeSec,
        distanceM: input.distanceM,
        moduleTimes: input.moduleTimes,
        runSplits: input.runSplits,
        avgHr: input.avgHr,
        maxHr: input.maxHr,
        rpe: input.rpe,
        weakestStation: input.weakestStation,
        startedAt,
      },
    })
  }

  async list(userId: string, app?: string, limit = 50) {
    return this.prisma.trainingRecord.findMany({
      where: { userId, ...(app ? { app } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    })
  }

  async remove(userId: string, id: string) {
    const record = await this.prisma.trainingRecord.findFirst({ where: { id, userId } })
    if (!record) throw new NotFoundException('记录不存在')
    await this.prisma.trainingRecord.delete({ where: { id } })
    return { ok: true }
  }
}
