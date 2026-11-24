// 对话式 BTWE 计划定制 —— 问答采集 + 本地规则生成 + 持久化
import type { Plan } from '../types'
import type { RemoteGeneratedPlan } from '../api'
import { BTWE_MODULES, PLANS } from '../mock/data'
import { loadJSON, saveJSON } from './storage'

export interface PlanAnswers {
  goal: 'finish' | 'pb'
  experience: 'none' | 'once' | 'multi'
  days: number
  duration: number
  equipment: string[]
  weak: string
}

export interface PlanWeek {
  week: number
  focus: string
  sessions: { day: string; title: string; detail: string }[]
}

export interface CustomPlan extends Plan {
  source: 'coach'
  weeklyPlan: PlanWeek[]
  targetFinish: string
  advice: string[]
  summary: string
  createdAt: string
}

export const DEFAULT_ANSWERS: PlanAnswers = {
  goal: 'finish',
  experience: 'none',
  days: 3,
  duration: 45,
  equipment: ['划船机', '滑雪机', '风阻单车', '雪橇', '药球', '沙袋'],
  weak: '没有短板',
}

export const EQUIPMENT_OPTIONS = ['划船机', '滑雪机', '风阻单车', '雪橇', '药球', '沙袋']
export const WEAK_OPTIONS = ['跑步配速', '力量站点', '心肺耐力', '没有短板']

const CUSTOM_KEY = 'btwe:custom-plan'
const PLAN_KEY = 'btwe-selected-plan'

const EXPERIENCE_LABEL: Record<PlanAnswers['experience'], string> = {
  none: '首次备赛',
  once: '有一次比赛经验',
  multi: '多次参赛',
}

// 每周训练模板（4 模块赛制：800m 跑 + 心肺 + 力量）
const SESSION_TEMPLATES: Record<number, { title: string; detail: string }[]> = {
  2: [
    { title: '跑段配速 + 模块力量', detail: '800m×4 间歇跑，配速略快于目标；推/拉雪橇各 4×25m，组间休息 90s' },
    { title: '完整 4 模块模拟', detail: '4 模块全流程模拟，按比赛重量，记录每模块用时与心率' },
  ],
  3: [
    { title: '跑段配速训练', detail: '800m×4 间歇跑 + 髋部激活，控制在目标配速 ±5s' },
    { title: '心肺 + 力量组合', detail: '划船机/滑雪机 4×500m，搭配药球过墙 4×30 次' },
    { title: '完整 4 模块模拟', detail: '4 模块全流程模拟，重点练跑站转换效率' },
  ],
  4: [
    { title: '跑段配速训练', detail: '800m×4 间歇跑 + 阈值跑 8 分钟' },
    { title: '力量站点专项', detail: '推/拉雪橇、沙袋弓箭步、波比跳远，4 组渐进加重' },
    { title: '心肺站点专项', detail: '划船机/滑雪机/风阻单车 4×500m，药球过墙 4×30 次' },
    { title: '完整 4 模块模拟', detail: '4 模块全流程模拟，记录分段时间与心率漂移' },
  ],
  5: [
    { title: '轻松有氧跑', detail: '25–30 分钟 Zone 2 慢跑，促进恢复' },
    { title: '跑段配速训练', detail: '800m×5 间歇跑 + 阈值跑 8 分钟' },
    { title: '力量站点专项', detail: '推/拉雪橇、沙袋弓箭步、波比跳远，4 组渐进加重' },
    { title: '心肺站点 + 半赛模拟', detail: '划船机/滑雪机专项 + 2 模块半程模拟' },
    { title: '完整 4 模块模拟', detail: '4 模块全流程模拟，比赛重量与配速' },
  ],
}

function phaseFocus(week: number, weeks: number): string {
  const ratio = week / weeks
  if (ratio <= 0.2) return '基础适应期'
  if (ratio <= 0.45) return '强度提升期'
  if (ratio <= 0.7) return '专项强化期'
  if (ratio <= 0.9) return '模拟测试期'
  return '赛前减量期'
}

function targetFinish(answers: PlanAnswers): string {
  if (answers.goal === 'pb') return '比上次快 60–90 秒'
  if (answers.experience === 'none') return '28–32 分钟完赛'
  if (answers.experience === 'once') return '25–28 分钟完赛'
  return '22–25 分钟完赛'
}

