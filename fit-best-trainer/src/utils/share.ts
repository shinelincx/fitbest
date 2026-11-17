import i18n from '../i18n'
import type { MachineSession, StrengthSession } from '../types'
import { formatTime } from './format'
import { formatDistance, formatDuration, startOfWeek, trainingStreak } from './stats'
import { Clipboard } from '@capacitor/clipboard'
import { isNative } from '../platform/runtime'

export type ShareStat = { label: string; value: string }

export type ShareData = {
  v: 1
  id: string
  machine: string
  subtitle: string
  date: string
  metricLabel: string
  metricValue: string
  metricUnit: string
  stats: ShareStat[]
  nickname?: string
  avatar?: string
}

export type StrengthShareData = {
  v: 3
  id: string
  exercise: string
  subtitle: string
  date: string
  metricLabel: string
  metricValue: string
  metricUnit: string
  stats: ShareStat[]
  sets: { weight: number; reps: number; romCm?: number }[]
  nickname?: string
  avatar?: string
}

export type WeeklyData = {
  v: 2
  id: string
  range: string
  count: number
  durationSec: number
  distanceM: number
  calories: number
  streak: number
  days: number[]
  nickname?: string
  avatar?: string
}

export type SharePayload = ShareData | WeeklyData | StrengthShareData

type BuildOptions = {
  machineName: string
  subtitle: string
  nickname?: string
  avatar?: string
  showHeartRate: boolean
}

export function buildShareData(session: MachineSession, opts: BuildOptions): ShareData {
  const isDistance = session.mode === 'distance'
  const stats: ShareStat[] = [
    isDistance
      ? { label: i18n.t('总用时'), value: formatTime(session.durationSec) }
      : { label: i18n.t('距离'), value: `${(session.distanceM / 1000).toFixed(2)} km` },
    { label: i18n.t('消耗'), value: `${session.calories} kcal` },
    opts.showHeartRate && session.avgHr
      ? { label: i18n.t('平均心率'), value: `${session.avgHr} bpm` }
      : session.avgSpeed
        ? { label: i18n.t('平均速度'), value: `${session.avgSpeed} km/h` }
        : { label: i18n.t('步频 / 桨频'), value: `${session.cadence}` },
  ]

  return {
    v: 1,
    id: session.id,
    machine: opts.machineName,
    subtitle: opts.subtitle,
    date: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(session.date),
    ),
    metricLabel: isDistance ? i18n.t('距离') : i18n.t('总用时'),
    metricValue: isDistance ? (session.distanceM / 1000).toFixed(2) : formatTime(session.durationSec),
    metricUnit: isDistance ? i18n.t('公里') : i18n.t('时:分:秒'),
    stats,
    nickname: opts.nickname?.trim() || undefined,
    avatar: opts.nickname ? opts.avatar : undefined,
  }
}

type StrengthBuildOptions = {
  subtitle: string
  nickname?: string
  avatar?: string
}

export function buildStrengthShareData(
  session: StrengthSession,
  opts: StrengthBuildOptions,
): StrengthShareData {
  const best = session.bestSet
  const sets = session.sets.map((s) => ({
    weight: s.weight,
    reps: s.reps,
    romCm: s.romCm,
  }))
  const stats: ShareStat[] = [
    { label: i18n.t('总次数'), value: `${session.totalReps}` },
    best
      ? {
          label: i18n.t('最佳 {{weight}}kg × {{reps}}', { weight: best.weight, reps: best.reps }),
          value: `${best.weight} × ${best.reps}`,
        }
      : { label: i18n.t('组数'), value: `${session.sets.length}` },
    session.e1rm > 0
      ? { label: i18n.t('预估 1RM'), value: `${Math.round(session.e1rm)} kg` }
      : { label: i18n.t('总用时'), value: formatTime(session.durationSec) },
  ]
  const volumeStr =
    session.volumeKg >= 1000 ? `${(session.volumeKg / 1000).toFixed(2)} t` : `${Math.round(session.volumeKg)}`

  return {
    v: 3,
    id: session.id,
    exercise: session.exerciseName,
    subtitle: opts.subtitle,
    date: new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(session.date),
    ),
    metricLabel: i18n.t('训练容量'),
    metricValue: volumeStr,
    metricUnit: session.volumeKg >= 1000 ? i18n.t('吨') : 'kg',
    stats,
    sets,
    nickname: opts.nickname?.trim() || undefined,
    avatar: opts.nickname ? opts.avatar : undefined,
  }
}

