import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, MessageSquare, Send, Mail } from 'lucide-react'
import { loadJSON, saveJSON } from '../utils/storage'
import { useToast } from '../components/Toast'

const FAQS = [
  {
    q: 'BTWE 是什么比赛？',
    a: 'BTWE（betterWE 健身体能赛）是室内功能性体能赛，标准赛制为 (1+2)×4：4 个模块，每个模块 = 800m 跑 + 1 个心肺项目 + 1 个力量项目，共 8 个动作。',
  },
  {
    q: '为什么训练前必须连接器械？',
    a: 'BTWE 训练以器械数据为权威源。连接后计时、距离、卡路里、心率都来自真实设备，目标达成后才会自动进入下一阶段，保证训练数据可信。',
  },
  {
    q: '心率带连接不上怎么办？',
    a: '请确认：① 心率带已佩戴并激活；② 手机蓝牙已开启；③ 使用最新版 Chrome 或 Edge 浏览器；④ 靠近设备 3 米内重试。',
  },
  {
    q: '训练数据保存在哪里？',
    a: '所有数据保存在本地设备，不上传服务器。清除应用数据会同时清空训练记录。',
  },
  {
    q: '如何切换训练计划？',
    a: '进入「计划」页选择适合你的方案，点击「选择此计划」即可生效，首页与训练会使用当前计划。',
  },
  {
    q: '中途结束训练会保存数据吗？',
    a: '长按「结束训练」2 秒会终止本次训练，中途数据不会保存。完成全部 4 模块后点击完成才会写入训练记录。',
  },
]

interface Feedback {
  time: string
  text: string
}

export default function Help() {
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(0)
  const [text, setText] = useState('')

  function submit() {
    const content = text.trim()
    if (content.length < 5) {
      toast('请至少输入 5 个字')
      return
    }
    const list = loadJSON<Feedback[]>('btwe:feedback', [])
    saveJSON('btwe:feedback', [
      { time: new Date().toISOString(), text: content },
      ...list,
    ])
    setText('')
    toast('感谢反馈，我们已收到！')
  }

  return (
    <div className="px-5 pt-5 lg:mx-auto lg:w-full lg:max-w-[720px] lg:px-8 lg:pt-7">
      <header className="reveal reveal-1 mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-base font-bold">帮助与反馈</h1>
        <div className="h-9 w-9" />
      </header>

      {/* FAQ */}
      <section className="reveal reveal-2 mb-6">
        <h3 className="mb-2 px-1 text-xs font-semibold text-text-sub">常见问题</h3>
        <div className="overflow-hidden rounded-radius-lg border border-border bg-surface">
          {FAQS.map((f, i) => (
            <div key={f.q} className={i !== FAQS.length - 1 ? 'border-b border-border' : ''}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="text-sm font-medium">{f.q}</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-text-sub transition-transform ${
                    open === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open === i && (
                <p className="px-4 pb-4 text-xs leading-relaxed text-text-sub">{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 反馈 */}
      <section className="reveal reveal-3 mb-6">
        <h3 className="mb-2 px-1 text-xs font-semibold text-text-sub">意见反馈</h3>
        <div className="rounded-radius-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-text-sub">
            <MessageSquare size={14} /> 使用中遇到的问题或建议
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="例如：心率带搜索不到设备…"
            className="w-full resize-none rounded-radius-md border border-border bg-surface-2 p-3 text-sm text-text placeholder:text-text-sub/60 focus:border-primary focus:outline-none"
          />
          <button
            onClick={submit}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-radius-md bg-primary py-2.5 text-sm font-semibold text-bg transition-transform active:scale-[0.98]"
          >
            <Send size={15} /> 提交反馈
          </button>
        </div>
      </section>

      {/* 联系 */}
      <section className="reveal reveal-4">
        <div className="flex items-center gap-3 rounded-radius-lg border border-border bg-surface p-4">
          <Mail size={18} className="text-primary" />
          <div>
            <p className="text-sm font-medium">联系客服</p>
            <p className="text-xs text-text-sub">support@betterwe.fit</p>
          </div>
        </div>
      </section>
    </div>
  )
}
