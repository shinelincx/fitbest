// 确定性训练计划引擎：所有数字在这里算，LLM 只负责表达。
export type CoachApp = 'hyrox' | 'btwe'
export type Goal = 'finish' | 'pb'
export type Experience = 'none' | 'once' | 'multi'

export interface PlanDigest {
  recentCount?: number
  avgTotalSec?: number
  avgRunSplitSec?: number
  weakestStations?: string[]
  lastRpe?: number
  // 跑步机训练（deviceSession mode=training）汇总
  avgTreadmillPaceSec?: number
  treadmillConsistencyPct?: number
  treadmillSessions?: number
}

export interface PlanRequest {
  app: CoachApp
  goal: Goal
  experience: Experience
  daysPerWeek: number
  sessionMinutes: number
  equipment: string[]
  weak: string
  raceDate?: string
  digest?: PlanDigest
}

interface SessionTemplate {
  title: string
  detail: string
  intent: string
  guardrail: string
}

export interface GeneratedWeek {
  week: number
  phase: string
  focus: string
  volumeFactor: number
  sessions: Array<SessionTemplate & { day: string }>
}

export interface GeneratedPlan {
  engine: 'deterministic'
  app: CoachApp
  name: string
  level: 'beginner' | 'intermediate' | 'elite'
  durationWeeks: number
  sessionsPerWeek: number
  summary: string
  highlights: string[]
  targetFinish: string
  advice: string[]
  weeks: GeneratedWeek[]
  basedOn: {
    recentCount: number
    avgTotalSec: number | null
    avgRunSplitSec: number | null
    weakestStations: string[]
    dataDriven: boolean
  }
}

