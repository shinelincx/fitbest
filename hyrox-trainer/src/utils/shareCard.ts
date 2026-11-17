// 成绩卡分享 —— 单次训练的海报生成（P0）
// 说明：两个站点共享同一套实现，仅 BRAND 常量不同，改动时请同步 HYROX / BTWE。
import type { SessionRecord } from '../types'
import { formatTime } from './format'

export const BRAND = {
  id: 'hyrox',
  name: 'HYROX',
  tagline: '体能 · 力量',
  slogan: 'FITBEST，一起为了活力。',
  primary: '#eab308',
  splitLabel: '每公里配速',
  moduleCount: 8,
} as const

export type ShareStat = { label: string; value: string }

export type ShareCardData = {
  v: 1
  date: string
  plan: string
  completed: boolean
  totalTime: number
  moduleTimes: number[]
  runSplit: number[]
  partialModuleIndex?: number
  stats: ShareStat[]
  nickname?: string
  avatar?: string
}

export function buildShareCard(
  session: SessionRecord,
  opts: { plan: string; nickname?: string; avatar?: string },
): ShareCardData {
  const partial = session.partialModuleIndex
  // 进行中的模块不足一整组，不参与平均值/最快值统计
  const modules = session.moduleTimes.filter((t, i) => t > 0 && i !== partial)
  const splits = session.runSplit.filter((t) => t > 0)
  const avgModule = modules.length
    ? modules.reduce((a, t) => a + t, 0) / modules.length
    : 0
  const bestModule = modules.length ? Math.min(...modules) : 0
  const avgSplit = splits.length ? Math.round(splits.reduce((a, t) => a + t, 0) / splits.length) : 0

  return {
    v: 1,
    date: session.date,
    plan: opts.plan,
    completed: session.completed,
    totalTime: session.totalTime,
    moduleTimes: session.moduleTimes,
    runSplit: session.runSplit,
    partialModuleIndex: partial,
    stats: [
      { label: '平均单模块', value: formatTime(avgModule) },
      { label: '最快模块', value: bestModule ? formatTime(bestModule) : '—' },
      { label: BRAND.splitLabel, value: avgSplit ? formatTime(avgSplit) : '—' },
      { label: '完成模块', value: `${modules.length}/${BRAND.moduleCount}` },
    ],
    nickname: opts.nickname?.trim() || undefined,
    avatar: opts.nickname ? opts.avatar : undefined,
  }
}

