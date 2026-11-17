// FITBEST — 领域类型定义

export type MachineType =
  | 'treadmill'
  | 'rower'
  | 'ski'
  | 'bike'
  | 'spin'
  | 'elliptical'
  | 'upright'
  | 'stair'

export type TrainMode = 'free' | 'interval' | 'distance' | 'time'

export interface MachineInfo {
  type: MachineType
  name: string
  short: string
  tagline: string
  description: string
  tips: string[]
  /** 主指标单位：km 或 次 */
  unit: 'km'
  targetDistances: number[] // 米
  targetTimes: number[] // 秒
}

export interface IntervalConfig {
  work: number // 秒
  rest: number // 秒
  rounds: number
}

export interface MachineSession {
  kind?: 'cardio'
  id: string
  date: string // ISO 开始时间
  endedAt?: string
  machine: MachineType
  mode: TrainMode
  durationSec: number
  distanceM: number
  avgSpeed: number // km/h
  cadence: number // spm / rpm
  power: number // W
  calories: number
  avgHr: number
  target?: number // 目标距离(m) 或 目标时间(s) 或 间歇组数
  completed: boolean
  syncState?: 'pending' | 'failed'
}

/* ===== 力量训练 ===== */

/** 器械族：杠铃 / 哑铃 / 固定器械 / 绳索 / 自重 */
export type EquipmentKind = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

export type MuscleGroup = 'chest' | 'back' | 'legs' | 'glutes' | 'shoulders' | 'arms' | 'core'

export interface StrengthExercise {
  id: string
  name: string
  en: string
  equipment: EquipmentKind
  /** 主要肌群在前 */
  muscles: MuscleGroup[]
  /** 是否自重动作（负重可选） */
  bodyweight?: boolean
  /** 默认递增步长 kg */
  step: number
  tip: string
}

export interface StrengthSet {
  weight: number // kg，自重为 0
  reps: number
  rpe?: number
  /** 智能插销测得的动作幅度 cm */
  romCm?: number
  /** 智能插销测得的平均单次用时 s */
  tempoSec?: number
  at: number // 完成时间戳
}

/** 记录来源：手动记录 / 智能插销自动记录 */
export type StrengthSource = 'manual' | 'pin'

export interface StrengthSession {
  kind: 'strength'
  id: string
  date: string // ISO
  exerciseId: string
  exerciseName: string
  equipment: EquipmentKind
  /** 插片式器械 ID（智能插销接入时） */
  machineId?: string
  source?: StrengthSource
  sets: StrengthSet[]
  durationSec: number
  volumeKg: number
  totalReps: number
  bestSet: StrengthSet | null
  /** 预估 1RM（Epley） */
  e1rm: number
  completed: boolean
}

export type AnySession = MachineSession | StrengthSession

/** 插片式力量器械（配重片 + 智能插销） */
export interface PinMachine {
  id: string
  name: string
  en: string
  /** 对应动作库中的动作，记录与统计口径一致 */
  exerciseId: string
  muscles: MuscleGroup[]
  /** 单片配重 kg */
  plateKg: number
  /** 总片数 */
  plates: number
  /** 起始档位（第几片） */
  startPlate: number
  /** 器械结构：单边配重 / 双边配重（腿举等按总重显示） */
  leverage?: 'single' | 'double'
}

/** 智能插销与器械的绑定关系：一个插销同一时间绑定一台器械 */
export interface PinBinding {
  pinId: string
  pinName: string
  machineId: string
  boundAt: number
}
