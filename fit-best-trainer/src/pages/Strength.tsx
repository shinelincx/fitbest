import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { fetchStrengthSessions } from '../api'
import type { StrengthSession } from '../types'
import { PIN_MACHINES } from '../mock/pinMachines'
import { MUSCLE_LABELS } from '../mock/strength'
import { EXERCISE_MAP } from '../mock/strength'
import { formatVolume, weekVolume } from '../utils/strength'
import { isThisWeek } from '../utils/stats'

export default function Strength() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<StrengthSession[]>([])

  useEffect(() => {
    fetchStrengthSessions().then(setSessions)
  }, [])

  const weekCount = sessions.filter((s) => isThisWeek(s.date)).length
  const volume = weekVolume(sessions, isThisWeek)

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1">
        <h1 className="font-display text-[20px] font-bold leading-tight">{t('力量训练')}</h1>
        <p className="mt-1 text-xs text-text-sub">{t('插片式器械，连接智能插销自动记录')}</p>
      </header>

      <div className="reveal reveal-2 mt-4 grid grid-cols-2 gap-3 hd:lg:max-w-[440px] hd:lg:gap-4">
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-[13px] text-text-sub">{t('本周训练')}</p>
          <p className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums">
            {weekCount}
            <span className="ml-1 text-[11px] font-normal text-text-sub">{t('次')}</span>
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-[13px] text-text-sub">{t('本周容量')}</p>
          <p className="mt-1 font-mono text-2xl font-bold leading-none tabular-nums">
            {formatVolume(volume)}
          </p>
        </div>
      </div>

      <section className="reveal reveal-2 mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-connected" />
            {t('智能插销器械')}
          </h2>
          <Link to="/pins" className="text-[12px] text-text-sub">
            {t('管理绑定')}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 pb-2 hd:lg:grid-cols-4 hd:lg:gap-3 xl:grid-cols-4">
          {PIN_MACHINES.map((m) => {
            const ex = EXERCISE_MAP[m.exerciseId]
            return (
              <Link
                key={m.id}
                to={`/pin/${m.id}`}
                className="rounded-md border border-border bg-surface p-3.5 transition-transform active:scale-[0.97]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-surface-2 text-primary">
                    <Dumbbell size={16} />
                  </div>
                  <ChevronRight size={14} className="mt-1 text-text-sub" />
                </div>
                <p className="mt-2 truncate text-[14px] font-medium">{t(m.name)}</p>
                <p className="mt-0.5 truncate text-[11px] text-text-sub">
                  {m.plateKg} kg × {m.plates} {t('片')}
                  {ex ? ` · ${ex.muscles.map((g) => t(MUSCLE_LABELS[g])).join('/')}` : ''}
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-connected/10 px-1.5 py-0.5 text-[10px] text-connected">
                  {t('连接插销')}
                </p>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
