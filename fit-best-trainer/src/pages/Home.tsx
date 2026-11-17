import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Bluetooth,
  ChevronRight,
  Dumbbell,
  Loader2,
  ScanLine,
} from 'lucide-react'
import { fetchSessions, fetchStrengthSessions } from '../api'
import type { MachineSession, StrengthSession } from '../types'
import { MACHINES, EXTERNAL_APPS } from '../mock/data'
import { PIN_MACHINES } from '../mock/pinMachines'
import { formatVolume, weekVolume } from '../utils/strength'
import { useDevices, type DeviceType } from '../context/DeviceContext'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import ScanSheet, { type ScanResult } from '../components/ScanSheet'
import { useToast } from '../components/Toast'
import { WeekBars } from '../components/Charts'
import { formatDate, formatDistance, isThisWeek, startOfWeek } from '../utils/stats'
import { readActivity } from '../utils/activity'
import { getPrefs } from '../utils/prefs'
import { isNative, openExternal } from '../platform/runtime'

// 是否 HD 平板版（由 .env.hd 的 VITE_BUILD=hd 决定）
const IS_HD = import.meta.env.VITE_BUILD === 'hd'

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function GoalLine({ label, current, target, unit }: { label: string; current: number; target: number; unit: string }) {
  const { t } = useTranslation()
  const percent = Math.min(100, Math.round((current / target) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] text-text-sub">{t('本周目标 · {{label}}', { label })}</p>
        <p className="font-mono text-[13px] tabular-nums">
          {current} <span className="text-text-sub">/ {target} {unit}</span>
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<MachineSession[]>([])
  const [strength, setStrength] = useState<StrengthSession[]>([])
  const [loading, setLoading] = useState(true)
  const [scanOpen, setScanOpen] = useState(false)
  const [pendingType, setPendingType] = useState<DeviceType | null>(null)
  const [pendingName, setPendingName] = useState('')
  const { devices, connectDevice } = useDevices()
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  // 监听扫码连接的器械状态，连接成功后跳转到训练准备界面
  useEffect(() => {
    if (!pendingType) return
    const d = devices[pendingType]
    if (d.connected) {
      setPendingType(null)
      setPendingName('')
      navigate(`/train/${pendingType}`)
    } else if (d.status === 'failed') {
      toast(t('连接失败，请重试'))
      setPendingType(null)
      setPendingName('')
    }
  }, [devices, pendingType, navigate, t, toast])

  useEffect(() => {
    Promise.all([fetchSessions(), fetchStrengthSessions()]).then(([s, st]) => {
      setSessions(s)
      setStrength(st)
      setLoading(false)
    })
  }, [])

  const handleScanned = useCallback(({ type, name }: ScanResult) => {
    setScanOpen(false)
    setPendingType(type)
    setPendingName(name)
    connectDevice(type, undefined, name)
  }, [connectDevice, t, toast])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    )
  }

  const week = sessions.filter((s) => isThisWeek(s.date))
  const weekDuration = week.reduce((a, s) => a + s.durationSec, 0)
  const weekDistance = week.reduce((a, s) => a + s.distanceM, 0)
  const weekStrength = strength.filter((s) => isThisWeek(s.date))
  const strengthVolume = weekVolume(strength, isThisWeek)
  const recent = sessions.slice(0, 3)

  // 汇总 HYROX / BTWE 训练摘要（同账号）
  const uid = user?.id ?? 'guest'
  const external = readActivity().filter((a) => a.uid === uid && isThisWeek(a.date))
  const totalCount = week.length + external.length + weekStrength.length
  const totalDuration =
    weekDuration + external.reduce((a, s) => a + s.durationSec, 0) + weekStrength.reduce((a, s) => a + s.durationSec, 0)
  const totalDistance = weekDistance + external.reduce((a, s) => a + s.distanceM, 0)
  const hyroxCount = external.filter((a) => a.app === 'hyrox').length
  const btweCount = external.filter((a) => a.app === 'btwe').length

  const todayIdx = (new Date().getDay() + 6) % 7
  const dayCounts = Array(7).fill(0) as number[]
  week.forEach((s) => {
    const idx = (new Date(s.date).getDay() + 6) % 7
    dayCounts[idx] += 1
  })
  external.forEach((a) => {
    dayCounts[(new Date(a.date).getDay() + 6) % 7] += 1
  })
  weekStrength.forEach((s) => {
    dayCounts[(new Date(s.date).getDay() + 6) % 7] += 1
  })

  const ws = startOfWeek()
  const we = new Date(ws)
  we.setDate(we.getDate() + 6)
  const weekRange = `${ws.getMonth() + 1}.${ws.getDate()}–${we.getMonth() + 1}.${we.getDate()}`

  const stats = [
    { label: '次数', value: `${totalCount}`, unit: '次' },
    { label: '时长', value: `${Math.round(totalDuration / 60)}`, unit: '分钟' },
    { label: '距离', value: `${(totalDistance / 1000).toFixed(1)}`, unit: 'km' },
  ]

  const prefs = getPrefs()
  const now = new Date()
  const [rh, rm] = prefs.reminderTime.split(':').map(Number)
  const trainedToday =
    sessions.some((s) => new Date(s.date).toDateString() === now.toDateString()) ||
    strength.some((s) => new Date(s.date).toDateString() === now.toDateString()) ||
    external.some((a) => new Date(a.date).toDateString() === now.toDateString())
  const reminderDue =
    prefs.reminderEnabled && !trainedToday && now.getHours() * 60 + now.getMinutes() >= rh * 60 + rm

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      {/* 顶栏 */}
      <header className="reveal reveal-1 flex items-center justify-between gap-3">
        {user ? (
          <Link to="/profile" className="flex min-w-0 items-center gap-3">
            <Avatar user={user} size={56} className="border border-border" />
            <span className="min-w-0">
              <p className="text-sm text-text-sub">{t(greeting())}</p>
              <h1 className="truncate font-display text-[20px] font-bold">
                {user.nickname}
                <span className="ml-0.5">{t('，一起FITBEST')}</span>
              </h1>
            </span>
          </Link>
        ) : (
          <Link to="/login" className="flex min-w-0 items-center gap-3">
            <img src="./logo.png" alt="FITBEST" className="h-14 w-14 shrink-0 rounded-full object-contain" />
            <span className="min-w-0">
              <p className="text-sm text-text-sub">{t(greeting())}</p>
              <h1 className="truncate font-display text-[20px] font-bold">
                {t('训练者')}
                <span className="ml-0.5">{t('，一起FITBEST')}</span>
              </h1>
            </span>
          </Link>
        )}
        <button
          type="button"
          aria-label={t('扫码')}
          onClick={() => setScanOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
        >
          <ScanLine size={16} />
        </button>
      </header>

      {reminderDue && (
        <Link
          to="/machines"
          className="reveal reveal-2 mt-4 flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium">{t('今天的训练还没开始')}</p>
            <p className="mt-0.5 text-[13px] text-text-sub">{t('提醒时间 {{time}}', { time: prefs.reminderTime })}</p>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-primary">{t('去训练')}</span>
        </Link>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 hd:lg:mt-6 hd:lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-6">
        <div className="space-y-4 [&>*:first-child]:mt-0 hd:lg:space-y-5">
      {/* 本周概览 */}
      <section className="reveal reveal-2">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-[20px] font-bold leading-tight">{t('训练概览')}</h1>
          <p className="font-mono text-[13px] tabular-nums text-text-sub">{weekRange}</p>
        </div>

        <div className="mt-3 rounded-md border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] text-text-sub">{t('本周训练')}</p>
            <p className="text-[13px] text-text-sub">
              {totalCount ? t('已训练 {{count}} 次', { count: totalCount }) : t('本周还没开始')}
            </p>
          </div>

          <div className="mt-3">
            <WeekBars values={dayCounts} labels={DAY_LABELS.map((day) => t(day))} todayIndex={todayIdx} />
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
            {stats.map((it, i) => (
              <div key={it.label} className={i === 0 ? 'pr-3' : i === 2 ? 'pl-3' : 'px-3'}>
                <p className="font-mono text-2xl font-bold leading-none tabular-nums">
                  {it.value}
                  <span className="ml-0.5 text-[11px] font-normal text-text-sub">{t(it.unit)}</span>
                </p>
                <p className="mt-1.5 text-[13px] text-text-sub">{t(it.label)}</p>
              </div>
            ))}
          </div>

          {external.length || weekStrength.length ? (
            <p className="mt-3 text-[13px] text-text-sub">
              {t('单机 {{machineCount}} 次 · 力量 {{strengthCount}} 次 · HYROX {{hyroxCount}} 次 · BTWE {{btweCount}} 次', {
                machineCount: week.length,
                strengthCount: weekStrength.length,
                hyroxCount,
                btweCount,
              })}
            </p>
          ) : null}

          {user && (user.goalSessions || user.goalMinutes) ? (
            <div className="mt-3 space-y-2.5 border-t border-border pt-3">
              {user.goalSessions ? (
                <GoalLine label={t('次数')} current={totalCount} target={user.goalSessions} unit={t('次')} />
              ) : null}
              {user.goalMinutes ? (
                <GoalLine label={t('时长')} current={Math.round(totalDuration / 60)} target={user.goalMinutes} unit={t('分钟')} />
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* 主操作：搜索智能设备 */}
      <Link
        to="/discover"
        className="reveal reveal-2 flex items-center justify-between rounded-md bg-text px-5 py-4 text-bg transition-transform active:scale-[0.98] hd:lg:px-6 hd:lg:py-5"
      >
        <div>
          <p className="font-display text-base font-bold hd:lg:text-lg">{t('搜索智能设备')}</p>
          <p className="mt-0.5 text-[13px] text-bg/55">{t('自动识别器械类型 · 一键连接开练')}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg/10 text-primary hd:lg:h-11 hd:lg:w-11">
          <ArrowRight size={18} />
        </span>
      </Link>

      {/* 赛事入口 */}
      <section className="reveal reveal-3 mt-3">
        <h2 className="font-display text-[20px] font-bold leading-tight">{t('赛事训练')}</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          {EXTERNAL_APPS.map((app) => (
            <a
              key={app.id}
              href={IS_HD ? `${app.href}HD/` : app.href}
              onClick={(event) => {
                if (!isNative) return
                event.preventDefault()
                const path = IS_HD ? `${app.href}HD/` : app.href
                const url = new URL(path, import.meta.env.VITE_PUBLIC_WEB_URL || 'https://cloud.thinkfiter.com/').href
                void openExternal(url).catch(() => {
                  toast(t('无法打开赛事页面'))
                })
              }}
              className="rounded-md border border-border bg-surface p-4 transition-transform active:scale-[0.98]"
            >
              <div className="flex items-center justify-end">
                <ArrowUpRight size={14} className="shrink-0 text-primary" />
              </div>
              <p className="mt-3 font-display text-base font-bold">{app.name}</p>
              <p className="mt-1 text-[14px] leading-snug text-text-sub">
                {t(app.subtitle)}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* 力量训练 */}
      <section className="reveal reveal-3 mt-3">
        <Link
          to="/strength"
          className="flex items-center gap-3 rounded-md border border-border bg-surface p-4 transition-transform active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-primary">
            <Dumbbell size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-bold">{t('力量训练')}</p>
            <p className="mt-0.5 text-[13px] text-text-sub">
              {t('{{count}} 台插片式器械 · 智能插销自动记录', { count: PIN_MACHINES.length })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-bold tabular-nums">{formatVolume(strengthVolume)}</p>
            <p className="mt-0.5 text-[11px] text-text-sub">{t('本周容量')}</p>
          </div>
          <ChevronRight size={14} className="shrink-0 text-text-sub" />
        </Link>
      </section>
        </div>

        <div className="space-y-4 [&>*:first-child]:mt-0 hd:lg:space-y-5">
      {/* 最近训练 */}
      <section className="reveal reveal-6 mt-6 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[20px] font-bold leading-tight">{t('最近训练')}</h2>
          <Link to="/records" className="flex items-center text-[14px] text-text-sub">
            {t('全部')} <ChevronRight size={12} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="mt-2.5 rounded-md border border-dashed border-border p-8 text-center text-xs text-text-sub">
            {t('还没有记录，从上面选择一台器械开始')}
          </div>
        ) : (
          <div className="mt-2.5 overflow-hidden rounded-md border border-border bg-surface">
            {recent.map((s, i) => (
              <Link
                key={s.id}
                to="/records"
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(MACHINES.find((m) => m.type === s.machine)?.name ?? s.machine)}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-sub">
                    {t('{{date}} · {{count}} 分钟', {
                      date: formatDate(s.date),
                      count: Math.max(1, Math.round(s.durationSec / 60)),
                    })}
                  </p>
                </div>
                <p className="font-mono text-sm font-bold tabular-nums">{formatDistance(s.distanceM)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
        </div>
      </div>

      {pendingType && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55">
          <div className="flex w-64 flex-col items-center rounded-2xl bg-bg px-6 py-8">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <Loader2 size={40} className="animate-spin text-primary" />
              <Bluetooth size={20} className="absolute text-primary" />
            </div>
            <p className="mt-4 text-[15px] font-semibold">{t('正在连接')}</p>
            <p className="mt-1 font-mono text-[16px] font-bold tracking-wide text-text">
              {pendingName || t('设备')}
            </p>
            <p className="mt-1 text-[12px] text-text-sub">{t('蓝牙连接中，请稍候…')}</p>
          </div>
        </div>
      )}

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
      />
    </div>
  )
}
