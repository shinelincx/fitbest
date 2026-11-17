import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  Sparkles,
  Dumbbell,
  Heart,
  Zap,
  MessageCircle,
  Trash2,
} from 'lucide-react'
import { loadJSON, saveJSON } from '../utils/storage'
import { useToast } from '../components/Toast'
import { COACH } from '../utils/coach'
import { http } from '../api/client'
import { localCoachContext } from '../api'

interface ChatMessage {
  id: number
  role: 'user' | 'coach'
  text: string
}

// 数字人头像 —— 仿真人照片 + 呼吸/说话动效
function DigitalHuman({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* 外圈呼吸光晕 */}
      <div
        className={`absolute h-52 w-52 rounded-full bg-primary/15 blur-2xl transition-all duration-700 ${
          speaking ? 'scale-110 opacity-90' : 'scale-100 opacity-50'
        }`}
      />
      <div
        className={`absolute h-40 w-40 rounded-full border-2 transition-colors duration-500 ${
          speaking ? 'border-primary' : 'border-primary/40'
        }`}
      />
      <div className="absolute h-48 w-48 rounded-full border border-accent/20" />

      {/* 仿真人头像 */}
      <div
        className={`relative overflow-hidden rounded-full border-2 border-surface-2 shadow-[0_0_30px_rgba(234,179,8,0.25)] transition-transform duration-700 ${
          speaking ? 'scale-[1.03]' : 'scale-100'
        }`}
      >
        <img
          src={COACH.avatar}
          alt={COACH.name}
          className="h-40 w-40 object-cover"
          draggable={false}
        />
        {/* 说话时的微光叠加 */}
        <div
          className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
            speaking ? 'bg-primary/10 opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {/* 说话时的声波指示 */}
      {speaking && (
        <div className="absolute -bottom-1 flex items-end gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="dh-bar block w-1 rounded-full bg-primary"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// 预设快捷问题
const QUICK_QUESTIONS = [
  { icon: Dumbbell, text: '今天练什么？' },
  { icon: Heart, text: '心率多少算正常？' },
  { icon: Zap, text: '怎么提升耐力？' },
  { icon: MessageCircle, text: '动作不标准怎么办？' },
]

// 模拟 AI 教练回复库（按关键词匹配）
const COACH_REPLIES: { match: string[]; reply: string }[] = [
  {
    match: ['今天', '练什么', '训练', '计划'],
    reply:
      '建议今天做完整赛制模拟：8 组 (1km 跑 + 功能站点)。先动态热身 5 分钟，重点激活髋部和核心。跑段保持目标配速，站点之间快速转换，注意呼吸节奏——跑步时鼻吸嘴呼，力量动作时发力呼气、还原吸气。',
  },
  {
    match: ['心率', 'bpm', '心跳', '正常'],
    reply:
      '训练心率分三个区间：热身区 100-130 bpm，有氧耐力区 130-160 bpm，高强度间歇区 160-185 bpm。HYROX 模块赛大部分时间应在 140-170 之间。如果静息心率超过 75，说明恢复不足，建议主动休息一天。',
  },
  {
    match: ['耐力', '提升', '持久', '跑'],
    reply:
      '提升耐力有三个关键点：① 每周 2 次低心率长距离跑（心率控制在 140 以内，40 分钟以上）；② 划船机/滑雪机做 20 分钟稳态训练，配速稳定不爆；③ 保证睡眠 7 小时以上，耐力是在恢复中长出来的，不是练出来的。',
  },
  {
    match: ['动作', '标准', '姿势', '发力'],
    reply:
      '动作质量永远比重量重要。建议：① 拍视频对照标准动作；② 降重量找发力感，比如波比跳先做慢速离心；③ 关注核心收紧——所有动作的根基都是核心稳定；④ 如有疼痛立即停止，别跟伤较劲。',
  },
  {
    match: ['恢复', '休息', '酸痛', '疲劳'],
    reply:
      '恢复四件套：① 睡眠 7-9 小时，这是最便宜的补剂；② 训练后 30 分钟内补充蛋白质+碳水；③ 泡沫轴放松大腿前侧和背部；④ 主动恢复日做 20 分钟低强度骑行。如果连续两天静息心率偏高 10 以上，强制休息。',
  },
  {
    match: ['饮食', '吃', '营养', '减脂'],
    reply:
      'HYROX 训练饮食建议：训练前 1.5 小时吃一根香蕉+一片面包；训练中每 20 分钟补一口水；训练后 30 分钟内摄入 20-30g 蛋白质。日常保证每公斤体重 1.6-2g 蛋白质，碳水占总热量 50% 左右。',
  },
  {
    match: ['受伤', '疼', '痛', '膝盖', '腰'],
    reply:
      '疼痛是身体的警告，不是考验。建议：① 立即停止引发疼痛的动作；② 急性期 48 小时内冰敷，每次 15 分钟；③ 观察是否影响日常活动，如果影响请就医；④ 恢复训练时从低强度开始，循序渐进。',
  },
]

function getCoachReply(input: string): string {
  const lower = input.toLowerCase()
  for (const r of COACH_REPLIES) {
    if (r.match.some((k) => lower.includes(k))) return r.reply
  }
  return '我是你的 HYROX 专属 AI 教练。关于训练计划、心率监控、动作要领、恢复饮食都可以问我。你可以试试问「今天练什么」「心率多少正常」或者「怎么提升耐力」。'
}

const CHAT_KEY = 'hyrox:coach-chat'

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1,
    role: 'coach',
    text: `你好！我是${COACH.name}，你的 HYROX 专属体能教练 🎯 训练计划、心率监控、动作要领、恢复饮食都可以问我。`,
  },
]

export default function AiCoach() {
  const navigate = useNavigate()
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadJSON<ChatMessage[]>(CHAT_KEY, INITIAL_MESSAGES)
  )
  const [input, setInput] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const msgIdRef = useRef(
    loadJSON<ChatMessage[]>(CHAT_KEY, INITIAL_MESSAGES).reduce(
      (max, m) => Math.max(max, m.id),
      1
    ) + 1
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // 对话记录持久化
  useEffect(() => {
    saveJSON(CHAT_KEY, messages)
  }, [messages])

  function clearChat() {
    if (!window.confirm('确定清空与教练的对话记录吗？')) return
    setMessages(INITIAL_MESSAGES)
    msgIdRef.current = 2
    toast('对话已清空')
  }

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  async function send(text: string) {
    const content = text.trim()
    if (!content || thinking) return
    const userMsg: ChatMessage = { id: msgIdRef.current++, role: 'user', text: content }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setThinking(true)

    const startedAt = Date.now()
    let reply = ''
    try {
      const res = await http.post<{ reply: string }>(
        '/coach/chat',
        {
          app: 'hyrox',
          messages: history.slice(-10).map((m) => ({ role: m.role, content: m.text })),
          context: localCoachContext(),
        },
        false
      )
      reply = res?.reply?.trim() ?? ''
    } catch {
      reply = ''
    }
    // 后端不可用时回退本地规则
    if (!reply) reply = getCoachReply(content)

    // 至少展示 600ms 思考态，避免闪烁
    const elapsed = Date.now() - startedAt
    if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed))

    setThinking(false)
    setSpeaking(true)
    setMessages((prev) => [
      ...prev,
      { id: msgIdRef.current++, role: 'coach', text: reply },
    ])
    // 回复长度决定说话动画时长
    const speakTime = Math.min(4000, Math.max(1500, reply.length * 80))
    setTimeout(() => setSpeaking(false), speakTime)
  }

  return (
    <div className="flex h-full flex-col px-5 pt-5 lg:mx-auto lg:w-full lg:max-w-[900px] lg:px-8 lg:pt-7">
      {/* 顶栏 */}
      <header className="reveal reveal-1 mb-4 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub transition-colors active:bg-surface-2"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h1 className="font-display text-base font-bold">AI 教练</h1>
        </div>
        <button
          onClick={clearChat}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub transition-colors active:bg-surface-2"
          aria-label="清空对话"
        >
          <Trash2 size={16} />
        </button>
      </header>

      {/* 数字人区域 */}
      <div className="reveal reveal-2 mb-4 flex flex-col items-center">
        <DigitalHuman speaking={speaking} />
        {/* 教练名片 */}
        <div className="mt-4 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold">{COACH.name}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                COACH.gender === '女'
                  ? 'bg-pink-500/15 text-pink-400'
                  : 'bg-sky-500/15 text-sky-400'
              }`}
            >
              {COACH.gender === '女' ? '♀ 女' : '♂ 男'}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-sub">{COACH.title}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                speaking ? 'bg-primary animate-pulse' : thinking ? 'bg-warning animate-pulse' : 'bg-success'
              }`}
            />
            <span className="text-xs text-text-sub">
              {speaking ? '正在讲解…' : thinking ? '正在思考…' : '在线，随时为你解答'}
            </span>
          </div>
        </div>
      </div>

      {/* 聊天区 */}
      <div
        ref={scrollRef}
        className="reveal reveal-3 mb-3 flex-1 space-y-3 overflow-y-auto rounded-radius-lg border border-border bg-surface p-4"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-sm bg-primary text-bg'
                  : 'rounded-bl-sm bg-surface-2 text-text'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-3">
              <span className="dh-dot h-1.5 w-1.5 rounded-full bg-text-sub" />
              <span className="dh-dot h-1.5 w-1.5 rounded-full bg-text-sub" style={{ animationDelay: '0.15s' }} />
              <span className="dh-dot h-1.5 w-1.5 rounded-full bg-text-sub" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* 快捷问题 */}
      <div className="reveal reveal-4 mb-3 flex gap-2 overflow-x-auto pb-1">
        {QUICK_QUESTIONS.map((q) => {
          const Icon = q.icon
          return (
            <button
              key={q.text}
              onClick={() => send(q.text)}
              disabled={thinking}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-sub transition-colors active:bg-surface-2 disabled:opacity-40"
            >
              <Icon size={13} className="text-primary" />
              {q.text}
            </button>
          )
        })}
      </div>

      {/* 输入栏 */}
      <div className="reveal reveal-5 mb-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(input)
          }}
          placeholder="问教练点什么…"
          className="flex-1 rounded-full border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-sub focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || thinking}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-bg transition-transform active:scale-95 disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
