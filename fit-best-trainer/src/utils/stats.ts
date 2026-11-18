import i18n from '../i18n'
import type { MachineSession, MachineType } from '../types'

// 本周（周一 00:00 起）起点
export function startOfWeek(base = new Date()): Date {
  const d = new Date(base)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export function isThisWeek(iso: string): boolean {
  const t = new Date(iso).getTime()
  return t >= startOfWeek().getTime() && t <= Date.now()
}

export interface Summary {
  count: number
  durationSec: number
  distanceM: number
  calories: number
  avgHr: number
}

export function summarize(list: MachineSession[]): Summary {
  const withHr = list.filter((s) => s.avgHr > 0)
  return {
    count: list.length,
    durationSec: list.reduce((a, s) => a + s.durationSec, 0),
    distanceM: list.reduce((a, s) => a + s.distanceM, 0),
    calories: list.reduce((a, s) => a + s.calories, 0),
    avgHr: withHr.length
      ? Math.round(withHr.reduce((a, s) => a + s.avgHr, 0) / withHr.length)
      : 0,
  }
}

export function byMachine(list: MachineSession[], machine: MachineType): MachineSession[] {
  return list.filter((s) => s.machine === machine)
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`
  return `${Math.round(m)} m`
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}m`
  return i18n.t('{{count}} 分钟', { count: m })
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  if (sameDay) return i18n.t('今天')
  if (d.toDateString() === y.toDateString()) return i18n.t('昨天')
  return i18n.t('{{month}}月{{day}}日', { month: d.getMonth() + 1, day: d.getDate() })
}

// 连续训练天数：今天还没练时从昨天开始算，避免当天早上就断签
export function trainingStreak(list: readonly { date: string }[], base = new Date()): number {
  const days = new Set(list.map((s) => new Date(s.date).toDateString()))
  const cursor = new Date(base)
  cursor.setHours(0, 0, 0, 0)
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(cursor.toDateString())) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface PersonalBest {
  label: string
  value: string
}

export function personalBests(list: MachineSession[]): PersonalBest[] {
  const best = (value: (s: MachineSession) => number) => Math.max(0, ...list.map(value))
  const items: PersonalBest[] = []
  const distance = best((s) => s.distanceM)
  const duration = best((s) => s.durationSec)
  const speed = best((s) => s.avgSpeed)
  const power = best((s) => s.power)
  if (distance > 0) items.push({ label: i18n.t('最长距离'), value: formatDistance(distance) })
  if (duration > 0) items.push({ label: i18n.t('最长时长'), value: formatDuration(duration) })
  if (speed > 0) items.push({ label: i18n.t('最快均速'), value: `${speed.toFixed(1)} km/h` })
  if (power > 0) items.push({ label: i18n.t('最大功率'), value: `${Math.round(power)} W` })
  return items
}
