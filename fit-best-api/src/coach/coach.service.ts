import { Injectable } from '@nestjs/common'
import { config } from '../config'
import { PrismaService } from '../prisma/prisma.module'
import { generatePlan, type GeneratedPlan, type PlanDigest, type PlanRequest } from './plan.engine'

export type CoachApp = 'hyrox' | 'btwe'

export interface CoachMessage {
  role: 'user' | 'coach'
  content: string
}

const BRAND_PROMPT: Record<CoachApp, string> = {
  hyrox:
    'HYROX 赛制为 8 组（1km 跑 + 一个功能站点），共 8 个功能站点（滑雪机、推雪橇、拉雪橇、波比跳远、划船机、农夫行走、沙袋弓步、墙球）。',
  btwe: 'BTWE 赛制为 4 组模块（800m 跑 + 心肺动作 + 力量动作），适合入门与日常基础体能训练。',
}

const SYSTEM_PROMPT = (app: CoachApp, contextText?: string) =>
  `你是 FITBEST 的 AI 体能教练，名字叫「教练小菲」，专精 HYROX 与 BTWE 体能赛事训练。
${BRAND_PROMPT[app]}
要求：
1. 用简体中文回答，语气专业、亲切、简洁，控制在 120 字以内。
2. 回答围绕训练计划、心率区间、动作要领、恢复与饮食、赛前备赛。
3. 涉及受伤或医疗问题时，提醒用户及时就医，不要给出诊断。
4. 不要编造具体赛事日期、价格或医疗结论。
5. 如果用户数据里提到具体数字，回答必须引用这些数字，不要另编数字。
${contextText ? `\n用户近况（只能引用，不得编造）：\n${contextText}` : ''}`

interface Rule {
  match: string[]
  reply: string
}

const COMMON_RULES: Rule[] = [
  {
    match: ['心率', 'bpm', '心跳', '正常'],
    reply:
      '训练心率分三个区间：热身区 100-130 bpm，有氧耐力区 130-160 bpm，高强度间歇区 160-185 bpm。模块赛大部分时间应在 140-170 之间。如果静息心率超过 75，说明恢复不足，建议主动休息一天。',
  },
  {
    match: ['耐力', '提升', '持久', '跑'],
    reply:
      '提升耐力有三个关键点：① 每周 2 次低心率长距离跑（心率控制在 140 以内，40 分钟以上）；② 划船机/滑雪机做 20 分钟稳态训练，配速稳定不爆；③ 保证睡眠 7 小时以上，耐力是在恢复中长出来的。',
  },
  {
    match: ['动作', '标准', '姿势', '发力'],
    reply:
      '动作质量永远比重量重要。建议：① 拍视频对照标准动作；② 降重量找发力感；③ 关注核心收紧——所有动作的根基都是核心稳定；④ 如有疼痛立即停止。',
  },
  {
    match: ['恢复', '休息', '酸痛', '疲劳'],
    reply:
      '恢复四件套：① 睡眠 7-9 小时；② 训练后 30 分钟内补充蛋白质+碳水；③ 泡沫轴放松大腿前侧和背部；④ 主动恢复日做 20 分钟低强度骑行。如果连续两天静息心率偏高 10 以上，强制休息。',
  },
  {
    match: ['饮食', '吃', '营养', '减脂'],
    reply:
      '训练前 1.5 小时吃一根香蕉+一片面包；训练中每 20 分钟补一口水；训练后 30 分钟内摄入 20-30g 蛋白质。日常保证每公斤体重 1.6-2g 蛋白质，碳水占总热量 50% 左右。',
  },
  {
    match: ['受伤', '疼', '痛', '膝盖', '腰'],
    reply:
      '疼痛是身体的警告，不是考验。建议：① 立即停止引发疼痛的动作；② 急性期 48 小时内冰敷，每次 15 分钟；③ 观察是否影响日常活动，如果影响请就医；④ 恢复训练时从低强度开始。',
  },
]

const PLAN_RULES: Record<CoachApp, Rule[]> = {
  hyrox: [
    {
      match: ['今天', '练什么', '训练', '计划', '备赛'],
      reply:
        '建议今天做完整赛制模拟：8 组（1km 跑 + 功能站点）。先动态热身 5 分钟，重点激活髋部和核心。跑段保持目标配速，站点之间快速转换，跑步时鼻吸嘴呼，力量动作时发力呼气、还原吸气。',
    },
  ],
  btwe: [
    {
      match: ['今天', '练什么', '训练', '计划', '备赛'],
      reply:
        '建议今天做模块赛模拟：4 组（800m 跑 + 心肺 + 力量）。先动态热身 5 分钟，每组之间休息 90 秒，注意呼吸节奏——跑步时鼻吸嘴呼，力量动作时发力呼气、还原吸气。',
    },
  ],
}