// ---------- 基础工具 ----------

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`
}

function weeksUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / (7 * 24 * 3600 * 1000))
}

function phaseOf(week: number, total: number): string {
  const ratio = week / total
  if (ratio <= 0.2) return '基础适应期'
  if (ratio <= 0.45) return '强度提升期'
  if (ratio <= 0.7) return '专项强化期'
  if (ratio <= 0.9) return '模拟测试期'
  return '赛前减量期'
}

/** 周负荷：渐进 +10% 上限，每第 4 周减量，最后两周 taper */
function volumeFactorOf(week: number, total: number): number {
  let factor = 1 + 0.06 * (week - 1)
  if (week % 4 === 0) factor *= 0.65
  if (week === total) factor *= 0.6
  else if (week === total - 1) factor *= 0.75
  return Number(factor.toFixed(2))
}

// ---------- 目标值 ----------

function resolveTargetFinish(req: PlanRequest): string {
  const avg = req.digest?.avgTotalSec
  if (avg && avg > 0) {
    const low = Math.round((avg * 0.92) / 60)
    const high = Math.round((avg * 0.98) / 60)
    return `${low}–${high} 分钟（基于最近平均 ${mmss(avg)}）`
  }
  if (req.goal === 'pb') return '比上次快 3–5 分钟'
  if (req.experience === 'none') return '90–105 分钟完赛'
  if (req.experience === 'once') return '75–90 分钟完赛'
  return '65–75 分钟完赛'
}

function resolveRunPace(req: PlanRequest): string {
  const split = req.digest?.avgRunSplitSec
  if (split && split > 0) {
    const fast = Math.round(split - 8)
    const slow = Math.round(split - 2)
    return `目标跑段 ${mmss(fast)}–${mmss(slow)}/公里`
  }
  return '跑段比 5km 配速慢 30–45 秒/公里'
}

function focusStations(req: PlanRequest): string[] {
  const fromDigest = req.digest?.weakestStations?.filter(Boolean) ?? []
  if (fromDigest.length) return fromDigest.slice(0, 2)
  const weak = req.weak.trim()
  if (!weak || weak === '没有短板' || weak === '没有短板'.repeat(1)) return []
  return [weak]
}

// ---------- 课程模板 ----------

const HYROX_TEMPLATES: Record<number, SessionTemplate[]> = {
  2: [
    {
      title: '跑段配速 + 站点力量',
      detail: '1km×4 间歇跑；推/拉雪橇各 4×25m，组间休息 90 秒',
      intent: '同时刺激跑段配速和两个大力量站点，维持双线能力',
      guardrail: '最后一组若 RPE > 8，直接结束，不补组',
    },
    {
      title: '完整赛制模拟',
      detail: '8 组全流程模拟，按比赛重量与配速',
      intent: '验证当前完赛能力，产出分段时间用于校准下阶段计划',
      guardrail: '第一组刻意放慢 5%，避免后程崩盘',
    },
  ],
  3: [
    {
      title: '跑段配速训练',
      detail: '1km×4 间歇跑 + 髋部激活，控制在目标配速 ±10 秒',
      intent: '建立可重复的配速感，让身体记住目标节奏',
      guardrail: '配速掉出目标区间 2 组以上就收工',
    },
    {
      title: '力量站点专项',
      detail: '推/拉雪橇、农夫行走、沙袋箭步走，各 4 组渐进加重',
      intent: '提高力量站点的单次输出效率，减少站立停顿',
      guardrail: '动作变形立刻降重量，不追求次数',
    },
    {
      title: '完整赛制模拟',
      detail: '8 组全流程模拟，跑段略慢于比赛配速，重点练转换',
      intent: '练跑站转换效率，把站间切换时间压下来',
      guardrail: '转换时间超过 20 秒就停下来复盘一次',
    },
  ],
  4: [
    {
      title: '跑段配速训练',
      detail: '1km×4 间歇跑 + 阈值跑 10 分钟',
      intent: '提升乳酸阈值，让比赛配速更省力',
      guardrail: '心率超过阈值区间上限 30 秒仍未回落则降速',
    },
    {
      title: '力量站点专项',
      detail: '雪橇推/拉、农夫行走、沙袋箭步走，4 组渐进加重',
      intent: '补齐力量短板，保持动作质量优先',
      guardrail: '任一组动作变形即降重',
    },
    {
      title: '心肺站点专项',
      detail: '滑雪机/划船机 4×1000m；药球过墙 4×25 次',
      intent: '提高心肺站点耐力，降低后程掉速',
      guardrail: '心率连续 2 分钟高于上限则延长组间休息',
    },
    {
      title: '完整赛制模拟',
      detail: '8 组全流程模拟，记录分段时间与心率漂移',
      intent: '用真实数据定位短板，为下周计划提供依据',
      guardrail: '模拟只记录不硬拼，避免影响后续训练',
    },
  ],
  5: [
    {
      title: '轻松有氧跑',
      detail: '30–40 分钟 Zone 2 慢跑',
      intent: '在低强度下积累有氧基础，同时促进恢复',
      guardrail: '心率超过 Zone 2 上限就改快走',
    },
    {
      title: '跑段配速训练',
      detail: '1km×5 间歇跑 + 阈值跑 10 分钟',
      intent: '提高配速稳定性，为比赛后程储备速度',
      guardrail: '第 4 组开始掉速就停止加组',
    },
    {
      title: '力量站点专项',
      detail: '雪橇推/拉、农夫行走、沙袋箭步走，4 组渐进加重',
      intent: '提高绝对力量，减少赛中的力量瓶颈',
      guardrail: '腰部不适立即停止，不硬撑',
    },
    {
      title: '心肺站点 + 半程模拟',
      detail: '滑雪机/划船机专项 + 4 组半程模拟',
      intent: '在疲劳状态下练站点输出，模拟比赛中段感受',
      guardrail: '半程模拟后若 RPE > 8，取消最后的补充组',
    },
    {
      title: '完整赛制模拟',
      detail: '8 组全流程模拟，比赛重量与配速',
      intent: '完整验证一次，产出可对比的分段数据',
      guardrail: '结束后 10 分钟内完成补水与碳水补充',
    },
  ],
}

const BTWE_TEMPLATES: Record<number, SessionTemplate[]> = {
  2: [
    {
      title: '800m 间歇 + 心肺',
      detail: '800m×4 间歇跑；划船机/滑雪机 3×500m',
      intent: '建立基础心肺与配速感',
      guardrail: '配速掉出目标区间就减 1 组',
    },
    {
      title: '4 模块模拟',
      detail: '4 组（800m 跑 + 心肺 + 力量），组间休息 90 秒',
      intent: '验证基础赛制完成能力',
      guardrail: '第一组放慢 5%，先稳住节奏',
    },
  ],
  3: [
    {
      title: '间歇跑训练',
      detail: '800m×5，目标配速 ±10 秒',
      intent: '提高跑段经济性',
      guardrail: '连续 2 组不达标即收工',
    },
    {
      title: '心肺 + 力量',
      detail: '划船机 4×500m；深蹲/硬拉/推举 3 组',
      intent: '心肺与力量交替，提高整体做功能力',
      guardrail: '动作变形即降重量',
    },
    {
      title: '4 模块模拟',
      detail: '4 组全流程模拟，记录每组用时与心率',
      intent: '产出分段数据用于下周调整',
      guardrail: '只记录不硬拼，保留恢复',
    },
  ],
  4: [
    {
      title: '轻松有氧',
      detail: '30 分钟 Zone 2 慢跑或骑行',
      intent: '低强度恢复 + 有氧基础',
      guardrail: '心率超过 Zone 2 上限就改快走',
    },
    {
      title: '间歇跑训练',
      detail: '800m×5 + 200m×4 短冲刺',
      intent: '提高速度储备与后程冲刺能力',
      guardrail: '冲刺组出现动作变形立即停止',
    },
    {
      title: '力量训练',
      detail: '深蹲、硬拉、推举，各 4 组渐进加重',
      intent: '提高基础力量，支撑心肺模块输出',
      guardrail: '腰部不适立即停止',
    },
    {
      title: '4 模块模拟',
      detail: '4 组全流程模拟，按比赛节奏',
      intent: '完整验证并记录数据',
      guardrail: '结束后补充蛋白质与碳水',
    },
  ],
  5: [
    {
      title: '轻松有氧',
      detail: '30–40 分钟 Zone 2',
      intent: '恢复与有氧基础',
      guardrail: '保持能对话的强度',
    },
    {
      title: '间歇跑训练',
      detail: '800m×5 + 200m×4',
      intent: '提升速度耐力',
      guardrail: '掉速 2 组即停',
    },
    {
      title: '心肺专项',
      detail: '划船机 5×500m；滑雪机 4×250m',
      intent: '提高心肺模块效率',
      guardrail: '心率过高延长组间休息',
    },
    {
      title: '力量训练',
      detail: '深蹲、硬拉、推举、农夫行走，各 3–4 组',
      intent: '力量支撑整体输出',
      guardrail: '动作质量优先',
    },
    {
      title: '4 模块模拟',
      detail: '4 组全流程模拟，比赛节奏',
      intent: '完整验证并沉淀数据',
      guardrail: '结束后 10 分钟内完成补给',
    },
  ],
}

// ---------- 主入口 ----------

export function generatePlan(req: PlanRequest): GeneratedPlan {
  const app = req.app
  const days = clamp(Math.round(req.daysPerWeek), 2, 5)
  const digest = req.digest ?? {}
  const dataDriven = Boolean(digest.recentCount && digest.recentCount > 0)

  let weeks = req.goal === 'pb' ? 8 : req.experience === 'none' ? 10 : 9
  const byRace = weeksUntil(req.raceDate)
  if (byRace !== null) weeks = clamp(byRace, 4, 16)

  const templates = app === 'hyrox' ? HYROX_TEMPLATES[days] : BTWE_TEMPLATES[days]
  const stations = focusStations(req)
  const runPace = resolveRunPace(req)
  const targetFinish = resolveTargetFinish(req)

  const weeklyPlan: GeneratedWeek[] = []
  for (let week = 1; week <= weeks; week++) {
    const phase = phaseOf(week, weeks)
    const factor = volumeFactorOf(week, weeks)
    const isTaper = phase === '赛前减量期'
    const isSim = phase === '模拟测试期'
    const stationNote = stations.length ? `重点：${stations.join('、')}` : ''

    weeklyPlan.push({
      week,
      phase,
      focus: isTaper ? '减量保状态' : isSim ? '模拟验证' : stations.length ? `补强 ${stations[0]}` : '均衡推进',
      volumeFactor: factor,
      sessions: templates.map((t, idx) => {
        let detail = t.detail
        if (isTaper) detail += '（本周减量 30–40%，保持动作模式即可）'
        else if (isSim) detail += '（按比赛标准重量与配速）'
        return {
          day: `第 ${idx + 1} 次`,
          title: t.title,
          detail: `${detail}；${runPace}${stationNote ? `；${stationNote}` : ''}`,
          intent: t.intent,
          guardrail: t.guardrail,
        }
      }),
    })
  }

  const advice: string[] = []
  if (dataDriven) {
    advice.push(
      `已参考你最近 ${digest.recentCount} 次训练${
        digest.avgTotalSec ? `（平均 ${mmss(digest.avgTotalSec)}）` : ''
      }自动校准强度。`,
    )
    if (stations.length) {
      advice.push(`数据显示「${stations.join('、')}」是你的主要短板，本周期安排了更高频的专项。`)
    }
    if (digest.lastRpe && digest.lastRpe >= 8) {
      advice.push('上次训练主观强度偏高，前两周先把强度降一档，避免累积疲劳。')
    }
    if (
      digest.treadmillConsistencyPct !== undefined &&
      digest.treadmillConsistencyPct < 85 &&
      digest.avgTreadmillPaceSec
    ) {
      advice.push(
        `跑步机配速一致性 ${digest.treadmillConsistencyPct}%，建议每周加一次「匀速跑」：按 ${mmss(
          digest.avgTreadmillPaceSec,
        )}/公里定速，全程不看表、只听节拍。`,
      )
    }
  } else {
    advice.push('你还没有足够的模拟数据，先按经验值安排；完成 2 次模拟后我会自动校准。')
  }
  advice.push(`单次训练 ${req.sessionMinutes} 分钟不含热身放松，请额外留 10 分钟动态热身。`)

  const missing: string[] = []
  if (app === 'hyrox') {
    if (!req.equipment.includes('雪橇')) missing.push('雪橇用阻力撬/农夫走替代')
    if (!req.equipment.includes('药球')) missing.push('药球用壶铃高翻替代')
    if (!req.equipment.includes('划船机')) missing.push('划船机用滑雪机替代')
    if (!req.equipment.includes('滑雪机')) missing.push('滑雪机用划船机替代')
  }
  if (missing.length) advice.push(`器械替代：${missing.join('；')}。`)
  advice.push('每周至少 2 天完全休息，睡眠 7 小时以上。')

  const summary = `基于你的${req.experience === 'none' ? '首次备赛' : req.experience === 'once' ? '单次参赛' : '多次参赛'}经验、每周 ${days} 天 × ${req.sessionMinutes} 分钟的可训练时间，生成 ${weeks} 周渐进计划，目标 ${targetFinish}。`

  return {
    engine: 'deterministic',
    app,
    name: req.goal === 'pb' ? '教练定制 · PB 冲刺' : '教练定制 · 完赛计划',
    level: req.experience === 'multi' ? 'elite' : req.experience === 'once' ? 'intermediate' : 'beginner',
    durationWeeks: weeks,
    sessionsPerWeek: days,
    summary,
    highlights: [
      `${weeks} 周周期化`,
      `每周 ${days} 次`,
      `目标 ${targetFinish}`,
      stations.length ? `重点补强：${stations.join('、')}` : '均衡提升',
      dataDriven ? '基于真实训练数据' : '经验值起步',
    ],
    targetFinish,
    advice,
    weeks: weeklyPlan,
    basedOn: {
      recentCount: digest.recentCount ?? 0,
      avgTotalSec: digest.avgTotalSec ?? null,
      avgRunSplitSec: digest.avgRunSplitSec ?? null,
      weakestStations: stations,
      dataDriven,
    },
  }
}