function buildAdvice(answers: PlanAnswers): string[] {
  const advice: string[] = [
    '跑段配速：800m 每段控制在目标配速 ±5 秒，先稳后快，避免第一组冲太猛。',
    `单次训练 ${answers.duration} 分钟不含热身与放松，务必留出 8–10 分钟动态热身。`,
  ]

  if (answers.weak === '跑步配速') {
    advice.push('短板补强：每周加 1 次阈值跑（15–20 分钟），800m 目标每周提升 2–3 秒。')
  } else if (answers.weak === '力量站点') {
    advice.push('短板补强：雪橇与沙袋弓箭步单独加练，重量按比赛标准 70% 起步，每周递增 5%。')
  } else if (answers.weak === '心肺耐力') {
    advice.push('短板补强：每两周安排 1 次 40 分钟 Zone 2 有氧，提升后程续航与恢复速度。')
  } else {
    advice.push('保持均衡：跑段与心肺、力量站点交替训练，重点打磨模块间转换效率。')
  }

  const missing: string[] = []
  if (!answers.equipment.includes('雪橇')) missing.push('雪橇用阻力撬/哑铃农夫走替代')
  if (!answers.equipment.includes('药球')) missing.push('药球用壶铃高翻替代')
  if (!answers.equipment.includes('沙袋')) missing.push('沙袋用哑铃负重弓箭步替代')
  if (!answers.equipment.includes('划船机')) missing.push('划船机用滑雪机/风阻单车替代')
  if (!answers.equipment.includes('滑雪机')) missing.push('滑雪机用划船机替代')
  if (!answers.equipment.includes('风阻单车')) missing.push('风阻单车用动感单车/划船机替代')
  if (missing.length) advice.push(`器械替代：${missing.join('；')}。`)

  advice.push('恢复：每周至少 2 天完全休息，睡眠 7 小时以上；高强度周后安排 1 天主动恢复。')
  return advice
}

export function generateCustomPlan(answers: PlanAnswers): CustomPlan {
  const weeks = answers.goal === 'pb' ? 8 : answers.experience === 'multi' ? 8 : 10
  const sessionsPerWeek = answers.days
  const templates = SESSION_TEMPLATES[sessionsPerWeek] ?? SESSION_TEMPLATES[3]

  const weeklyPlan: PlanWeek[] = Array.from({ length: weeks }, (_, i) => {
    const week = i + 1
    const focus = phaseFocus(week, weeks)
    return {
      week,
      focus,
      sessions: templates.map((t, idx) => ({
        day: `第 ${idx + 1} 次`,
        title: t.title,
        detail:
          focus === '赛前减量期'
            ? `${t.detail}（本周减量 30%，保持动作模式即可）`
            : focus === '模拟测试期'
              ? `${t.detail}（按比赛标准重量与配速）`
              : t.detail,
      })),
    }
  })

  const target = targetFinish(answers)
  const summary = `你是${EXPERIENCE_LABEL[answers.experience]}，目标${
    answers.goal === 'pb' ? '刷新个人最好成绩' : '顺利完赛'
  }，每周可训练 ${answers.days} 天、单次 ${answers.duration} 分钟。我为你安排了 ${weeks} 周渐进计划，预估完赛 ${target}。`

  return {
    id: 'plan-custom',
    name: answers.goal === 'pb' ? '教练定制 · PB 冲刺' : '教练定制 · 完赛计划',
    level:
      answers.experience === 'multi'
        ? 'elite'
        : answers.experience === 'once'
          ? 'intermediate'
          : 'beginner',
    durationWeeks: weeks,
    sessionsPerWeek,
    description: summary,
    highlights: [
      `${weeks} 周周期化`,
      `每周 ${sessionsPerWeek} 次`,
      `目标 ${target}`,
      answers.weak === '没有短板' ? '均衡提升' : `重点补强：${answers.weak}`,
    ],
    modules: BTWE_MODULES,
    accent: 'primary',
    source: 'coach',
    weeklyPlan,
    targetFinish: target,
    advice: buildAdvice(answers),
    summary,
    createdAt: new Date().toISOString(),
  }
}

// —— 后端确定性引擎结果映射 ——
export function fromRemotePlan(remote: RemoteGeneratedPlan): CustomPlan {
  return {
    id: 'plan-custom',
    name: remote.name,
    level: remote.level,
    durationWeeks: remote.durationWeeks,
    sessionsPerWeek: remote.sessionsPerWeek,
    description: remote.summary,
    highlights: remote.highlights,
    modules: BTWE_MODULES,
    accent: 'primary',
    source: 'coach',
    weeklyPlan: remote.weeks.map((w) => ({
      week: w.week,
      focus: `${w.phase} · ${w.focus}`,
      sessions: w.sessions.map((s) => ({
        day: s.day,
        title: s.title,
        detail: `${s.detail}。目的：${s.intent}。${s.guardrail}`,
      })),
    })),
    targetFinish: remote.targetFinish,
    advice: remote.advice,
    summary: remote.summary,
    createdAt: new Date().toISOString(),
  }
}

// —— 持久化 ——
export function getCustomPlan(): CustomPlan | null {
  return loadJSON<CustomPlan | null>(CUSTOM_KEY, null)
}

export function saveCustomPlan(plan: CustomPlan) {
  saveJSON(CUSTOM_KEY, plan)
}

export function selectPlan(id: string) {
  try {
    localStorage.setItem(PLAN_KEY, id)
  } catch {
    // ignore
  }
}

export function getSelectedPlanId(): string {
  return localStorage.getItem(PLAN_KEY) || 'plan-intermediate'
}

/** 解析计划：支持教练定制计划与预设计划 */
export function resolvePlan(id: string): Plan | undefined {
  if (id === 'plan-custom') {
    return getCustomPlan() ?? undefined
  }
  return PLANS.find((p) => p.id === id)
}

export function planNameOf(planId: string): string {
  return resolvePlan(planId)?.name ?? 'BTWE 赛制模拟'
}

/** 当前生效计划 */
export function getActivePlan(): Plan {
  return resolvePlan(getSelectedPlanId()) ?? PLANS.find((p) => p.id === 'plan-intermediate')!
}
