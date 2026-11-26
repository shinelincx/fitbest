import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Dumbbell,
  ScanLine,
} from 'lucide-react'
import { useTrainingOverview } from '../hooks/useTrainingOverview'
import { MACHINES, EXTERNAL_APPS } from '../mock/data'
import { PIN_MACHINES } from '../mock/pinMachines'
import { formatVolume, weekVolume } from '../utils/strength'
import { useDevices } from '../context/DeviceContext'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import ScanSheet from '../components/ScanSheet'
import { parseEquipmentLabel } from '../ble/equipmentLabel'
import { useToast } from '../components/Toast'
import { WeekBars } from '../components/Charts'
import { formatDate, startOfWeek } from '../utils/stats'
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
  const [scanOpen, setScanOpen] = useState(false)
  const { devices, connectDevice, machineNavigation } = useDevices()
  const { user, sessionExpired } = useAuth()
  const overview = useTrainingOverview(user?.id ?? null, sessionExpired)
  const toast = useToast()
  const navigate = useNavigate()

  const handleScanned = useCallback(async (raw: string) => {
    setScanOpen(false)
    const hit = parseEquipmentLabel(raw, machineNavigation)
    if (!hit) {
      toast(t('无法识别的器械标签'))
      return
    }
    const device = devices[hit.type]
    const alreadyConnected = device.connected && (!hit.name || device.name?.toLowerCase() === hit.name.toLowerCase())
    try {
      if (alreadyConnected || await connectDevice(hit.type, undefined, hit.name || undefined, Boolean(hit.name))) {
        navigate(`/train/${hit.type}`)
      }
    } catch {
      toast(t('连接失败，请重试'))
    }
  }, [connectDevice, devices, machineNavigation, navigate, t, toast])

  const { week, weekly, dayCounts, todayIndex, time: now, loading } = overview
  const recent = overview.all.slice(0, 3)
  const { count: totalCount, durationSec: totalDuration, distanceM: totalDistance } = weekly
  const machineCount = week.filter((item) => item.app === 'cardio').length
  const strengthCount = week.filter((item) => item.app === 'strength').length
  const hyroxCount = week.filter((item) => item.app === 'hyrox').length
  const btweCount = week.filter((item) => item.app === 'btwe').length
  const ws = startOfWeek(now)
  const strengthVolume = weekVolume(overview.strength, (date) => Date.parse(date) >= ws.getTime() && Date.parse(date) <= now.getTime())
  const we = new Date(ws)
  we.setDate(we.getDate() + 6)
  const weekRange = `${ws.getMonth() + 1}.${ws.getDate()}–${we.getMonth() + 1}.${we.getDate()}`

  const stats = [
    { label: '次数', value: `${totalCount}`, unit: '次' },
    { label: '时长', value: `${Math.round(totalDuration / 60)}`, unit: '分钟' },
    { label: '距离', value: `${(totalDistance / 1000).toFixed(1)}`, unit: 'km' },
  ]

  const prefs = getPrefs()
  const [rh, rm] = prefs.reminderTime.split(':').map(Number)
  const reminderDue =
    !loading && prefs.reminderEnabled && !overview.trainedToday && now.getHours() * 60 + now.getMinutes() >= rh * 60 + rm

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
          className="flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border border-border bg-surface px-3 text-[13px] text-text"
        >
          <ScanLine size={16} aria-hidden="true" /> {t('扫码')}
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
      <section className="rounded-md border border-border bg-surface p-4">
        <h2 className="font-display text-xl font-bold">{t('开始训练')}</h2>
        {!user && <p className="mt-1 text-[13px] text-text-sub">{t('游客也可以直接开练，记录保存在本机。')}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/discover" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-text px-3 text-center text-sm font-semibold text-bg">
            {t('搜索设备')} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link to="/machines" className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 text-center text-sm font-semibold">
            {t('浏览器械')}
          </Link>
        </div>
      </section>
      {(!overview.online || overview.failed) && (
        <div role="status" className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-text-sub">
          {!overview.online ? t('当前离线，显示此设备可用的训练记录。') : t('部分训练记录加载失败，已显示此设备可用的记录。')}{' '}
          {overview.online && <button type="button" className="min-h-9 font-semibold underline" onClick={overview.retry}>{t('重试')}</button>}
        </div>
      )}
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
              {loading ? t('正在加载…') : totalCount ? t('已训练 {{count}} 次', { count: totalCount }) : overview.failed ? t('暂未取得完整记录') : t('本周还没开始')}
            </p>
          </div>

          <div className="mt-3">
            <WeekBars values={dayCounts} labels={DAY_LABELS.map((day) => t(day))} todayIndex={todayIndex} />
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

          {hyroxCount || btweCount || strengthCount ? (
            <p className="mt-3 text-[13px] text-text-sub">
              {t('单机 {{machineCount}} 次 · 力量 {{strengthCount}} 次 · HYROX {{hyroxCount}} 次 · BTWE {{btweCount}} 次', {
                machineCount,
                strengthCount,
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

      {/* 赛事入口 */}
      <section className="reveal reveal-3 mt-3">
        <h2 className="font-display text-[20px] font-bold leading-tight">{t('赛事训练')}</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          {EXTERNAL_APPS.map((app) => overview.online ? (
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
          ) : (
            <div key={app.id} className="rounded-md border border-border bg-surface p-4 text-text-sub">
              <p className="font-display text-base font-bold">{app.name}</p>
              <p className="mt-1 text-[13px]">{t('联网后打开赛事应用')}</p>
            </div>
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
            {t('全部记录')} <ChevronRight size={12} />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="mt-2.5 rounded-md border border-dashed border-border p-8 text-center text-xs text-text-sub">
            {loading ? t('正在加载…') : overview.failed || !overview.online ? t('此设备暂无可显示的记录') : t('还没有记录，从上面选择一台器械开始')}
          </div>
        ) : (
          <div className="mt-2.5 overflow-hidden rounded-md border border-border bg-surface">
            {recent.map((s, i) => (
              <Link
                key={`${s.app}:${s.id}`}
                to={`/records${s.app === 'strength' ? '?kind=strength' : s.app === 'hyrox' || s.app === 'btwe' ? '?kind=race' : ''}`}
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {s.app === 'cardio'
                      ? t(MACHINES.find((m) => m.type === s.machine)?.name ?? s.machine)
                      : s.app === 'strength' ? s.exerciseName : s.app.toUpperCase()}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-sub">
                    {t('{{date}} · {{count}} 分钟', {
                      date: formatDate(s.date),
                      count: Math.max(1, Math.round(s.durationSec / 60)),
                    })}
                  </p>
                </div>
                {s.distanceM > 0 && <p className="font-mono text-sm font-bold tabular-nums">{(s.distanceM / 1000).toFixed(2)} km</p>}
              </Link>
            ))}
          </div>
        )}
      </section>
        </div>
      </div>

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScanned}
      />
    </div>
  )
}
