import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  ChevronRight,
  ClipboardList,
  Flame,
  Settings,
  Share2,
  Target,
  Trophy,
} from 'lucide-react'
import Avatar from '../components/Avatar'
import WeeklyShareSheet from '../components/WeeklyShareSheet'
import { useAuth } from '../context/AuthContext'
import { fetchSessions } from '../api'
import type { MachineSession } from '../types'
import { maskContact } from '../utils/auth'
import {
  formatDistance,
  formatDuration,
  isThisWeek,
  personalBests,
  summarize,
  trainingStreak,
} from '../utils/stats'

function GoalBar({ label, current, target, unit }: { label: string; current: number; target: number; unit: string }) {
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] text-text-sub">{label}</p>
        <p className="font-mono text-[13px] text-text">
          {current} <span className="text-text-sub">/ {target} {unit}</span>
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function Row(props: { to: string; icon: ReactNode; label: string; desc: string }) {
  return (
    <Link to={props.to} className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{props.label}</span>
        <span className="mt-0.5 block truncate text-[13px] text-text-sub">{props.desc}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-sub" />
    </Link>
  )
}

export default function Profile() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<MachineSession[]>([])
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    fetchSessions().then(setSessions)
  }, [])

  const summary = summarize(sessions)
  const week = sessions.filter((s) => isThisWeek(s.date))
  const weekMinutes = Math.round(week.reduce((a, s) => a + s.durationSec, 0) / 60)
  const streak = trainingStreak(sessions)
  const bests = personalBests(sessions).slice(0, 4)
  const goalSessions = user?.goalSessions ?? 0
  const goalMinutes = user?.goalMinutes ?? 0

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 mb-4 flex items-start justify-between gap-3 hd:lg:mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] font-bold leading-tight hd:lg:text-[26px]">{t('我的')}</h1>
          <p className="mt-1 text-xs text-text-sub hd:lg:text-[13px]">{t('资料 · 目标 · 训练数据')}</p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={t('通知')}
            aria-expanded={noticeOpen}
            onClick={() => setNoticeOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text"
          >
            <Bell size={20} />
          </button>
          {noticeOpen && (
            <div className="absolute right-0 top-10 z-50 w-40 rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] text-text-sub shadow-card">
              {t('暂无新通知')}
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 hd:lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-6">
        {/* ============ 左栏：身份 + 目标 + 累计 ============ */}
        <div className="space-y-4 hd:lg:space-y-5">
          {/* 用户卡片 */}
          {user ? (
            <header className="reveal reveal-2 flex items-center gap-3 rounded-lg border border-border bg-surface p-5 hd:lg:gap-5 hd:lg:p-6">
              <Avatar user={user} size={64} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-[20px] font-bold hd:lg:text-[24px]">{user.nickname}</h2>
                <p className="mt-0.5 text-xs text-text-sub hd:lg:mt-1 hd:lg:text-[13px]">{maskContact(user)}</p>
              </div>
              <Link
                to="/profile/edit"
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[13px] text-text-sub hd:lg:px-4 hd:lg:py-2 hd:lg:text-sm"
              >
                {t('编辑')}
              </Link>
            </header>
          ) : (
            <>
              <header className="reveal reveal-2 flex items-center gap-3 rounded-lg border border-border bg-surface p-5 hd:lg:gap-5 hd:lg:p-6">
                <img src="./logo.png" alt="FITBEST" className="h-[70px] w-[70px] shrink-0 rounded-full object-contain hd:lg:h-[88px] hd:lg:w-[88px]" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-bold hd:lg:text-[24px]">{t('FITBEST 训练者')}</h2>
                  <p className="mt-0.5 text-xs text-text-sub hd:lg:mt-1 hd:lg:text-[13px]">{t('登录后可编辑资料、设置目标并备份数据')}</p>
                </div>
              </header>
              <Link
                to="/login"
                className="reveal reveal-3 flex items-center justify-between rounded-md bg-text px-4 py-3.5 text-sm font-semibold text-bg transition-transform active:scale-[0.98]"
              >
                {t('登录 / 注册')}
                <ArrowRight size={16} />
              </Link>
            </>
          )}

          {/* 本周目标 */}
          {user && (goalSessions > 0 || goalMinutes > 0) && (
            <section className="reveal reveal-3 rounded-md border border-border bg-surface p-4 hd:lg:p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Target size={15} className="text-primary" /> {t('本周目标')}
                </p>
                <Link to="/profile/edit" className="text-[13px] text-text-sub">
                  {t('调整')}
                </Link>
              </div>
              {goalSessions > 0 && <GoalBar label={t('训练次数')} current={week.length} target={goalSessions} unit={t('次')} />}
              {goalMinutes > 0 && <GoalBar label={t('训练时长')} current={weekMinutes} target={goalMinutes} unit={t('分钟')} />}
            </section>
          )}

          {/* 累计数据 */}
          <section className="reveal reveal-4">
            <h2 className="mb-2 font-display text-base font-bold hd:lg:mb-3 hd:lg:text-lg">{t('累计数据')}</h2>
            <div className="grid grid-cols-2 gap-2 hd:lg:gap-3">
              {[
                { label: '总次数', value: `${summary.count}`, unit: '次' },
                { label: '总时长', value: formatDuration(summary.durationSec) },
                { label: '总距离', value: formatDistance(summary.distanceM) },
                { label: '总消耗', value: `${summary.calories}`, unit: 'kcal' },
              ].map((it) => (
                <div key={it.label} className="rounded-md border border-border bg-surface px-3 py-3 hd:lg:px-4 hd:lg:py-4">
                  <p className="whitespace-nowrap font-mono text-lg font-bold tabular-nums hd:lg:text-xl">
                    {it.value}
                    {it.unit && <span className="ml-1 font-body text-[11px] font-normal text-text-sub">{t(it.unit)}</span>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-sub">{t(it.label)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ============ 右栏：成长 + 快捷入口 + 设置 ============ */}
        <div className="space-y-4 hd:lg:space-y-5">
          {/* 成长数据 */}
          <section className="reveal reveal-5 rounded-md border border-border bg-surface p-4 hd:lg:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-text-sub">{t('连续训练')}</p>
                <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums hd:lg:text-3xl">
                  {streak} <span className="font-body text-[13px] font-normal text-text-sub">{t('天')}</span>
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary hd:lg:h-12 hd:lg:w-12">
                <Flame size={18} />
              </span>
            </div>
            {bests.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                {bests.map((it) => (
                  <div key={it.label} className="flex items-center gap-2">
                    <Trophy size={13} className="shrink-0 text-text-sub" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[13px] font-semibold">{it.value}</p>
                      <p className="text-[11px] text-text-sub">{t(it.label)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 border-t border-border pt-3 text-[13px] text-text-sub">
                {t('完成首次训练后，这里会记录你的最长距离与最长时长。')}
              </p>
            )}

            <button
              onClick={() => setWeeklyOpen(true)}
              disabled={week.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-[15px] font-medium transition-colors active:bg-surface-2 disabled:opacity-50 hd:lg:py-3"
            >
              <Share2 size={16} /> {week.length > 0 ? t('生成本周战报') : t('本周还没有训练')}
            </button>
          </section>

          {/* 快捷入口 */}
          <section className="reveal reveal-6">
            <Link to="/records" className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-3.5 hd:lg:px-4 hd:lg:py-4">
              <ClipboardList size={18} className="shrink-0 text-primary hd:lg:h-5 hd:lg:w-5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('训练记录')}</p>
                <p className="mt-0.5 text-[13px] text-text-sub">{t('全部单机训练')}</p>
              </div>
            </Link>
          </section>

          {/* 设置入口 */}
          <section className="reveal reveal-7 overflow-hidden rounded-md border border-border bg-surface">
            <Row to="/profile/settings" icon={<Settings size={16} />} label={t('设置')} desc={t('通知 · 安全 · 数据 · 偏好 · 关于')} />
          </section>
        </div>
      </div>

      <WeeklyShareSheet
        open={weeklyOpen}
        onClose={() => setWeeklyOpen(false)}
        sessions={sessions}
        nickname={user?.nickname}
        avatar={user?.avatar}
      />
    </div>
  )
}
