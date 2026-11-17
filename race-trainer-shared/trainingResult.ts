import { hrSummary, normalizeSegments, type DeviceSegmentInput, type DeviceSessionInput } from './deviceProtocol'
import { bandSerial } from './deviceSync'
import type { DeviceMetrics } from './ftms'
import type { SessionRecord } from './sessionRecord'
import type { ActivityApp } from './sso'

export interface TrainingResult {
  session: SessionRecord
  device: DeviceSessionInput
}

export function capturePhaseSegment(
  seq: number,
  type: 'treadmill' | 'station',
  machineType: string,
  device: { connected: boolean; name: string; metrics: DeviceMetrics },
  startedMs: number | undefined,
): DeviceSegmentInput | undefined {
  const { elapsedTime = 0, distance = 0, ...metrics } = device.metrics
  const durationSec = Math.round(elapsedTime)
  if (durationSec <= 0 && distance <= 0) return
  const disconnectTick = startedMs !== undefined ? Math.round((Date.now() - startedMs) / 1000) : undefined

  return {
    seq,
    type,
    machineSerial: device.connected ? device.name : undefined,
    machineType,
    connectTick: disconnectTick !== undefined ? Math.max(0, disconnectTick - durationSec) : undefined,
    disconnectTick,
    durationSec,
    distanceM: Math.round(distance),
    metrics,
  }
}

export function buildTrainingResult(
  app: ActivityApp,
  draft: Omit<SessionRecord, 'id' | 'date'>,
  phaseSegments: DeviceSegmentInput[],
  hrSamples: number[],
  startIso: string | undefined,
): TrainingResult {
  const id = crypto.randomUUID()
  const segments = [...phaseSegments]
  if (draft.completed) {
    segments.push({ seq: segments.length + 1, type: 'finish', durationSec: 0, distanceM: 0 })
  }
  const normalized = normalizeSegments(segments)
  const distanceM = normalized
    .filter((segment) => segment.type === 'treadmill')
    .reduce((sum, segment) => sum + segment.distanceM, 0)
  const endedAt = new Date().toISOString()
  const startedAt = startIso ?? endedAt
  const heartRate = hrSummary(hrSamples)

  return {
    session: { ...draft, id, date: startedAt.slice(0, 10), startedAt, distanceM, ...heartRate },
    device: {
      clientSessionId: id,
      device: { serialNo: bandSerial(), kind: 'band', label: 'FITBEST 手环' },
      app,
      mode: 'training',
      startedAt,
      endedAt,
      durationSec: Math.round(draft.totalTime),
      distanceM,
      ...heartRate,
      metrics: {
        source: 'ble-band',
        stations: normalized.filter((segment) => segment.type === 'station').length,
      },
      closeReason: draft.completed ? 'finish' : 'abort',
      quality: draft.completed ? 'ok' : 'partial',
      segments: normalized,
    },
  }
}
