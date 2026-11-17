import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  Sparkles,
  CalendarDays,
  Target,
  CheckCircle2,
  RotateCcw,
  ChevronDown,
  Dumbbell,
} from 'lucide-react'
import { COACH } from '../utils/coach'
import {
  DEFAULT_ANSWERS,
  EQUIPMENT_OPTIONS,
  WEAK_OPTIONS,
  fromRemotePlan,
  generateCustomPlan,
  saveCustomPlan,
  selectPlan,
  type CustomPlan,
  type PlanAnswers,
} from '../utils/planChat'
import { generateRemotePlan } from '../api'
import { useToast } from '../components/Toast'

interface Msg {
  id: number
  role: 'coach' | 'user'
  text: string
}

type StepKey = 'goal' | 'experience' | 'days' | 'duration' | 'equipment' | 'weak'

interface StepDef {
  key: StepKey
  question: string
  hint?: string
  options: { label: string; value: string | number }[]
  multi?: boolean
}

const STEPS: StepDef[] = [
  {
    key: 'goal',
    question: '先聊聊目标：这次 BTWE 你想达成什么？',
    hint: '这决定计划的强度曲线和减量安排。',
    options: [
      { label: '顺利完赛', value: 'finish' },
      { label: '冲击个人 PB', value: 'pb' },
    ],
  },
  {
    key: 'experience',
    question: '你的 BTWE 比赛经验大概是什么水平？',
    hint: '我会据此调整起始训练量和站点重量。',
    options: [
      { label: '还没比过', value: 'none' },
      { label: '比过 1 次', value: 'once' },
      { label: '多次参赛', value: 'multi' },
    ],
  },
  {
    key: 'days',
    question: '每周能稳定训练几天？',
    hint: '稳定比多更重要，选你真正能坚持的天数。',
    options: [
      { label: '2 天', value: 2 },
      { label: '3 天', value: 3 },
      { label: '4 天', value: 4 },
      { label: '5 天', value: 5 },
    ],
  },
  {
    key: 'duration',
    question: '单次训练大概能投入多长时间？',
    hint: '我会把跑段与站点组合压缩到你的时间窗内。',
    options: [
      { label: '45 分钟', value: 45 },
      { label: '60 分钟', value: 60 },
      { label: '75 分钟', value: 75 },
    ],
  },
  {
    key: 'equipment',
    question: '训练时哪些器械可以用？',
    hint: '可多选，没有的器械我会给出替代动作。',
    options: EQUIPMENT_OPTIONS.map((e) => ({ label: e, value: e })),
    multi: true,
  },
  {
    key: 'weak',
    question: '目前最想补强的短板是什么？',
    hint: '我会在计划里安排对应的专项加练。',
    options: WEAK_OPTIONS.map((w) => ({ label: w, value: w })),
  },
]

