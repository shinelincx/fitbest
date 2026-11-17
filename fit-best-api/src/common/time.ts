const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shifted(date: Date): Date {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS)
}

/** 上海时区 YYYY-MM-DD */
export function shanghaiDateKey(date: Date): string {
  return shifted(date).toISOString().slice(0, 10)
}

/** 本周一 00:00（上海时区）对应的 UTC 时间 */
export function weekStartShanghai(now = new Date()): Date {
  const local = shifted(now)
  const day = local.getUTCDay()
  const offset = day === 0 ? 6 : day - 1
  const startUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - offset)
  return new Date(startUtc - SHANGHAI_OFFSET_MS)
}

/** 本月 1 日 00:00（上海时区）对应的 UTC 时间 */
export function monthStartShanghai(now = new Date()): Date {
  const local = shifted(now)
  const startUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  return new Date(startUtc - SHANGHAI_OFFSET_MS)
}

/** 今天 00:00（上海时区）对应的 UTC 时间 */
export function dayStartShanghai(now = new Date()): Date {
  const local = shifted(now)
  const startUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  return new Date(startUtc - SHANGHAI_OFFSET_MS)
}

/** 本周一到周日共 7 天的日期键 */
export function currentWeekDays(now = new Date()): string[] {
  const start = weekStartShanghai(now)
  return Array.from({ length: 7 }, (_, i) => shanghaiDateKey(new Date(start.getTime() + i * 86400000)))
}
