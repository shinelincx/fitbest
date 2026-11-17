import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.module'

export type SegmentTypeInput = 'start' | 'finish' | 'station' | 'treadmill'

export interface DeviceSyncSegmentInput {
  seq: number
  type: SegmentTypeInput
  machineSerial?: string
  machineType?: string
  connectTick?: number
  disconnectTick?: number
  durationSec: number
  distanceM: number
  metrics?: Record<string, unknown>
}

export interface DeviceSyncInput {
  clientSessionId: string
  device: { serialNo: string; kind: 'band' | 'machine'; label?: string }
  app: 'hyrox' | 'btwe'
  mode: 'training' | 'race'
  startedAt: string
  endedAt?: string
  durationSec: number
  distanceM: number
  avgHr?: number
  maxHr?: number
  metrics?: Record<string, unknown>
  closeReason?: string
  quality: 'ok' | 'partial' | 'invalid'
  segments: DeviceSyncSegmentInput[]
}

interface DerivedTraining {
  distanceM: number
  moduleTimes?: number[]
  runSplits?: number[]
}

const RUN_SPLIT_MIN_DISTANCE_M = 500

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * 从手环段推导训练记录字段：
 * - runSplits：跑步机段按实际距离折算成「每公里用时」
 * - moduleTimes：按赛制把跑步机段和站点段合成一组
 *   HYROX = 1 个站点/组，BTWE = 2 个站点/组
 */
export function deriveTraining(
  segments: DeviceSyncSegmentInput[],
  app: 'hyrox' | 'btwe',
): DerivedTraining {
  const sorted = [...segments].sort((a, b) => a.seq - b.seq)
  const stationsPerModule = app === 'btwe' ? 2 : 1

  const runSplits: number[] = []
  let treadmillDistanceM = 0
  let moduleAcc = 0
  let stationsInModule = 0
  const moduleTimes: number[] = []

  for (const seg of sorted) {
    if (seg.type === 'treadmill') {
      treadmillDistanceM += seg.distanceM
      moduleAcc += seg.durationSec
      if (seg.durationSec > 0 && seg.distanceM >= RUN_SPLIT_MIN_DISTANCE_M) {
        runSplits.push(Math.round((seg.durationSec * 1000) / seg.distanceM))
      }
      continue
    }
    if (seg.type === 'station') {
      moduleAcc += seg.durationSec
      stationsInModule += 1
      if (stationsInModule >= stationsPerModule) {
        if (moduleAcc > 0) moduleTimes.push(moduleAcc)
        moduleAcc = 0
        stationsInModule = 0
      }
    }
  }
  // 结尾未配齐一整组的阶段（终止训练）也按一组计入
  if (moduleAcc > 0) moduleTimes.push(moduleAcc)

  return {
    distanceM: treadmillDistanceM,
    moduleTimes: moduleTimes.length ? moduleTimes : undefined,
    runSplits: runSplits.length ? runSplits : undefined,
  }
}

@Injectable()
export class DeviceSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(userId: string, input: DeviceSyncInput) {
    const startedAt = parseDate(input.startedAt) ?? new Date()
    const endedAt = parseDate(input.endedAt)

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.deviceSession.findUnique({
          where: {
            userId_clientSessionId: { userId, clientSessionId: input.clientSessionId },
          },
          include: { segments: true, device: true },
        })
        // 整场一次收：同一 clientSessionId 重复上传直接返回已有结果
        if (existing) return { ...this.toDto(existing), duplicate: true }

        const device = await tx.device.upsert({
          where: { serialNo: input.device.serialNo },
          create: {
            serialNo: input.device.serialNo,
            kind: input.device.kind,
            label: input.device.label,
            lastSeenAt: new Date(),
          },
          update: {
            kind: input.device.kind,
            label: input.device.label,
            lastSeenAt: new Date(),
          },
        })