export default function PlanCoach() {
  const navigate = useNavigate()
  const toast = useToast()
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      role: 'coach',
      text: `嗨，我是${COACH.name}。接下来我用几个问题帮你定制一份 BTWE 训练计划，大概 1 分钟。`,
    },
    { id: 2, role: 'coach', text: STEPS[0].question },
  ])
  const msgIdRef = useRef(3)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<PlanAnswers>(DEFAULT_ANSWERS)
  const [equipment, setEquipment] = useState<string[]>(DEFAULT_ANSWERS.equipment)
  const [answersDone, setAnswersDone] = useState(false)
  const [typing, setTyping] = useState(false)
  const [plan, setPlan] = useState<CustomPlan | null>(null)
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing, plan])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  function pushCoach(text: string) {
    setMessages((prev) => [...prev, { id: msgIdRef.current++, role: 'coach', text }])
  }

  function pushUser(text: string) {
    setMessages((prev) => [...prev, { id: msgIdRef.current++, role: 'user', text }])
  }

  function finishAnswers(final: PlanAnswers) {
    setTyping(true)
    const t = window.setTimeout(async () => {
      const remote = await generateRemotePlan(final)
      const generated = remote ? fromRemotePlan(remote) : generateCustomPlan(final)
      const basis =
        remote?.basedOn?.dataDriven && remote.basedOn.recentCount
          ? `我参考了你最近 ${remote.basedOn.recentCount} 次训练数据。`
          : ''
      setTyping(false)
      setPlan(generated)
      setStep(STEPS.length)
      setAnswersDone(true)
      pushCoach(
        `${basis}搞定！根据你的回答，我设计了「${generated.name}」，${generated.durationWeeks} 周 · 每周 ${generated.sessionsPerWeek} 次，预期 ${generated.targetFinish}。计划卡在下面，你可以逐周展开看。`
      )
    }, 1200)
    timersRef.current.push(t)
  }

  function advance(nextAnswers: PlanAnswers, label: string) {
    pushUser(label)
    if (step === STEPS.length - 1) {
      finishAnswers(nextAnswers)
      return
    }
    setTyping(true)
    const nextStep = step + 1
    const t = window.setTimeout(() => {
      setAnswers(nextAnswers)
      setStep(nextStep)
      setTyping(false)
      pushCoach(STEPS[nextStep].question)
    }, 700)
    timersRef.current.push(t)
  }

  function chooseOption(value: string | number, label: string) {
    const key = STEPS[step].key
    let next: PlanAnswers = answers
    if (key === 'goal') next = { ...answers, goal: value as PlanAnswers['goal'] }
    else if (key === 'experience')
      next = { ...answers, experience: value as PlanAnswers['experience'] }
    else if (key === 'days') next = { ...answers, days: Number(value) }
    else if (key === 'duration') next = { ...answers, duration: Number(value) }
    else if (key === 'weak') next = { ...answers, weak: String(value) }
    setAnswers(next)
    advance(next, label)
  }

  function confirmEquipment() {
    if (equipment.length === 0) {
      toast('至少选择 1 种器械')
      return
    }
    const next = { ...answers, equipment }
    setAnswers(next)
    advance(next, equipment.join('、'))
  }

  function submitWeakText() {
    const text = input.trim()
    if (text.length < 2) {
      toast('再多写几个字吧')
      return
    }
    setInput('')
    const next = { ...answers, weak: text }
    setAnswers(next)
    advance(next, text)
  }

  function usePlan() {
    if (!plan) return
    saveCustomPlan(plan)
    selectPlan(plan.id)
    toast('已启用教练定制计划')
    navigate('/plans')
  }

  function restart() {
    setMessages([
      {
        id: 1,
        role: 'coach',
        text: `好的，我们重新来一遍。${STEPS[0].question}`,
      },
    ])
    msgIdRef.current = 2
    setStep(0)
    setAnswers(DEFAULT_ANSWERS)
    setEquipment(DEFAULT_ANSWERS.equipment)
    setAnswersDone(false)
    setPlan(null)
    setExpandedWeek(1)
  }

  const currentStep = step < STEPS.length ? STEPS[step] : null

  return (
    <div className="flex h-full flex-col px-4 pt-4 hd:lg:mx-auto hd:lg:w-full hd:lg:max-w-[900px] hd:lg:px-8 hd:lg:pt-7">
      {/* 头部 */}
      <header className="reveal reveal-1 mb-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/plans')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-center">
          <h1 className="font-display text-base font-bold">定制训练计划</h1>
          <p className="text-[10px] text-text-sub">
            {answersDone ? '计划已生成' : `问题 ${Math.min(step + 1, STEPS.length)} / ${STEPS.length}`}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
          <Sparkles size={16} />
        </div>
      </header>

      {/* 进度 */}
      <div className="reveal reveal-1 mb-3 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${(Math.min(step + 1, STEPS.length) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* 对话区 */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {messages.map((m) =>
          m.role === 'coach' ? (
            <div key={m.id} className="flex items-start gap-2">
              <img
                src={COACH.avatar}
                alt={COACH.name}
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-primary/40 object-cover"
              />
              <div className="max-w-[85%] rounded-radius-md rounded-tl-sm border border-border bg-surface px-3 py-2">
                <p className="text-sm leading-relaxed text-text">{m.text}</p>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-radius-md rounded-tr-sm bg-primary px-3 py-2 text-sm font-medium text-bg">
                {m.text}
              </div>
            </div>
          )
        )}

        {typing && (
          <div className="flex items-center gap-2">
            <img
              src={COACH.avatar}
              alt={COACH.name}
              className="h-8 w-8 rounded-full border border-primary/40 object-cover"
            />
            <div className="flex items-center gap-1 rounded-radius-md border border-border bg-surface px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-sub [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-sub [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-sub" />
            </div>
          </div>
        )}

        {/* 生成的计划卡 */}
        {plan && (
          <div className="reveal rounded-radius-lg border border-primary/40 bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-primary">教练定制方案</p>
                <h2 className="mt-1 font-display text-lg font-bold">{plan.name}</h2>
              </div>
              <Target size={20} className="shrink-0 text-primary" />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {plan.highlights.map((h) => (
                <span
                  key={h}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-text-sub"
                >
                  {h}
                </span>
              ))}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-text-sub">{plan.summary}</p>

            <div className="mt-4 space-y-2">
              <p className="flex items-center gap-1 text-xs font-semibold text-text-sub">
                <CalendarDays size={13} /> 每周日程
              </p>
              <p className="text-sm font-medium text-primary">
                第 1 周 · {plan.weeklyPlan[0].focus}
              </p>
              {plan.weeklyPlan[0].sessions.map((s, i) => (
                <div key={i} className="rounded-radius-md bg-surface-2 p-2.5">
                  <p className="text-xs font-medium">{s.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-text-sub">{s.detail}</p>
                </div>
              ))}
              <button
                onClick={() => setExpandedWeek(expandedWeek === 2 ? 1 : 2)}
                className="flex w-full items-center justify-center gap-1 rounded-radius-md border border-border py-2 text-[11px] text-text-sub"
              >
                {expandedWeek === 2 ? '收起后续周安排' : `查看全部 ${plan.durationWeeks} 周安排`}
                <ChevronDown
                  size={12}
                  className={
                    expandedWeek === 2 ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </button>

              {expandedWeek === 2 &&
                plan.weeklyPlan.slice(1).map((w) => (
                  <div key={w.week} className="rounded-radius-md border border-border p-3">
                    <p className="text-xs font-semibold text-primary">
                      第 {w.week} 周 · {w.focus}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {w.sessions.map((s, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-[11px] text-text-sub"
                        >
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

            <div className="mt-4 rounded-radius-md bg-surface-2 p-3">
              <p className="mb-1 text-xs font-semibold text-warning">教练建议</p>
              <ul className="space-y-1">
                {plan.advice.map((a, i) => (
                  <li
                    key={i}
                    className="flex gap-1.5 text-[11px] leading-relaxed text-text-sub"
                  >
                    <span className="text-primary">·</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={usePlan}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md bg-primary py-3 text-sm font-bold text-bg transition-transform active:scale-[0.98]"
              >
                <CheckCircle2 size={16} /> 使用该计划
              </button>
              <button
                onClick={restart}
                className="flex items-center justify-center gap-1.5 rounded-radius-md border border-border px-4 py-3 text-sm text-text-sub"
              >
                <RotateCcw size={15} /> 重来
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 回答区 */}
      {currentStep && (
        <div className="reveal reveal-2 border-t border-border pt-3">
          <div className="mb-2 flex items-start gap-1.5 text-[11px] text-text-sub">
            <Sparkles size={12} className="mt-0.5 shrink-0 text-primary" />
            <span>{currentStep.hint}</span>
          </div>

          {currentStep.multi ? (
            <>
              <div className="flex flex-wrap gap-2">
                {currentStep.options.map((o) => {
                  const active = equipment.includes(String(o.value))
                  return (
                    <button
                      key={o.label}
                      onClick={() =>
                        setEquipment((prev) =>
                          prev.includes(String(o.value))
                            ? prev.filter((x) => x !== String(o.value))
                            : [...prev, String(o.value)]
                        )
                      }
                      className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-surface text-text-sub'
                      }`}
                    >
                      {active ? '✓ ' : ''}
                      {o.label}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={confirmEquipment}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-radius-md bg-primary py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                <Send size={14} /> 确认（已选 {equipment.length} 项）
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {currentStep.options.map((o) => (
                <button
                  key={o.label}
                  onClick={() => chooseOption(o.value, o.label)}
                  className="rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-text transition-colors active:border-primary active:text-primary"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          {currentStep.key === 'weak' && (
            <div className="mt-2.5 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitWeakText()
                }}
                placeholder="也可以直接描述你的短板…"
                className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-text-sub/60 focus:border-primary focus:outline-none"
              />
              <button
                onClick={submitWeakText}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-bg"
                aria-label="发送"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {answersDone && !plan && (
        <p className="pb-4 text-center text-xs text-text-sub">正在生成计划…</p>
      )}
    </div>
  )
}
