import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Flame, Heart, Share2, Trash2, TriangleAlert, Zap } from 'lucide-react'
import { deleteSession, deleteStrengthSession, fetchSessions, fetchStrengthSessions, flushMachineSessions, subscribeToMachineSessions } from '../api'
import type { MachineSession, MachineType, StrengthSession } from '../types'
import { MACHINES, MACHINE_MAP, MODE_LABELS } from '../mock/data'
import { EQUIPMENT_LABELS } from '../mock/strength'
import { PIN_MACHINE_MAP } from '../mock/pinMachines'
import { formatDate, formatDistance, formatDuration } from '../utils/stats'
import { formatVolume } from '../utils/strength'
import { formatTime } from '../utils/format'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import ShareSheet from '../components/ShareSheet'

type Filter = 'all' | 'strength' | MachineType

type Item =
  | { kind: 'cardio'; s: MachineSession }
  | { kind: 'strength'; s: StrengthSession }

export default function Records() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<MachineSession[]>([])
  const [strength, setStrength] = useState<StrengthSession[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [shareSession, setShareSession] = useState<MachineSession | null>(null)
  const [shareStrength, setShareStrength] = useState<StrengthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const toast = useToast()
  const { user } = useAuth()

  useEffect(() => {
    let active = true
    let latest = 0
    const refresh = async () => {
      const version = ++latest
      const [s, st] = await Promise.all([fetchSessions(), fetchStrengthSessions()])
      if (active && version === latest) {
        setSessions(s)
        setStrength(st)
        setLoading(false)
      }
    }
    const unsubscribe = subscribeToMachineSessions(() => void refresh())
    void refresh()
    return () => {
      active = false
      unsubscribe()
    }
  }, [user?.id])

  const items: Item[] = [
    ...sessions.map((s) => ({ kind: 'cardio' as const, s })),
    ...strength.map((s) => ({ kind: 'strength' as const, s })),
  ]
    .filter((it) => {
      if (filter === 'all') return true
      if (filter === 'strength') return it.kind === 'strength'
      return it.kind === 'cardio' && it.s.machine === filter
    })
    .sort((a, b) => +new Date(b.s.date) - +new Date(a.s.date))

  async function handleDelete(id: string, kind: Item['kind']) {
    try {
      if (kind === 'strength') {
        await deleteStrengthSession(id)
        setStrength((prev) => prev.filter((s) => s.id !== id))
      } else {
        await deleteSession(id)
        setSessions((prev) => prev.filter((s) => s.id !== id))
      }
      toast(t('记录已删除'))
    } catch (error) {
      toast(t(error instanceof Error ? error.message : '删除失败，请重试'))
    }
  }

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 mb-4">
        <h1 className="font-display text-[20px] font-bold leading-tight">{t('训练记录')}</h1>
        <p className="mt-1 text-xs text-text-sub">
          {t('共 {{count}} 次训练', { count: sessions.length + strength.length })}
        </p>
        {sessions.some((s) => s.syncState) && (
          <button
            className="mt-2 text-xs text-primary disabled:opacity-60"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true)
              await flushMachineSessions(true)
              setSessions(await fetchSessions())
              setSyncing(false)
            }}
          >
            {syncing ? t('正在同步…') : t('重试同步')}
          </button>
        )}
      </header>

      <div className="reveal reveal-2 mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['all', 'strength', ...MACHINES.map((m) => m.type)] as Filter[]).map((key) => {
          const label =
            key === 'all' ? t('全部') : key === 'strength' ? t('力量') : t(MACHINE_MAP[key as MachineType].name)
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                filter === key ? 'border-text bg-text text-bg' : 'border-border bg-surface text-text-sub'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <TriangleAlert size={24} className="mx-auto mb-2 text-text-sub" />
          <p className="text-sm text-text-sub">{t('还没有这类训练记录')}</p>
        </div>
      ) : (
        <div className="space-y-2 pb-2 hd:lg:grid hd:lg:grid-cols-2 hd:lg:items-start hd:lg:gap-3 hd:lg:space-y-0">
          {items.map((it) => {
            const open = expanded === it.s.id
            if (it.kind === 'strength') return renderStrength(it.s, open, setExpanded, setShareStrength, handleDelete, t)
            return renderCardio(it.s, open, setExpanded, setShareSession, handleDelete, t)
          })}
        </div>
      )}

      {shareSession && (
        <ShareSheet
          open
          onClose={() => setShareSession(null)}
          session={shareSession}
          machineName={t(MACHINE_MAP[shareSession.machine].name)}
          subtitle={
            shareSession.completed
              ? t(MODE_LABELS[shareSession.mode])
              : t('{{mode}} · 提前结束', { mode: t(MODE_LABELS[shareSession.mode]) })
          }
          nickname={user?.nickname}
          avatar={user?.avatar}
        />
      )}

      {shareStrength && (
        <ShareSheet
          open
          onClose={() => setShareStrength(null)}
          variant="strength"
          session={shareStrength}
          subtitle={
            shareStrength.machineId && PIN_MACHINE_MAP[shareStrength.machineId]
              ? t('{{name}} · 智能插销自动记录', {
                  name: t(PIN_MACHINE_MAP[shareStrength.machineId].name),
                })
              : t(EQUIPMENT_LABELS[shareStrength.equipment])
          }
          nickname={user?.nickname}
          avatar={user?.avatar}
        />
      )}
    </div>
  )
}

