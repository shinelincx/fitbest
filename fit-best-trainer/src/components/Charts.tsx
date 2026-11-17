import { useTranslation } from 'react-i18next'

// 迷你图表 —— 首页周概览与器械行内趋势

export function WeekBars({
  values,
  labels,
  todayIndex,
}: {
  values: number[]
  labels: string[]
  todayIndex: number
}) {
  const { t } = useTranslation()
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-1">
      {values.map((v, i) => {
        const active = i === todayIndex
        const h = v > 0 ? Math.max(10, Math.round((v / max) * 100)) : 3
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-9 w-full items-end">
              <div
                className={`w-full rounded-[2px] ${
                  active ? 'bg-primary' : v > 0 ? 'bg-text/20' : 'bg-border'
                }`}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className={`text-[11px] ${active ? 'font-semibold text-primary' : 'text-text-sub'}`}>
              {t(labels[i])}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MiniRing({ values }: { values: number[] }) {
  const trained = values.filter((v) => v > 0).length
  const circumference = 2 * Math.PI * 8
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0" aria-hidden="true">
      <circle cx="11" cy="11" r="8" fill="none" stroke="#e3e6ea" strokeWidth="2.5" />
      {trained > 0 && (
        <circle
          cx="11"
          cy="11"
          r="8"
          fill="none"
          stroke="#f8481f"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(trained / 7) * circumference} ${circumference}`}
          transform="rotate(-90 11 11)"
        />
      )}
    </svg>
  )
}
