import { createHash } from 'node:crypto'

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** 解析 30d / 8h / 15m / 60s 为毫秒 */
export function parseDuration(value: string, fallbackMs: number): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim())
  if (!match) return fallbackMs
  const amount = Number(match[1])
  const unit = match[2]
  const factor = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000
  return amount * factor
}