export function buildShareText(data: ShareCardData): string {
  const state = data.completed ? '' : '（未完成）'
  return [
    `${BRAND.name} 训练成绩${state}`,
    `${data.plan} · 总用时 ${formatTime(data.totalTime)}`,
    '来一起练！',
  ].join('\n')
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatDate(raw: string): string {
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日`
}

function loadImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let next = text
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1)
  return `${next}…`
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片生成失败'))
    }, 'image/png')
  })
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready

  const W = 1080
  const H = 1520
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('图片生成失败')

  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'
  const DISPLAY = '"Space Grotesk", "PingFang SC", "Noto Sans SC", sans-serif'
  const SANS = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif'
  const PAD = 96
  const TEXT = '#f5f5f7'
  const LINE = '#35363f'
  const MICRO = '#b3b9c3'

  // 字号系统：6 档，相邻比 ≥1.17；标签靠字距与颜色分层，数据靠等宽与字重
  const F = { hero: 114, title: 56, data: 48, footer: 36, body: 28, label: 26 }
  const font = (size: number, weight: number, family: string, track = 0) => {
    ctx.font = `${weight} ${size}px ${family}`
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${(size * track).toFixed(1)}px`
  }

  // 背景
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#141519')
  bg.addColorStop(1, '#0a0a0c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W - 80, 0, 0, W - 80, 0, 640)
  glow.addColorStop(0, withAlpha(BRAND.primary, 0.22))
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 720)

  // 头部：头像 + 昵称 / 日期
  const avatarImg = await loadImage(data.avatar)
  let headX = PAD
  if (data.nickname) {
    const size = 128
    const cx = PAD + size / 2
    const cy = 96 + size / 2
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (avatarImg) {
      ctx.drawImage(avatarImg, PAD, 96, size, size)
    } else {
      ctx.fillStyle = BRAND.primary
      ctx.fillRect(PAD, 96, size, size)
      ctx.fillStyle = '#121212'
      font(48, 700, DISPLAY)
      ctx.textAlign = 'center'
      ctx.fillText(data.nickname.trim().slice(0, 1) || BRAND.name[0], cx, cy + 18)
      ctx.textAlign = 'left'
    }
    ctx.restore()
    headX = PAD + size + 32
  }

  ctx.fillStyle = TEXT
  font(F.title, 700, DISPLAY)
  ctx.fillText(clipText(ctx, data.nickname ?? '训练成绩', 480), headX, 176)
  ctx.fillStyle = MICRO
  font(F.body, 400, SANS)
  ctx.fillText(formatDate(data.date), headX, 224)

  ctx.textAlign = 'right'
  ctx.fillStyle = BRAND.primary
  font(F.title, 700, DISPLAY)
  ctx.fillText(BRAND.name, W - PAD, 176)
  ctx.fillStyle = MICRO
  font(F.body, 400, SANS)
  ctx.fillText(BRAND.tagline, W - PAD, 224)
  ctx.textAlign = 'left'

  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 272)
  ctx.lineTo(W - PAD, 272)
  ctx.stroke()

  // 计划名 + 状态
  ctx.fillStyle = MICRO
  font(F.label, 500, SANS, 0.04)
  ctx.fillText('训练计划', PAD, 328)
  ctx.fillStyle = TEXT
  font(F.data, 700, DISPLAY)
  ctx.fillText(clipText(ctx, data.plan, 640), PAD, 384)

  if (data.completed) {
    ctx.fillStyle = withAlpha(BRAND.primary, 0.16)
    roundRect(ctx, W - PAD - 168, 340, 168, 56, 28)
    ctx.fill()
    ctx.fillStyle = BRAND.primary
    font(F.body, 700, SANS)
    ctx.textAlign = 'center'
    ctx.fillText('已完成', W - PAD - 84, 378)
  } else {
    ctx.fillStyle = withAlpha('#f87171', 0.16)
    roundRect(ctx, W - PAD - 168, 340, 168, 56, 28)
    ctx.fill()
    ctx.fillStyle = '#f87171'
    font(F.body, 700, SANS)
    ctx.textAlign = 'center'
    ctx.fillText('未完成', W - PAD - 84, 378)
  }
  ctx.textAlign = 'left'

  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.moveTo(PAD, 456)
  ctx.lineTo(W - PAD, 456)
  ctx.stroke()

  // 主数据：总用时
  ctx.fillStyle = MICRO
  font(F.label, 500, SANS, 0.04)
  ctx.fillText('总用时', PAD, 512)

  ctx.fillStyle = TEXT
  font(F.hero, 700, MONO, -0.02)
  ctx.fillText(formatTime(data.totalTime), PAD - 2, 688)

  ctx.strokeStyle = LINE
  ctx.beginPath()
  ctx.moveTo(PAD, 784)
  ctx.lineTo(W - PAD, 784)
  ctx.stroke()

  // 四项指标
  const colW = (W - PAD * 2) / 4
  data.stats.forEach((item, i) => {
    const x = PAD + colW * i
    ctx.fillStyle = MICRO
    font(F.label, 500, SANS, 0.04)
    ctx.fillText(item.label, x, 840)
    ctx.fillStyle = TEXT
    font(F.data, 700, MONO)
    ctx.fillText(item.value, x, 904)
  })

  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 960)
  ctx.lineTo(W - PAD, 960)
  ctx.stroke()

  // 模块分段
  ctx.fillStyle = MICRO
  font(F.label, 500, SANS, 0.04)
  ctx.fillText('模块用时', PAD, 1016)

  // 行距统一 64，内容顶对齐（短列表的多余空间留在页脚横线之上）
  const rowStart = 1080
  const rowGap = 64
  data.moduleTimes.forEach((t, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = PAD + col * (W - PAD * 2) / 2
    const y = rowStart + row * rowGap
    ctx.fillStyle = MICRO
    font(F.label, 600, SANS, 0.04)
    ctx.fillText(`M${i + 1}`, x, y - 8)
    const timeText = t > 0 ? formatTime(t) : '—'
    ctx.fillStyle = TEXT
    font(F.data, 700, MONO)
    ctx.fillText(timeText, x + 96, y)
    // 进行中的模块：时间不完整，必须标注，避免被误读为已完成的模块用时
    if (i === data.partialModuleIndex) {
      const timeWidth = ctx.measureText(timeText).width
      ctx.fillStyle = '#f87171'
      font(F.body, 600, SANS)
      ctx.fillText('未完成', x + 96 + timeWidth + 16, y)
    }
  })

  // 页脚：FITBEST logo + 联合标语，整体在横线与卡片底边之间垂直居中
  const logoSize = 72
  const footerRule = H - 152
  const footerTop = footerRule + (H - footerRule - logoSize) / 2
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, footerRule)
  ctx.lineTo(W - PAD, footerRule)
  ctx.stroke()

  const logoImg = await loadImage(new URL('fitbest-logo.png', document.baseURI).href)
  if (logoImg) {
    ctx.drawImage(logoImg, PAD, footerTop, logoSize, logoSize)
  } else {
    ctx.fillStyle = BRAND.primary
    roundRect(ctx, PAD, footerTop, logoSize, logoSize, 36)
    ctx.fill()
    ctx.fillStyle = '#121212'
    ctx.font = `700 40px ${DISPLAY}`
    ctx.textAlign = 'center'
    ctx.fillText('F', PAD + logoSize / 2, footerTop + 48)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = TEXT
  font(F.footer, 600, DISPLAY)
  ctx.fillText(
    clipText(ctx, BRAND.slogan, W - PAD * 2 - logoSize - 32),
    PAD + logoSize + 32,
    footerTop + 48,
  )

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

export function shareFileName(data: ShareCardData): string {
  return `${BRAND.id}-${formatTime(data.totalTime).replace(/:/g, '-')}.png`
}

export async function copyText(text: string): Promise<boolean> {
  try {
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
