import type { IntervalConfig, TrainMode } from '../types'

export function intervalProgress(elapsed: number, config: IntervalConfig) {
  const cycle = config.work + config.rest
  const total = config.rounds * cycle
  const completed = elapsed >= total
  const position = elapsed % cycle
  const phase = completed || position >= config.work ? 'rest' : 'work'
  return {
    phase,
    remain: completed ? 0 : phase === 'work' ? config.work - position : cycle - position,
    round: Math.min(config.rounds, Math.floor(elapsed / cycle) + 1),
    total,
  } as const
}

export function trainingGoal(mode: TrainMode, elapsed: number, distance: number, timeTarget: number, distanceTarget: number, intervalTotal: number) {
  const target = mode === 'distance' ? distanceTarget : mode === 'time' ? timeTarget : mode === 'interval' ? intervalTotal : 0
  const value = mode === 'distance' ? distance : elapsed
  return {
    target,
    progress: target > 0 ? Math.min(100, (value / target) * 100) : 0,
    reached: target > 0 && value >= target,
  }
}
