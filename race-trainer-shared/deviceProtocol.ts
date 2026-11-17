import type { ActivityApp } from './sso'

export type DeviceSegmentType = 'start' | 'finish' | 'station' | 'treadmill'

export interface DeviceSegmentInput {
  seq: number
  type: DeviceSegmentType
  machineSerial?: string
  machineType?: string
  connectTick?: number
  disconnectTick?: number
  durationSec: number
  distanceM: number
  metrics?: Record<string, unknown>
}

export interface DeviceSessionInput {
  clientSessionId: string
  device: { serialNo: string; kind: 'band' | 'machine'; label?: string }
  app: ActivityApp
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
  segments: DeviceSegmentInput[]
}

/**
 * 归一化：把在手环里记录的分段整理成后端协议。
 * - seq 依次编号
 * - 使用手环记录的分段时长（durationSec）
 * - 缺失的连接和断开时间用累计时长补齐
 */
export function normalizeSegments(segments: DeviceSegmentInput[]): DeviceSegmentInput[] {
  let cursor = 0
  return segments.map((seg, i) => {
    const durationSec = Math.max(0, Math.round(seg.durationSec))
    const start = cursor
    cursor += durationSec
    return {
      ...seg,
      seq: i + 1,
      durationSec,
      distanceM: Math.max(0, Math.round(seg.distanceM)),
      connectTick: seg.connectTick ?? start,
      disconnectTick: seg.disconnectTick ?? cursor,
    }
  })
}

/** 从心率采样计算平均/最大心率 */
export function hrSummary(samples: number[]): { avgHr?: number; maxHr?: number } {
  const valid = samples.filter((n) => n >= 30 && n <= 250)
  if (!valid.length) return {}
  return {
    avgHr: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length),
    maxHr: Math.max(...valid),
  }
}