export function buildWeeklyData(
  sessions: MachineSession[],
  opts: { nickname?: string; avatar?: string },
): WeeklyData {
  const start = startOfWeek()
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const week = sessions.filter((s) => {
    const t = new Date(s.date).getTime()
    return t >= start.getTime() && t <= Date.now()
  })

  const days = Array(7).fill(0) as number[]
  week.forEach((s) => {
    const idx = (new Date(s.date).getDay() + 6) % 7
    days[idx] += Math.round(s.durationSec / 60)
  })

  return {
    v: 2,
    id: `w-${start.toISOString().slice(0, 10)}`,
    range: i18n.t('{{startMonth}}月{{startDay}}日 – {{endMonth}}月{{endDay}}日', {
      startMonth: start.getMonth() + 1,
      startDay: start.getDate(),
      endMonth: end.getMonth() + 1,
      endDay: end.getDate(),
    }),
    count: week.length,
    durationSec: week.reduce((a, s) => a + s.durationSec, 0),
    distanceM: week.reduce((a, s) => a + s.distanceM, 0),
    calories: week.reduce((a, s) => a + s.calories, 0),
    streak: trainingStreak(sessions),
    days,
    nickname: opts.nickname?.trim() || undefined,
    avatar: opts.nickname ? opts.avatar : undefined,
  }
}


