import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Flame,
  Timer,
  Footprints,
  Trophy,
  ChevronRight,
  PlayCircle,
  CalendarDays,
} from 'lucide-react'
import { fetchUser, fetchSessions } from '../api'
import type { User, SessionRecord } from '../types'
import { formatTime } from '../utils/format'
import { getActivePlan, planNameOf } from '../utils/planChat'
import { getSsoUser } from '../utils/sso'

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchUser(), fetchSessions()]).then(([u, s]) => {
      setUser(u)
      setSessions(s)
      setLoading(false)
    })
  }, [])

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    )
  }

  const plan = getActivePlan()
  const sso = getSsoUser()
  const displayName = sso?.nickname ?? user.name
  const avatarSrc = sso?.avatar

  const completed = sessions.filter((s) => s.completed)
  const best = completed.length
    ? Math.min(...completed.map((s) => s.totalTime))
    : user.stats.bestFullTime

  const stats = [
    { label: '连续打卡', value: `${user.stats.streak}天`, icon: Flame, color: 'text-warning' },
    { label: '累计公里', value: `${user.stats.totalKm}`, icon: Footprints, color: 'text-accent' },
    { label: '训练次数', value: `${user.stats.totalSessions}`, icon: Timer, color: 'text-primary' },
    { label: '最佳完赛', value: formatTime(best), icon: Trophy, color: 'text-success' },
  ]

  const recent = sessions.slice(0, 3)

  return (
    <div className="px-5 pt-5 hd:lg:grid hd:lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-x-6 hd:lg:px-8 hd:lg:pt-7">
      {/* 头部 */}
      <header className="reveal reveal-1 mb-6 flex items-center gap-3 hd:lg:col-start-1 hd:lg:row-start-1 hd:lg:mb-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/10 font-display text-lg font-bold text-primary shadow-[0_0_16px_rgba(163,230,53,0.15)]">
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            user.avatar
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-text-sub">{greeting()}</p>
          <h1 className="truncate font-display text-[20px] font-bold hd:lg:text-[26px]">
            {displayName}
            <span className="ml-0.5">，一起BTWE</span>
          </h1>
        </div>
      </header>

      {/* 今日训练 CTA */}
      <Link
        to="/train"
        className="reveal reveal-2 mb-3 block overflow-hidden rounded-radius-lg border border-border bg-gradient-to-br from-surface to-surface-2 p-5 shadow-card transition-transform active:scale-[0.98] hd:lg:col-start-1 hd:lg:row-start-2 hd:lg:mb-5 hd:lg:p-6"
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary">今日训练 · 当前计划</p>
            <h2 className="mt-1 truncate font-display text-xl font-bold hd:lg:text-2xl">{plan.name}</h2>
            <p className="mt-1 text-sm text-text-sub">4 模块 · 3.2km 跑 + 8 项功能训练</p>
          </div>
          <PlayCircle size={48} className="shrink-0 text-primary" strokeWidth={1.5} />
        </div>
      </Link>

      {/* 计划入口 */}
      <Link
        to="/plans"
        className="reveal reveal-2 mb-6 flex items-center justify-between rounded-radius-md border border-border bg-surface px-4 py-3 text-sm transition-colors active:bg-surface-2 hd:lg:col-start-2 hd:lg:row-start-1 hd:lg:mb-5 hd:lg:px-5 hd:lg:py-4"
      >
        <span className="flex items-center gap-2 text-text-sub">
          <CalendarDays size={16} className="text-primary" />
          {plan.durationWeeks} 周 · {plan.sessionsPerWeek} 次/周
        </span>
        <span className="flex items-center gap-0.5 text-xs text-primary">
          切换计划 <ChevronRight size={14} />
        </span>
      </Link>

      {/* 数据统计 */}
      <section className="reveal reveal-3 mb-6 hd:lg:col-start-1 hd:lg:row-start-3 hd:lg:mb-0">
        <h3 className="mb-3 font-display text-base font-bold hd:lg:mb-4 hd:lg:text-lg">本周数据</h3>
        <div className="grid grid-cols-2 gap-3 hd:lg:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.label} className="rounded-radius-md border border-border bg-surface p-4">
                <Icon size={20} className={s.color} />
                <p className="mt-2 font-display text-2xl font-bold hd:lg:whitespace-nowrap hd:lg:text-[22px]">{s.value}</p>
                <p className="text-xs text-text-sub">{s.label}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* 最近训练 */}
      <section className="reveal reveal-4 mb-6 hd:lg:col-start-2 hd:lg:row-start-2 hd:lg:row-span-2 hd:lg:mb-0">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold hd:lg:text-lg">最近训练</h3>
          <Link to="/records" className="flex items-center text-xs text-text-sub">
            全部 <ChevronRight size={14} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <Link
            to="/train"
            className="block rounded-radius-md border border-dashed border-border p-8 text-center text-sm text-text-sub"
          >
            还没有训练记录，点击开始第一次 BTWE 训练
          </Link>
        ) : (
          <div className="space-y-2">
            {recent.map((s) => (
              <Link
                key={s.id}
                to="/records"
                className="flex items-center justify-between rounded-radius-md border border-border bg-surface p-3 transition-colors active:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{planNameOf(s.planId)}</p>
                  <p className="text-xs text-text-sub">
                    {s.date} · {s.completed ? '已完成' : '未完成'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-primary">{formatTime(s.totalTime)}</p>
                  <p className="text-[10px] text-text-sub">4 模块</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