const FALLBACK: Record<CoachApp, string> = {
  hyrox:
    '我是你的 HYROX 专属 AI 教练。关于训练计划、心率监控、动作要领、恢复饮食都可以问我。你可以试试问「今天练什么」「心率多少正常」或者「怎么提升耐力」。',
  btwe:
    '我是你的 BTWE 专属 AI 教练。关于训练计划、心率监控、动作要领、恢复饮食都可以问我。你可以试试问「今天练什么」「心率多少正常」或者「怎么提升耐力」。',
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`
}

@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  async chat(
    app: CoachApp,
    messages: CoachMessage[],
    contextText?: string,
  ): Promise<{ reply: string; source: 'llm' | 'local' }> {
    const last = [...messages].reverse().find((m) => m.role === 'user')
    const question = last?.content?.trim() ?? ''

    if (config.llm.apiKey) {
      try {
        const reply = await this.callLlm(app, messages, contextText)
        if (reply) return { reply, source: 'llm' }
      } catch (error) {
        console.warn('[coach] LLM 调用失败，回退本地规则：', (error as Error).message)
      }
    }

    const base = this.localReply(app, question)
    return {
      reply: contextText ? `${base}（已参考你的近况：${contextText}）` : base,
      source: 'local',
    }
  }

  /** 汇总用户真实训练数据，供计划引擎与聊天使用 */
  async context(userId: string, app: CoachApp): Promise<{ digest: PlanDigest; text: string }> {
    const records = await this.prisma.trainingRecord.findMany({
      where: { userId, app },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })

    const completed = records.filter((r) => r.completed)
    const avgTotalSec = completed.length
      ? Math.round(completed.reduce((sum, r) => sum + r.totalTimeSec, 0) / completed.length)
      : undefined

    const splits = records
      .flatMap((r) => (Array.isArray(r.runSplits) ? (r.runSplits as number[]) : []))
      .filter((n) => typeof n === 'number' && n > 0)
    const avgRunSplitSec = splits.length
      ? Math.round(splits.reduce((a, b) => a + b, 0) / splits.length)
      : undefined

    const stationCounts = new Map<string, number>()
    records.forEach((r) => {
      if (r.weakestStation) {
        stationCounts.set(r.weakestStation, (stationCounts.get(r.weakestStation) ?? 0) + 1)
      }
    })
    const weakestStations = [...stationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name)

    const digest: PlanDigest = {
      recentCount: records.length,
      avgTotalSec,
      avgRunSplitSec,
      weakestStations,
      lastRpe: records[0]?.rpe ?? undefined,
    }

    // 跑步机训练数据（deviceSession mode=training）单独汇总：配速与配速一致性
    const treadmill = await this.treadmillDigest(userId, app)
    Object.assign(digest, treadmill)

    const parts: string[] = [`最近 ${records.length} 次训练，完成 ${completed.length} 次`]
    if (avgTotalSec) parts.push(`平均用时 ${mmss(avgTotalSec)}`)
    if (avgRunSplitSec) parts.push(`平均跑段 ${mmss(avgRunSplitSec)}/公里`)
    if (weakestStations.length) parts.push(`短板站点 ${weakestStations.join('、')}`)
    if (digest.lastRpe) parts.push(`上次主观强度 RPE ${digest.lastRpe}`)
    if (treadmill.avgTreadmillPaceSec) {
      parts.push(
        `跑步机 ${treadmill.treadmillSessions} 次、平均配速 ${mmss(
          treadmill.avgTreadmillPaceSec,
        )}/公里、配速一致性 ${treadmill.treadmillConsistencyPct}%`,
      )
    }

    return { digest, text: parts.join('；') + '。' }
  }

  /** 汇总跑步机段配速；比赛（race）数据不参与 */
  private async treadmillDigest(
    userId: string,
    app: CoachApp,
  ): Promise<Pick<PlanDigest, 'avgTreadmillPaceSec' | 'treadmillConsistencyPct' | 'treadmillSessions'>> {
    const sessions = await this.prisma.deviceSession.findMany({
      where: { userId, app, mode: 'training' },
      orderBy: { startedAt: 'desc' },
      take: 12,
      include: { segments: { where: { type: 'treadmill' } } },
    })

    const paces: number[] = []
    let treadmillSessions = 0
    sessions.forEach((s) => {
      const segs = s.segments.filter((seg) => seg.durationSec > 0 && seg.distanceM >= 500)
      if (!segs.length) return
      treadmillSessions += 1
      segs.forEach((seg) => paces.push((seg.durationSec * 1000) / seg.distanceM))
    })
    if (!paces.length) {
      return { treadmillSessions: 0 }
    }

    const mean = paces.reduce((a, b) => a + b, 0) / paces.length
    const variance = paces.reduce((sum, p) => sum + (p - mean) ** 2, 0) / paces.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0
    return {
      avgTreadmillPaceSec: Math.round(mean),
      treadmillConsistencyPct: Math.max(0, Math.min(100, Math.round(100 - cv * 100))),
      treadmillSessions,
    }
  }

  async generatePlan(userId: string | undefined, req: PlanRequest): Promise<GeneratedPlan> {
    if (userId) {
      const { digest } = await this.context(userId, req.app)
      return generatePlan({ ...req, digest: { ...digest, ...req.digest } })
    }
    return generatePlan(req)
  }

  private async callLlm(
    app: CoachApp,
    messages: CoachMessage[],
    contextText?: string,
  ): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs)
    try {
      const res = await fetch(`${config.llm.apiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.llm.apiKey}`,
        },
        body: JSON.stringify({
          model: config.llm.model,
          temperature: 0.6,
          max_tokens: 400,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT(app, contextText) },
            ...messages.slice(-10).map((m) => ({
              role: m.role === 'coach' ? 'assistant' : 'user',
              content: m.content.slice(0, 500),
            })),
          ],
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content?.trim() ?? ''
    } finally {
      clearTimeout(timer)
    }
  }

  private localReply(app: CoachApp, input: string): string {
    const lower = input.toLowerCase()
    for (const rule of [...PLAN_RULES[app], ...COMMON_RULES]) {
      if (rule.match.some((k) => lower.includes(k))) return rule.reply
    }
    return FALLBACK[app]
  }
}
