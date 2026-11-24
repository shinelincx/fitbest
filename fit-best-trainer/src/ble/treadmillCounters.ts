import type { DeviceMetrics } from './ftms'

const counters = ['elapsedTime', 'distance', 'calories', 'strokeCount'] as const
export type TreadmillCounterOffsets = Partial<Pick<DeviceMetrics, (typeof counters)[number]>>

export function resumeTreadmillCounters(totals: DeviceMetrics, resumed: DeviceMetrics, offsets: TreadmillCounterOffsets) {
  const next = { ...offsets }
  for (const key of counters) {
    const previousValue = totals[key] ?? 0
    const resumedValue = resumed[key]
    if (resumedValue !== undefined) next[key] = previousValue - resumedValue
  }
  return next
}

export function applyTreadmillCounterOffsets(metrics: DeviceMetrics, offsets: TreadmillCounterOffsets) {
  const next = { ...metrics }
  for (const key of counters) {
    if (offsets[key] !== undefined && metrics[key] !== undefined) next[key] = Math.max(0, metrics[key] + offsets[key])
  }
  return next
}

export function formatTreadmillPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—'
  const seconds = Math.round(secondsPerKm)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
