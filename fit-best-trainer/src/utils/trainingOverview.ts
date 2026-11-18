import type { MachineSession, StrengthSession } from '../types'
import type { ActivityEntry } from './activity'
import { startOfWeek } from './stats'

type TrainingItem =
  | (MachineSession & { app: 'cardio' })
  | (StrengthSession & { app: 'strength'; distanceM: 0; calories: 0 })
  | (ActivityEntry & { calories: number })

export function summarizeTraining(
  sessions: MachineSession[],
  strength: StrengthSession[],
  activity: ActivityEntry[],
  now: Date,
) {
  const items: TrainingItem[] = [
    ...sessions.map((session) => ({ ...session, app: 'cardio' as const })),
    ...strength.map((session) => ({ ...session, app: 'strength' as const, distanceM: 0 as const, calories: 0 as const })),
    ...activity.map((entry) => ({ ...entry, calories: entry.calories ?? 0 })),
  ]
  const yearWeekStart = startOfWeek(now)
  const validItems = new Map<string, TrainingItem>()
  for (const item of items) {
    const time = Date.parse(item.date)
    if (item.durationSec >= 0 && Number.isFinite(item.durationSec) && Number.isFinite(time) && time <= now.getTime()) {
      validItems.set(`${item.app}:${item.id}`, item)
    }
  }
  const sorted = [...validItems.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const week = sorted.filter((item) => Date.parse(item.date) >= yearWeekStart.getTime())
  const dayCounts = Array<number>(7).fill(0)
  for (const item of week) dayCounts[(new Date(item.date).getDay() + 6) % 7]++

  function total(list: TrainingItem[]) {
    return list.reduce((sum, item) => ({
      count: sum.count + 1,
      durationSec: sum.durationSec + item.durationSec,
      distanceM: sum.distanceM + (Math.max(0, item.distanceM) || 0),
      calories: sum.calories + (Math.max(0, item.calories) || 0),
    }), { count: 0, durationSec: 0, distanceM: 0, calories: 0 })
  }
  return {
    all: sorted,
    lifetime: total(sorted),
    weekly: total(week),
    week,
    dayCounts,
    todayIndex: (now.getDay() + 6) % 7,
    trainedToday: week.some((item) => new Date(item.date).toDateString() === now.toDateString()),
  }
}
