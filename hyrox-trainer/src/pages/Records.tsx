import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { TrendingDown, Calendar, Clock, AlertCircle, ChevronDown, Trash2, Share2 } from 'lucide-react'
import { deleteSession, fetchHistory } from '../api'
import type { SessionRecord } from '../types'
import { formatTime } from '../utils/format'
import { planNameOf } from '../utils/planChat'
import { getSsoUser } from '../utils/sso'
import { useToast } from '../components/Toast'
import ShareSheet from '../components/ShareSheet'

type Filter = 'all' | 'completed' | 'incomplete'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'completed', label: '已完成' },
  { key: 'incomplete', label: '未完成' },
]

export default function Records() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<SessionRecord | null>(null)
  const toast = useToast()
  const sso = getSsoUser()

  function reload() {
    setLoading(true)
    fetchHistory().then((s) => {
      setSessions(s)
      setLoading(false)
    })
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleDelete(id: string) {
    if (!window.confirm('确定删除这条训练记录吗？')) return
    try {
      const pending = await deleteSession(id, sessions.find((row) => row.id === id)?.cloudId)
      toast(pending ? '记录已移除，等待云端确认删除' : '记录已删除')
    } catch {
      toast('未能保存删除操作，请重试')
      return
    }
    setExpanded(null)
    reload()
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    )
  }

  // 图表数据：只统计完赛记录（未完成的不算"完赛时间趋势"），按时间正序
  const chartData = [...sessions]
    .filter((s) => s.completed)
    .reverse()
    .map((s) => ({ date: s.date.slice(5), time: s.totalTime, label: formatTime(s.totalTime) }))

  const completed = sessions.filter((s) => s.completed)
  const best = completed.length ? Math.min(...completed.map((s) => s.totalTime)) : 0
  const avg = completed.length
    ? Math.floor(completed.reduce((a, s) => a + s.totalTime, 0) / completed.length)
    : 0

  const visible = sessions.filter((s) =>
    filter === 'all' ? true : filter === 'completed' ? s.completed : !s.completed
  )

  return (
    <div className="px-5 pt-5 lg:px-8 lg:pt-7">
      <header className="reveal reveal-1 mb-6">
        <h1 className="font-display text-2xl font-bold lg:text-[26px]">训练记录</h1>
        <p className="mt-1 text-sm text-text-sub">追踪你的训练成绩变化</p>
      </header>

      {/* 汇总 */}
      <div className="reveal reveal-2 mb-6 grid grid-cols-3 gap-3 lg:gap-5">
        <div className="rounded-radius-md border border-border bg-surface p-3 lg:p-4">
          <p className="text-[11px] text-text-sub">总训练</p>
          <p className="font-display text-xl font-bold text-text">{sessions.length}</p>
        </div>
        <div className="rounded-radius-md border border-border bg-surface p-3 lg:p-4">
          <p className="text-[11px] text-text-sub">最佳</p>
          <p className="font-mono text-xl font-bold text-primary">
            {best ? formatTime(best) : '—'}
          </p>
        </div>
        <div className="rounded-radius-md border border-border bg-surface p-3 lg:p-4">
          <p className="text-[11px] text-text-sub">平均</p>
          <p className="font-mono text-xl font-bold text-accent">
            {avg ? formatTime(avg) : '—'}
          </p>
        </div>
      </div>

      {/* 趋势图 */}
      <section className="reveal reveal-3 mb-6 rounded-radius-lg border border-border bg-surface p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold">
            <TrendingDown size={16} className="text-primary" /> 完赛时间趋势
          </h3>
          <span className="text-[10px] text-text-sub">越低越好</span>
        </div>
        {chartData.length < 2 ? (
          <div className="flex h-48 items-center justify-center rounded-radius-md border border-dashed border-border text-xs text-text-sub lg:h-56">
            至少完成 2 次训练后生成趋势图
          </div>
        ) : (
          <div className="h-48 lg:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a33" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatTime(v).replace(/:\d{2}$/, '')}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1f1f25',
                    border: '1px solid #2a2a33',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(value) => [formatTime(Number(value)), '用时']}
                />
                <Line
                  type="monotone"
                  dataKey="time"
                  stroke="#eab308"
                  strokeWidth={2.5}
                  dot={{ fill: '#eab308', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 历史列表 */}
      <section className="reveal reveal-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">历史训练</h3>
          <div className="flex gap-1 rounded-full border border-border bg-surface p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                  filter === f.key ? 'bg-primary text-bg' : 'text-text-sub'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-radius-md border border-dashed border-border p-8 text-center text-sm text-text-sub">
            暂无符合条件的训练记录
          </div>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
            {visible.map((s) => {
              const isOpen = expanded === s.id
              return (
                <div
                  key={s.id}
                  className={`overflow-hidden rounded-radius-md border border-border bg-surface ${isOpen ? 'lg:col-span-2' : ''}`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : s.id)}
                    className="w-full p-4 text-left transition-colors active:bg-surface-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-text-sub" />
                        <span className="text-sm">{s.date}</span>
                        {!s.completed && (
                          <span className="flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                            <AlertCircle size={10} /> 未完成
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-lg font-bold text-primary">
                          {formatTime(s.totalTime)}
                        </p>
                        <ChevronDown
                          size={14}
                          className={`text-text-sub transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-sub">
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> 8 组
                      </span>
                      <div className="flex gap-1.5 lg:flex-wrap lg:justify-end">
                        {s.moduleTimes.map((t, i) => (
                          <span
                            key={i}
                            className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            M{i + 1}:{formatTime(t)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-text-sub">计划</p>
                        <p className="text-xs font-medium">{planNameOf(s.planId)}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-text-sub">总用时</p>
                        <p className="font-mono text-sm font-bold text-primary">
                          {formatTime(s.totalTime)}
                        </p>
                      </div>
                      {s.runSplit.length > 0 && (
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-xs text-text-sub">各段用时</p>
                          <p className="font-mono text-[11px] text-text-sub">
                            {s.runSplit.map((t, i) => `M${i + 1} ${formatTime(t)}`).join(' · ')}
                          </p>
                        </div>
                      )}
                      {s.notes && (
                        <p className="mt-2 text-xs italic text-text-sub">💬 {s.notes}</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => setShareTarget(s)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md bg-primary py-2 text-xs font-semibold text-bg"
                        >
                          <Share2 size={13} /> 分享成绩
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-radius-md border border-danger/40 py-2 text-xs text-danger"
                        >
                          <Trash2 size={13} /> 删除记录
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ShareSheet
        open={!!shareTarget}
        session={shareTarget}
        plan={shareTarget ? planNameOf(shareTarget.planId) : ''}
        nickname={sso?.nickname}
        avatar={sso?.avatar}
        onClose={() => setShareTarget(null)}
      />
    </div>
  )
}
