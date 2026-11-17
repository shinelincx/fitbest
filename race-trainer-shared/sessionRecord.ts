export interface SessionRecord {
  id: string
  cloudId?: string
  date: string // ISO
  startedAt?: string // 带时区的实际开训时间
  distanceM?: number
  avgHr?: number
  maxHr?: number
  planId: string
  moduleTimes: number[] // 每个模块用时(秒)
  runSplit: number[] // 每段跑步用时(秒)
  totalTime: number // 秒
  completed: boolean
  partialModuleIndex?: number // 未完成记录中，最后一个模块为进行中（不足一整组）
  notes?: string
}