        const session = await tx.deviceSession.create({
          data: {
            userId,
            deviceId: device.id,
            clientSessionId: input.clientSessionId,
            mode: input.mode,
            app: input.app,
            startedAt,
            endedAt,
            durationSec: input.durationSec,
            distanceM: input.distanceM,
            avgHr: input.avgHr,
            maxHr: input.maxHr,
            metrics: (input.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
            closeReason: input.closeReason,
            quality: input.quality,
            segments: {
              create: input.segments.map((seg) => ({
                seq: seg.seq,
                type: seg.type,
                machineSerial: seg.machineSerial,
                machineType: seg.machineType,
                connectTick: seg.connectTick,
                disconnectTick: seg.disconnectTick,
                durationSec: seg.durationSec,
                distanceM: seg.distanceM,
                metrics: (seg.metrics ?? undefined) as Prisma.InputJsonValue | undefined,
              })),
            },
          },
        })

        // 只有 training 模式产生训练记录；比赛数据（race）独立存放，不进教练 digest
        let trainingRecordId: string | null = null
        if (input.mode === 'training' && input.quality !== 'invalid') {
          trainingRecordId = await this.linkOrCreateTrainingRecord(tx, userId, input, startedAt)
          if (trainingRecordId) {
            await tx.deviceSession.update({
              where: { id: session.id },
              data: { trainingRecordId },
            })
          }
        }

        const saved = await tx.deviceSession.findUniqueOrThrow({
          where: { id: session.id },
          include: { segments: true, device: true },
        })
        return this.toDto(saved)
      })
    } catch (error) {
      // 并发重复上传命中唯一键：以已落库的整场数据为准
      if (this.isUniqueViolation(error)) {
        const existing = await this.prisma.deviceSession.findUnique({
          where: {
            userId_clientSessionId: { userId, clientSessionId: input.clientSessionId },
          },
          include: { segments: true, device: true },
        })
        if (existing) return { ...this.toDto(existing), duplicate: true }
      }
      throw error
    }
  }

  /**
   * clientSessionId 同时作为 TrainingRecord 的 clientKey：
   * App 端若已先写入同一条训练记录则复用，避免一场训练出现两条记录。
   */
  private async linkOrCreateTrainingRecord(
    tx: Prisma.TransactionClient,
    userId: string,
    input: DeviceSyncInput,
    startedAt: Date,
  ): Promise<string | null> {
    const existing = await tx.trainingRecord.findFirst({
      where: { userId, app: input.app, clientKey: input.clientSessionId },
    })
    if (existing) return existing.id

    const derived = deriveTraining(input.segments, input.app)
    const completed =
      input.closeReason === 'finish' ||
      (input.quality !== 'partial' && input.segments.some((s) => s.type === 'finish'))

    const record = await tx.trainingRecord.create({
      data: {
        userId,
        app: input.app,
        clientKey: input.clientSessionId,
        completed,
        totalTimeSec: input.durationSec,
        distanceM: derived.distanceM || input.distanceM,
        moduleTimes: derived.moduleTimes,
        runSplits: derived.runSplits,
        avgHr: input.avgHr,
        maxHr: input.maxHr,
        startedAt,
      },
    })
    return record.id
  }

  async list(userId: string, mode?: string, limit = 20) {
    const sessions = await this.prisma.deviceSession.findMany({
      where: { userId, ...(mode === 'training' || mode === 'race' ? { mode } : {}) },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { segments: { orderBy: { seq: 'asc' } }, device: true },
    })
    return sessions.map((s) => this.toDto(s))
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    )
  }

  private toDto(session: {
    id: string
    clientSessionId: string
    mode: string
    app: string
    startedAt: Date
    endedAt: Date | null
    durationSec: number
    distanceM: number
    avgHr: number | null
    maxHr: number | null
    metrics: Prisma.JsonValue
    closeReason: string | null
    quality: string
    trainingRecordId: string | null
    device: { serialNo: string; label: string | null }
    segments: Array<{
      seq: number
      type: string
      machineSerial: string | null
      machineType: string | null
      connectTick: number | null
      disconnectTick: number | null
      durationSec: number
      distanceM: number
      metrics: Prisma.JsonValue
    }>
  }) {
    return {
      id: session.id,
      clientSessionId: session.clientSessionId,
      mode: session.mode,
      app: session.app,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSec: session.durationSec,
      distanceM: session.distanceM,
      avgHr: session.avgHr,
      maxHr: session.maxHr,
      metrics: session.metrics,
      closeReason: session.closeReason,
      quality: session.quality,
      trainingRecordId: session.trainingRecordId,
      device: { serialNo: session.device.serialNo, label: session.device.label },
      segments: session.segments.map((s) => ({
        seq: s.seq,
        type: s.type,
        machineSerial: s.machineSerial,
        machineType: s.machineType,
        connectTick: s.connectTick,
        disconnectTick: s.disconnectTick,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        metrics: s.metrics,
      })),
    }
  }
}
