// BTWE 训练 App — 领域类型定义

export type ExerciseType = 'cardio' | 'strength'

export interface Exercise {
  id: string
  name: string
  type: ExerciseType
  icon: string // lucide icon name
  tips: string[]
  alternatives: string[]
  metric: 'distance' | 'reps' | 'time'
  target: number // 目标距离(m) / 次数 / 秒
}

// BTWE 标准模块：800m 跑 + 1 心肺 + 1 力量
export interface Module {
  order: number // 1-4
  runDistance: number // 米
  cardioExerciseId: string
  strengthExerciseId: string
}

export type PlanLevel = 'beginner' | 'intermediate' | 'elite'

export interface Plan {
  id: string
  name: string
  level: PlanLevel
  durationWeeks: number
  sessionsPerWeek: number
  description: string
  highlights: string[]
  modules: Module[]
  accent: string // tailwind color token name
}

export type { SessionRecord } from '../../race-trainer-shared/sessionRecord'

export interface UserStats {
  totalSessions: number
  totalKm: number
  streak: number
  bestModuleTime: number // 秒
  bestFullTime: number // 秒
}

export interface User {
  id: string
  name: string
  avatar: string
  level: PlanLevel
  targetRace: string
  stats: UserStats
}

import type { RaceStatus } from '../../race-trainer-shared/events'
export type { RaceStatus } from '../../race-trainer-shared/events'

export interface Race {
  id: string
  name: string
  city: string
  date: string
  status: RaceStatus
  registered?: boolean
}