function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token: string): string {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeShare(data: SharePayload): string {
  return toBase64Url(JSON.stringify(data))
}

function isValidShare(parsed: SharePayload): parsed is SharePayload {
  if (!parsed) return false
  if (parsed.v === 1) return !!parsed.metricValue && Array.isArray(parsed.stats)
  if (parsed.v === 2) return Array.isArray(parsed.days) && typeof parsed.count === 'number'
  if (parsed.v === 3) return !!parsed.metricValue && Array.isArray((parsed as StrengthShareData).sets)
  return false
}

export function decodeShare(token: string | null): SharePayload | null {
  if (!token) return null
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as SharePayload
    return isValidShare(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function buildShareUrl(data: SharePayload): string {
  let base = `${location.origin}${location.pathname}`
  if (isNative) {
    base = import.meta.env.VITE_PUBLIC_WEB_URL?.trim() ?? ''
    if (!/^https?:\/\//i.test(base)) throw new Error(i18n.t('未配置公开分享地址'))
    if (!base.endsWith('/')) base += '/'
  }
  return `${base}#/s/${encodeURIComponent(data.id)}?d=${encodeShare(data)}`
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error(i18n.t('图片生成失败')))
    }, 'image/png')
  })
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function renderShareImage(data: ShareData): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready

  const W = 1080
  const H = 1440
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('图片生成失败'))

  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'
  const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // 页头：用户头像 + 昵称；隐藏昵称时头像一并隐藏
  const avatarImg = data.avatar ? await loadImage(data.avatar) : null
  const logoImg = await loadImage(new URL('logo.png', document.baseURI).href)
  if (data.nickname) {
    const size = 160
    const cx = 96 + size / 2
    const cy = 88 + size / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (avatarImg) {
      ctx.drawImage(avatarImg, 96, 88, size, size)
    } else {
      ctx.fillStyle = '#0e0f11'
      ctx.fillRect(96, 88, size, size)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 64px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(data.nickname.trim().slice(0, 1) || 'F', cx, cy + 22)
      ctx.textAlign = 'left'
    }
    ctx.restore()

    let name = data.nickname
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    while (ctx.measureText(name).width > 700 && name.length > 4) name = name.slice(0, -2)
    ctx.fillText(name === data.nickname ? name : `${name}…`, 284, 191)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 36px ${SANS}`
    ctx.fillText(data.date, 284, 244)
  } else {
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    ctx.fillText(i18n.t('个人训练记录'), 96, 190)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 36px ${SANS}`
    ctx.fillText(data.date, 96, 244)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t('器械训练'), W - 96, 244)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#e3e6ea'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(96, 280)
  ctx.lineTo(W - 96, 280)
  ctx.stroke()

  // 器械名与模式
  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t(data.machine), 96, 396)
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t(data.subtitle), 96, 454)

  // 主数据
  ctx.fillStyle = '#9aa1ab'
  ctx.font = `500 26px ${SANS}`
  ctx.fillText(i18n.t(data.metricLabel), 96, 566)

  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 208px ${MONO}`
  ctx.fillText(data.metricValue, 92, 772)
  const valueW = ctx.measureText(data.metricValue).width
  ctx.fillStyle = '#6b7280'
  ctx.font = `500 42px ${SANS}`
  ctx.fillText(i18n.t(data.metricUnit), 92 + valueW + 18, 768)

  // 三项指标
  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, 872)
  ctx.lineTo(W - 96, 872)
  ctx.stroke()

  const colW = (W - 192) / 3
  data.stats.forEach((it, i) => {
    const x = 96 + colW * i
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 26px ${SANS}`
    ctx.fillText(i18n.t(it.label), x, 930)
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 46px ${MONO}`
    const value = it.value.length > 12 ? it.value.slice(0, 12) : it.value
    ctx.fillText(value, x, 998)
  })

  // 页脚：左侧 FITBEST logo
  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, 1210)
  ctx.lineTo(W - 96, 1210)
  ctx.stroke()

  const logoSize = 120
  if (logoImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(96 + logoSize / 2, 1245 + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logoImg, 96, 1245, logoSize, logoSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#f8481f'
    ctx.fillRect(96, 1245, logoSize, logoSize)
  }
  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t('FITBEST，一起为了活力。'), 96 + logoSize + 28, 1328)

  return canvasToBlob(canvas)
}

export async function renderWeeklyImage(data: WeeklyData): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready

  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('图片生成失败'))

  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'
  const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const avatarImg = data.avatar ? await loadImage(data.avatar) : null
  const logoImg = await loadImage(new URL('logo.png', document.baseURI).href)

  if (data.nickname) {
    const size = 160
    const cx = 96 + size / 2
    const cy = 88 + size / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (avatarImg) {
      ctx.drawImage(avatarImg, 96, 88, size, size)
    } else {
      ctx.fillStyle = '#0e0f11'
      ctx.fillRect(96, 88, size, size)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 64px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(data.nickname.trim().slice(0, 1) || 'F', cx, cy + 22)
      ctx.textAlign = 'left'
    }
    ctx.restore()

    let name = data.nickname
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    while (ctx.measureText(name).width > 700 && name.length > 4) name = name.slice(0, -2)
    ctx.fillText(name === data.nickname ? name : `${name}…`, 284, 191)
  } else {
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    ctx.fillText(i18n.t('个人周报'), 96, 190)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t('本周战报'), W - 96, 190)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#e3e6ea'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(96, 280)
  ctx.lineTo(W - 96, 280)
  ctx.stroke()

  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t('本周训练总结'), 96, 396)

  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t(data.range), 96, 454)

  // 训练次数
  ctx.fillStyle = '#9aa1ab'
  ctx.font = `500 26px ${SANS}`
  ctx.fillText(i18n.t('训练次数'), 96, 566)

  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 208px ${MONO}`
  ctx.fillText(`${data.count}`, 92, 772)
  const countW = ctx.measureText(`${data.count}`).width
  ctx.fillStyle = '#6b7280'
  ctx.font = `500 42px ${SANS}`
  ctx.fillText(i18n.t('次'), 92 + countW + 18, 768)

  // 本周每日训练时长
  const chartX = 620
  const chartW = W - 96 - chartX
  const slot = chartW / 7
  const barW = 32
  const base = 772
  const maxMin = Math.max(...data.days, 1)
  const labels = ['一', '二', '三', '四', '五', '六', '日']
  data.days.forEach((min, i) => {
    const h = min > 0 ? Math.max(10, (min / maxMin) * 150) : 4
    const x = chartX + slot * i + (slot - barW) / 2
    ctx.fillStyle = min > 0 ? '#f8481f' : '#e3e6ea'
    ctx.fillRect(x, base - h, barW, h)
    ctx.fillStyle = '#9aa1ab'
    ctx.font = `400 20px ${SANS}`
    ctx.textAlign = 'center'
    ctx.fillText(i18n.t(labels[i]), x + barW / 2, 808)
    ctx.textAlign = 'left'
  })

  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, 872)
  ctx.lineTo(W - 96, 872)
  ctx.stroke()

  const stats = [
    { label: i18n.t('总时长'), value: formatDuration(data.durationSec) },
    { label: i18n.t('总距离'), value: formatDistance(data.distanceM) },
    { label: i18n.t('总消耗'), value: `${data.calories} kcal` },
    { label: i18n.t('连续训练'), value: i18n.t('{{count}} 天', { count: data.streak }) },
  ]
  const colW = (W - 192) / 2
  stats.forEach((it, i) => {
    const x = 96 + colW * (i % 2)
    const labelY = i < 2 ? 930 : 1058
    const valueY = i < 2 ? 998 : 1126
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 26px ${SANS}`
    ctx.fillText(i18n.t(it.label), x, labelY)
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 46px ${MONO}`
    ctx.fillText(it.value, x, valueY)
  })

  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, 1170)
  ctx.lineTo(W - 96, 1170)
  ctx.stroke()

  const logoSize = 120
  if (logoImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(96 + logoSize / 2, 1195 + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logoImg, 96, 1195, logoSize, logoSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#f8481f'
    ctx.fillRect(96, 1195, logoSize, logoSize)
  }
  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t('FITBEST，一起为了活力。'), 96 + logoSize + 28, 1278)

  return canvasToBlob(canvas)
}