function renderCardio(
  s: MachineSession,
  open: boolean,
  setExpanded: (id: string | null) => void,
  setShareSession: (s: MachineSession) => void,
  handleDelete: (id: string, kind: Item['kind']) => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const machine = MACHINE_MAP[s.machine]
  const targetLabel =
    s.mode === 'distance'
      ? t('目标 {{distance}} km', { distance: (s.target ?? 0) / 1000 })
      : s.mode === 'time'
        ? t('目标 {{time}}', { time: formatTime(s.target ?? 0) })
        : s.mode === 'interval'
          ? t('{{count}} 组间歇', { count: s.target ?? 0 })
          : t('自由训练')
  return (
    <div key={s.id} className="overflow-hidden rounded-md border border-border bg-surface">
      <button
        onClick={() => setExpanded(open ? null : s.id)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {t(machine.name)}
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-sub">
              {t(MODE_LABELS[s.mode])}
            </span>
            {!s.completed && <span className="text-[11px] text-warning">{t('未达成')}</span>}
            {s.syncState && (
              <span className="text-[11px] text-warning">{s.syncState === 'failed' ? t('同步失败') : t('待同步')}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-sub">
            {formatDate(s.date)} · {formatDuration(s.durationSec)} · {targetLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="font-mono text-sm font-bold tabular-nums">{formatDistance(s.distanceM)}</p>
            <p className="text-[13px] text-text-sub">{s.calories} kcal</p>
          </div>
          <ChevronDown size={15} className={`text-text-sub transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Zap, label: '平均功率', value: s.power ? `${s.power} W` : '—' },
              { icon: Flame, label: '消耗', value: `${s.calories} kcal` },
              { icon: Heart, label: '平均心率', value: s.avgHr ? `${s.avgHr} bpm` : '—' },
              { label: '平均速度', value: s.avgSpeed ? `${s.avgSpeed} km/h` : '—' },
              { label: '桨频/转速', value: s.cadence ? `${s.cadence}` : '—' },
              { label: '总用时', value: formatTime(s.durationSec) },
            ].map((it) => {
              const ItIcon = 'icon' in it ? it.icon : null
              return (
                <div key={it.label} className="rounded-sm bg-surface-2 px-2 py-2">
                  {ItIcon && <ItIcon size={11} className="text-text-sub" />}
                  <p className={`font-mono text-xs font-semibold ${ItIcon ? 'mt-1' : ''}`}>{it.value}</p>
                  <p className="text-[11px] text-text-sub">{t(it.label)}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => handleDelete(s.id, 'cardio')}
              className="flex items-center gap-1 text-[14px] text-danger"
            >
              <Trash2 size={12} /> {t('删除这条记录')}
            </button>
            <button
              onClick={() => setShareSession(s)}
              className="flex items-center gap-1 text-[14px] text-text-sub"
            >
              <Share2 size={12} /> {t('分享')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function renderStrength(
  s: StrengthSession,
  open: boolean,
  setExpanded: (id: string | null) => void,
  setShareStrength: (s: StrengthSession) => void,
  handleDelete: (id: string, kind: Item['kind']) => void,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const best = s.bestSet
  return (
    <div key={s.id} className="overflow-hidden rounded-md border border-border bg-surface">
      <button
        onClick={() => setExpanded(open ? null : s.id)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {t(s.exerciseName)}
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-sub">
              {t(EQUIPMENT_LABELS[s.equipment])}
            </span>
            {s.source === 'pin' && (
              <span className="rounded-full bg-connected/10 px-1.5 py-0.5 text-[11px] text-connected">
                {t('智能插销')}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-sub">
            {formatDate(s.date)} · {formatDuration(s.durationSec)} · {t('{{count}} 组 · {{reps}} 次', { count: s.sets.length, reps: s.totalReps })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="font-mono text-sm font-bold tabular-nums">{formatVolume(s.volumeKg)}</p>
            <p className="text-[13px] text-text-sub">
              {best ? t('最佳 {{result}}', { result: `${best.weight > 0 ? `${best.weight}kg × ` : ''}${best.reps}` }) : '—'}
            </p>
          </div>
          <ChevronDown size={15} className={`text-text-sub transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          <div className="overflow-hidden rounded-sm border border-border">
            <div className="grid grid-cols-[34px_1fr_1fr_50px_66px] bg-surface-2 px-2.5 py-1.5 text-[11px] text-text-sub">
              <span>{t('组')}</span>
              <span>{t('重量')}</span>
              <span>{t('次数')}</span>
              <span>{s.source === 'pin' ? t('幅度') : 'RPE'}</span>
              <span className="text-right">{t('容量')}</span>
            </div>
            {s.sets.map((set, i) => (
              <div
                key={set.at}
                className="grid grid-cols-[34px_1fr_1fr_50px_66px] px-2.5 py-1.5 text-[12px] tabular-nums [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
              >
                <span className="font-mono text-text-sub">{i + 1}</span>
                <span className="font-mono font-semibold">
                  {set.weight > 0 ? `${set.weight} kg` : t('自重')}
                </span>
                <span className="font-mono">{set.reps}</span>
                <span className="font-mono text-text-sub">
                  {s.source === 'pin' ? (set.romCm ? `${set.romCm}cm` : '—') : (set.rpe ?? '—')}
                </span>
                <span className="text-right font-mono text-text-sub">
                  {set.weight > 0 ? Math.round(set.weight * set.reps) : '—'}
                </span>
              </div>
            ))}
          </div>
          {s.e1rm > 0 && (
            <p className="mt-2 text-[11px] text-text-sub">
              {t('预估 1RM {{e1rm}} kg · 总容量 {{volume}}', { e1rm: s.e1rm, volume: formatVolume(s.volumeKg) })}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => handleDelete(s.id, 'strength')}
              className="flex items-center gap-1 text-[14px] text-danger"
            >
              <Trash2 size={12} /> {t('删除这条记录')}
            </button>
            <button
              onClick={() => setShareStrength(s)}
              className="flex items-center gap-1 text-[14px] text-text-sub"
            >
              <Share2 size={12} /> {t('分享')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
