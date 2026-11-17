import type { StrengthSession, StrengthSet } from '../types'

/** Epley 公式估算 1RM */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps / 30) * 10) / 10
}

/** 单组容量（kg） */
export function setVolume(s: StrengthSet): number {
  return Math.round(s.weight * s.reps)
}

/** 最佳组：优先按 e1RM，其次按容量 */
export function bestSetOf(sets: StrengthSet[]): StrengthSet | null {
  let best: StrengthSet | null = null
  let bestScore = -1
  for (const s of sets) {
    const score = epley1RM(s.weight, s.reps) * 1000 + setVolume(s)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

/** 汇总一次训练 */
export function summarizeStrength(
  base: Omit<StrengthSession, 'volumeKg' | 'totalReps' | 'bestSet' | 'e1rm'>,
): StrengthSession {
  const volumeKg = base.sets.reduce((a, s) => a + setVolume(s), 0)
  const totalReps = base.sets.reduce((a, s) => a + s.reps, 0)
  const best = bestSetOf(base.sets)
  return {
    ...base,
    volumeKg,
    totalReps,
    bestSet: best,
    e1rm: best ? epley1RM(best.weight, best.reps) : 0,
  }
}

/** 某动作历史最好 e1RM */
export function exercisePR(list: StrengthSession[], exerciseId: string): number {
  return list
    .filter((s) => s.exerciseId === exerciseId)
    .reduce((max, s) => Math.max(max, s.e1rm), 0)
}

/** 某动作最近一次训练 */
export function lastExerciseSession(
  list: StrengthSession[],
  exerciseId: string,
): StrengthSession | null {
  let latest: StrengthSession | null = null
  for (const s of list) {
    if (s.exerciseId !== exerciseId || s.sets.length === 0) continue
    if (!latest || new Date(s.date).getTime() > new Date(latest.date).getTime()) latest = s
  }
  return latest
}

/** 本周容量 */
export function weekVolume(list: StrengthSession[], isThisWeek: (iso: string) => boolean): number {
  return list.filter((s) => isThisWeek(s.date)).reduce((a, s) => a + s.volumeKg, 0)
}

export function formatVolume(kg: number): string {
  if (kg >= 10000) return `${(kg / 1000).toFixed(1)} t`
  return `${Math.round(kg)} kg`
}