export async function renderStrengthImage(data: StrengthShareData): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready

  const W = 1080
  const rowH = 72
  const setsH = Math.min(data.sets.length, 8) * rowH + 40
  const H = 1440 + (data.sets.length > 8 ? 40 : 0) + setsH
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error(i18n.t('图片生成失败'))

  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'
  const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const avatarImg = data.avatar ? await loadImage(data.avatar) : null
  const logoImg = await loadImage(new URL('logo.png', document.baseURI).href)

  // 页头
  if (data.nickname) {
    const size = 160
    const cx = 96 + size / 2
    const cy = 88 + size / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (avatarImg) {
      ctx.drawImage(avatarImg, 96, 88, size, size)
    } else {
      ctx.fillStyle = '#0e0f11'
      ctx.fillRect(96, 88, size, size)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 64px ${SANS}`
      ctx.textAlign = 'center'
      ctx.fillText(data.nickname.trim().slice(0, 1) || 'F', cx, cy + 22)
      ctx.textAlign = 'left'
    }
    ctx.restore()

    let name = data.nickname
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    while (ctx.measureText(name).width > 700 && name.length > 4) name = name.slice(0, -2)
    ctx.fillText(name === data.nickname ? name : `${name}…`, 284, 191)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 36px ${SANS}`
    ctx.fillText(data.date, 284, 244)
  } else {
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 66px ${SANS}`
    ctx.fillText(i18n.t('力量训练完成'), 96, 190)
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 36px ${SANS}`
    ctx.fillText(data.date, 96, 244)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t('智能插销 · 自动记录'), W - 96, 244)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#e3e6ea'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(96, 280)
  ctx.lineTo(W - 96, 280)
  ctx.stroke()

  // 动作名 + 副标题
  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t(data.exercise), 96, 396)
  ctx.fillStyle = '#6b7280'
  ctx.font = `400 36px ${SANS}`
  ctx.fillText(i18n.t(data.subtitle), 96, 454)

  // 主数据：训练容量
  ctx.fillStyle = '#9aa1ab'
  ctx.font = `500 26px ${SANS}`
  ctx.fillText(i18n.t(data.metricLabel), 96, 566)

  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 208px ${MONO}`
  ctx.fillText(data.metricValue, 92, 772)
  const valueW = ctx.measureText(data.metricValue).width
  ctx.fillStyle = '#6b7280'
  ctx.font = `500 42px ${SANS}`
  ctx.fillText(i18n.t(data.metricUnit), 92 + valueW + 18, 768)

  // 三项指标
  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, 872)
  ctx.lineTo(W - 96, 872)
  ctx.stroke()

  const colW = (W - 192) / 3
  data.stats.forEach((it, i) => {
    const x = 96 + colW * i
    ctx.fillStyle = '#6b7280'
    ctx.font = `400 26px ${SANS}`
    ctx.fillText(i18n.t(it.label), x, 930)
    ctx.fillStyle = '#0e0f11'
    ctx.font = `700 46px ${MONO}`
    const value = it.value.length > 12 ? it.value.slice(0, 12) : it.value
    ctx.fillText(value, x, 998)
  })

  // 组数表格
  const tableY0 = 1080
  ctx.strokeStyle = '#e3e6ea'
  ctx.beginPath()
  ctx.moveTo(96, tableY0)
  ctx.lineTo(W - 96, tableY0)
  ctx.stroke()

  ctx.fillStyle = '#6b7280'
  ctx.font = `500 26px ${SANS}`
  ctx.fillText(i18n.t('组'), 96, tableY0 + 38)
  ctx.fillText(i18n.t('配重'), 200, tableY0 + 38)
  ctx.fillText(i18n.t('次数'), 480, tableY0 + 38)
  ctx.textAlign = 'right'
  ctx.fillText(i18n.t('幅度'), W - 96, tableY0 + 38)
  ctx.textAlign = 'left'

  const shown = data.sets.slice(0, 8)
  shown.forEach((s, i) => {
    const y = tableY0 + 82 + i * rowH
    ctx.strokeStyle = '#f2f4f7'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(96, y - 24)
    ctx.lineTo(W - 96, y - 24)
    ctx.stroke()

    ctx.fillStyle = '#0e0f11'
    ctx.font = `600 32px ${MONO}`
    ctx.fillText(`${i + 1}`, 96, y)
    ctx.fillText(`${s.weight} kg`, 200, y)
    ctx.fillText(`${s.reps}`, 480, y)
    if (s.romCm) {
      ctx.textAlign = 'right'
      ctx.fillText(`${s.romCm} cm`, W - 96, y)
      ctx.textAlign = 'left'
    }
  })
  if (data.sets.length > 8) {
    const y = tableY0 + 82 + 8 * rowH
    ctx.fillStyle = '#9aa1ab'
    ctx.font = `400 26px ${SANS}`
    ctx.fillText(i18n.t('…还有 {{count}} 组', { count: data.sets.length - 8 }), 96, y)
  }

  // 页脚
  const footerY0 = H - 200
  ctx.strokeStyle = '#e3e6ea'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(96, footerY0)
  ctx.lineTo(W - 96, footerY0)
  ctx.stroke()

  const logoSize = 120
  if (logoImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(96 + logoSize / 2, footerY0 + 35 + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logoImg, 96, footerY0 + 35, logoSize, logoSize)
    ctx.restore()
  } else {
    ctx.fillStyle = '#f8481f'
    ctx.fillRect(96, footerY0 + 35, logoSize, logoSize)
  }
  ctx.fillStyle = '#0e0f11'
  ctx.font = `700 66px ${SANS}`
  ctx.fillText(i18n.t('FITBEST，一起为了活力。'), 96 + logoSize + 28, footerY0 + 118)

  return canvasToBlob(canvas)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (isNative) {
      await Clipboard.write({ string: text })
      return true
    }
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}
