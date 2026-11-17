import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, CheckCircle2, ChevronRight, X, ListChecks, Sparkles, Wand2, Dumbbell } from 'lucide-react'
import { fetchPlans } from '../api'
import type { Plan } from '../types'
import { levelLabel } from '../utils/format'
import { EXERCISES } from '../mock/data'
import { useToast } from '../components/Toast'
import { getCustomPlan, type CustomPlan } from '../utils/planChat'

const PLAN_KEY = 'btwe-selected-plan'

export default function Plans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>(
    localStorage.getItem(PLAN_KEY) || 'plan-intermediate'
  )
  const [detail, setDetail] = useState<Plan | null>(null)
  const [custom] = useState<CustomPlan | null>(getCustomPlan())
  const [showCustom, setShowCustom] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => {
    fetchPlans().then((p) => {
      setPlans(p)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    )
  }

  const accentMap: Record<string, string> = {
    primary: 'border-primary/40 bg-primary/5',
    accent: 'border-accent/40 bg-accent/5',
    danger: 'border-danger/40 bg-danger/5',
  }

  function choose(plan: Plan) {
    setSelected(plan.id)
    localStorage.setItem(PLAN_KEY, plan.id)
    toast(`已切换到「${plan.name}」`)
  }

  function chooseCustom() {
    if (!custom) return
    setSelected('plan-custom')
    localStorage.setItem(PLAN_KEY, 'plan-custom')
    toast('已启用教练定制计划')
  }

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 mb-6">
        <h1 className="font-display text-2xl font-bold hd:lg:text-[26px]">训练计划</h1>
        <p className="mt-1 text-sm text-text-sub">和数字人教练定制，或直接选择备赛方案</p>
      </header>

      {/* 教练定制入口 / 已定制计划 */}
      {custom ? (
        <div className="reveal reveal-1 mb-4 rounded-radius-lg border border-primary/40 bg-primary/5 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                <Sparkles size={11} /> 林晓为你定制
              </p>
              <h2 className="mt-1 font-display text-lg font-bold">{custom.name}</h2>
            </div>
            {selected === 'plan-custom' && (
              <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-bg">
                <CheckCircle2 size={10} /> 使用中
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-sub">{custom.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {custom.highlights.map((h) => (
              <span key={h} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-text-sub">
                {h}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowCustom(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md border border-border bg-surface px-3 py-2.5 text-sm font-medium"
            >
              <Calendar size={14} /> 查看周计划
            </button>
            <button
              onClick={() => navigate('/plan-coach')}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md border border-border bg-surface px-3 py-2.5 text-sm text-text-sub"
            >
              <Wand2 size={14} /> 重新定制
            </button>
            <button
              onClick={chooseCustom}
              disabled={selected === 'plan-custom'}
              className="flex-1 rounded-radius-md bg-primary px-3 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
            >
              {selected === 'plan-custom' ? '当前计划' : '使用'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => navigate('/plan-coach')}
          className="reveal reveal-1 mb-4 flex w-full items-center gap-2 rounded-radius-lg border border-dashed border-primary/50 bg-primary/5 p-4 text-left transition-transform active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-text">和数字人教练定制计划</p>
            <p className="mt-0.5 text-xs text-text-sub">6 个问题，生成专属 8–10 周备赛方案</p>
          </div>
          <ChevronRight size={18} className="shrink-0 text-primary" />
        </button>
      )}

      <div className="space-y-4 hd:lg:grid hd:lg:grid-cols-2 hd:lg:items-start hd:lg:gap-5 hd:lg:space-y-0">
        {plans.map((plan, i) => {
          const isSelected = selected === plan.id
          return (
            <div
              key={plan.id}
              className={`reveal reveal-${i + 1} rounded-radius-lg border bg-surface p-5 transition-all ${
                isSelected ? accentMap[plan.accent] : 'border-border'
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{plan.name}</h2>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-sub">
                      {levelLabel(plan.level)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-text-sub">{plan.description}</p>
                </div>
                {isSelected && <CheckCircle2 size={22} className="shrink-0 text-primary" />}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {plan.highlights.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-surface-2 px-3 py-1 text-[11px] text-text-sub"
                  >
                    {h}
                  </span>
                ))}
              </div>

              <div className="mb-4 flex items-center gap-5 text-xs text-text-sub">
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {plan.durationWeeks} 周
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={14} /> {plan.sessionsPerWeek} 次/周
                </span>
                <span className="flex items-center gap-1">
                  4 模块 × (800m + 心肺 + 力量)
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDetail(plan)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md border border-border bg-surface-2 py-2.5 text-sm font-medium text-text"
                >
                  <ListChecks size={15} /> 模块明细
                </button>
                <button
                  onClick={() => choose(plan)}
                  className={`flex-1 rounded-radius-md py-2.5 text-sm font-semibold transition-all ${
                    isSelected ? 'bg-primary text-bg' : 'border border-border bg-surface-2 text-text'
                  }`}
                >
                  {isSelected ? '当前计划' : '选择此计划'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => navigate('/train')}
        className="reveal reveal-4 mt-6 flex w-full items-center justify-center gap-2 rounded-radius-md bg-primary py-3 font-semibold text-bg transition-transform active:scale-[0.98]"
      >
        开始今日训练 <ChevronRight size={18} />
      </button>

      {/* 模块明细弹层 */}
      {detail && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/60"
          onClick={() => setDetail(null)}
        >
          <div
            className="sheet-up max-h-[80vh] w-full overflow-y-auto rounded-t-[24px] border-t border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">{detail.name}</h3>
                <p className="mt-1 text-xs text-text-sub">
                  {detail.durationWeeks} 周 · 每周 {detail.sessionsPerWeek} 次 · 共 4 模块
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-sub"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {detail.modules.map((m) => {
                const cardio = EXERCISES.find((e) => e.id === m.cardioExerciseId)
                const strength = EXERCISES.find((e) => e.id === m.strengthExerciseId)
                return (
                  <div key={m.order} className="rounded-radius-md border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-primary">模块 {m.order}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-sub">跑步</span>
                      <span className="font-mono">{m.runDistance} m</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-text-sub">{cardio?.name ?? m.cardioExerciseId}</span>
                      <span className="font-mono">
                        {cardio ? `${cardio.target} ${cardio.metric === 'distance' ? 'm' : '次'}` : '—'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-text-sub">{strength?.name ?? m.strengthExerciseId}</span>
                      <span className="font-mono">
                        {strength ? `${strength.target} ${strength.metric === 'distance' ? 'm' : '次'}` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => {
                choose(detail)
                setDetail(null)
              }}
              className="mt-4 w-full rounded-radius-md bg-primary py-3 font-semibold text-bg"
            >
              {selected === detail.id ? '当前计划' : '使用此计划'}
            </button>
          </div>
        </div>
      )}

      {/* 教练定制周计划弹层 */}
      {showCustom && custom && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/60"
          onClick={() => setShowCustom(false)}
        >
          <div
            className="sheet-up max-h-[80vh] w-full overflow-y-auto rounded-t-[24px] border-t border-border bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                  <Sparkles size={11} /> 林晓为你定制
                </p>
                <h3 className="mt-1 font-display text-lg font-bold">{custom.name}</h3>
                <p className="mt-1 text-xs text-text-sub">
                  {custom.durationWeeks} 周 · 每周 {custom.sessionsPerWeek} 次 · 目标 {custom.targetFinish}
                </p>
              </div>
              <button
                onClick={() => setShowCustom(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-sub"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-radius-md bg-surface-2 p-3">
              <p className="mb-1 text-xs font-semibold text-warning">教练建议</p>
              <ul className="space-y-1">
                {custom.advice.map((a, i) => (
                  <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-text-sub">
                    <span className="text-primary">·</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              {custom.weeklyPlan.map((w) => (
                <div key={w.week} className="rounded-radius-md border border-border p-3">
                  <p className="text-xs font-semibold text-primary">
                    第 {w.week} 周 · {w.focus}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {w.sessions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-text-sub">
                        <Dumbbell size={11} className="mt-0.5 shrink-0 text-accent" />
                        <span>
                          <span className="text-text">{s.title}</span> · {s.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                chooseCustom()
                setShowCustom(false)
              }}
              className="mt-4 w-full rounded-radius-md bg-primary py-3 font-semibold text-bg"
            >
              {selected === 'plan-custom' ? '当前计划' : '使用此计划'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
