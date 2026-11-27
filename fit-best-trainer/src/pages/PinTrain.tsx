import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BatteryMedium,
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  Link2,
  Loader2,
  Radio,
  RotateCcw,
  Share2,
  Timer,
  Trash2,
  Trophy,
  Unlink,
  WifiOff,
} from 'lucide-react'
import { fetchStrengthSessions, saveStrengthSession } from '../api'
import type { StrengthSession, StrengthSet } from '../types'
import { PIN_MACHINE_MAP, PIN_MACHINES } from '../mock/pinMachines'
import { EXERCISE_MAP } from '../mock/strength'
import WaveChart from '../components/WaveChart'
import { exercisePR, formatVolume, summarizeStrength } from '../utils/strength'
import { formatTime } from '../utils/format'
import { formatDate } from '../utils/stats'
import { useToast } from '../components/Toast'
import { useSmartPin } from '../hooks/useSmartPin'
import BluetoothSearchDialog from '../components/BluetoothSearchDialog'
import { useAuth } from '../context/AuthContext'
import { currentUserId } from '../utils/auth'
import ShareSheet from '../components/ShareSheet'
import { useKeepAwake } from '../platform/keepAwake'

const REST_SEC = 90

export default function PinTrain() {
  const { t } = useTranslation()
  const { machineId } = useParams()
  const machine = machineId ? PIN_MACHINE_MAP[machineId] : null
  const exercise = machine ? EXERCISE_MAP[machine.exerciseId] : null
  const navigate = useNavigate()
  const toast = useToast()

  const ownerId = useRef(currentUserId())
  const pin = useSmartPin(machine ?? null, ownerId.current)
  const { user } = useAuth()
  const [sets, setSets] = useState<StrengthSet[]>([])
  const [restRemain, setRestRemain] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [history, setHistory] = useState<StrengthSession[]>([])
  const [finished, setFinished] = useState<StrengthSession | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useKeepAwake(!finished && (pin.status === 'connected' || sets.length > 0))

  const startedAt = useRef(Date.now())
  const lastRep = useRef(0)
  const idleSince = useRef<number | null>(null)

  useEffect(() => {
    fetchStrengthSessions(ownerId.current).then(setHistory)
  }, [])

  // 未指定器械进入：连接后若已绑定，自动跳转到绑定的器械页
  useEffect(() => {
    if (!machine && pin.device && pin.binding) {
      navigate(`/pin/${pin.binding.machineId}`, { replace: true })
    }
  }, [machine, pin.device, pin.binding, navigate])

  useEffect(() => {
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (restRemain <= 0) return
    const t = window.setTimeout(() => setRestRemain((v) => v - 1), 1000)
    return () => window.clearTimeout(t)
  }, [restRemain])

  // 真机：超过 6 秒无动作且本组有次数时，自动结束本组
  useEffect(() => {
    if (pin.status !== 'connected' || !exercise) return
    const t = window.setInterval(() => {
      if (pin.live.reps > lastRep.current) {
        lastRep.current = pin.live.reps
        idleSince.current = Date.now()
        return
      }
      if (pin.live.phase !== 'idle' || pin.live.reps < 3) return
      if (!idleSince.current) {
        idleSince.current = Date.now()
        return
      }
      if (Date.now() - idleSince.current > 6000) {
        lastRep.current = 0
        idleSince.current = null
        closeSet(true)
      }
    }, 1000)
    return () => window.clearInterval(t)
  }, [pin.status, pin.live.reps, pin.live.phase, exercise])

  const pr = useMemo(
    () => (exercise ? exercisePR(history, exercise.id) : 0),
    [history, exercise],
  )

  // 该器械最近的训练记录（含每组明细）
  const machineHistory = useMemo(
    () =>
      history
        .filter((s) => s.machineId === machine?.id)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 3),
    [history, machine],
  )

  if (machineId && (!machine || !exercise)) {
    return (
      <div className="p-8 text-center text-text-sub">
        {t('器械不存在')}
        <button className="mt-4 block w-full text-primary" onClick={() => navigate('/strength')}>
          {t('返回动作库')}
        </button>
      </div>
    )
  }

  const connected = pin.status === 'connected'
  const totalVolume = sets.reduce((a, s) => a + s.weight * s.reps, 0)
  const totalReps = sets.reduce((a, s) => a + s.reps, 0)

  function closeSet(auto = false) {
    if (pin.live.reps <= 0) {
      if (!auto) toast(t('本组还没有检测到次数'))
      return
    }
    const set: StrengthSet = {
      weight: pin.live.weight,
      reps: pin.live.reps,
      romCm: pin.live.romCm || undefined,
      tempoSec: pin.live.tempoSec || undefined,
      at: Date.now(),
    }
    setSets((prev) => [...prev, set])
    pin.resetReps()
    lastRep.current = 0
    idleSince.current = null
    setRestRemain(REST_SEC)
    if (auto) toast(t('检测到组结束，已自动记录'))
  }

  async function finish() {
    const pending: StrengthSet[] =
      pin.live.reps > 0
        ? [
            {
              weight: pin.live.weight,
              reps: pin.live.reps,
              romCm: pin.live.romCm || undefined,
              tempoSec: pin.live.tempoSec || undefined,
              at: Date.now(),
            },
          ]
        : []
    const finalSets = [...sets, ...pending]
    if (finalSets.length === 0) {
      toast(t('至少完成一组再保存'))
      return
    }
    setSaving(true)
    const session = summarizeStrength({
      kind: 'strength',
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      exerciseId: exercise!.id,
      exerciseName: exercise!.name,
      equipment: 'machine',
      machineId: machine!.id,
      source: 'pin',
      sets: finalSets,
      durationSec: Math.max(1, elapsed),
      completed: true,
    })
    try {
      await saveStrengthSession(session, ownerId.current)
      setFinished(session)
      pin.disconnect()
    } catch {
      toast(t('保存失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  async function bindPin(id: string, onBound: () => void) {
    try {
      await pin.bindTo(id)
      onBound()
    } catch {
      toast(t('绑定失败，请重试'))
    }
  }

  async function unbindPin() {
    try {
      await pin.unbind()
    } catch {
      toast(t('解绑失败，请重试'))
    }
  }

  if (finished) {
    return (
      <div className="px-5 pt-5 pb-6 hd:lg:mx-auto hd:lg:max-w-[760px] hd:lg:px-8 hd:lg:pt-8">
        <div className="sheet-up rounded-lg border border-border bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-text/5">
            <CheckCircle2 size={36} />
          </div>
          <h1 className="font-display text-[26px] font-bold">{t('训练完成')}</h1>
          <p className="mt-1 text-[15px] text-text-sub">
            {t('{{name}} · 智能插销自动记录', { name: machine ? t(machine.name) : t('力量训练') })}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { label: '容量', value: formatVolume(finished.volumeKg) },
              { label: '总次数', value: `${finished.totalReps}` },
              { label: '总用时', value: formatTime(finished.durationSec) },
            ].map((it) => (
              <div key={it.label} className="rounded-sm bg-surface-2 px-2 py-3">
                <p className="font-mono text-base font-bold tabular-nums">{it.value}</p>
                <p className="mt-1 text-[11px] text-text-sub">{t(it.label)}</p>
              </div>
            ))}
          </div>
          {pr > 0 && finished.e1rm > pr && (
            <p className="mt-3 flex items-center justify-center gap-1 text-[13px] font-medium text-primary">
              <Trophy size={13} /> {t('刷新个人最佳（原 {{pr}} kg）', { pr })}
            </p>
          )}

          {/* 每组明细 */}
          <div className="mt-5 overflow-hidden rounded-md border border-border text-left">
            <div className="grid grid-cols-[40px_1fr_1fr_64px_72px] border-b border-border px-3 py-2 text-[11px] text-text-sub hd:lg:grid-cols-[48px_1fr_1fr_1fr_72px_88px]">
              <span>{t('组')}</span>
              <span>{t('配重')}</span>
              <span>{t('次数')}</span>
              <span>{t('幅度')}</span>
              <span className="hidden hd:lg:block">{t('节奏')}</span>
              <span className="text-right">{t('容量')}</span>
            </div>
            {finished.sets.map((s, i) => (
              <div
                key={s.at}
                className="grid grid-cols-[40px_1fr_1fr_64px_72px] items-center px-3 py-2.5 text-[13px] tabular-nums hd:lg:grid-cols-[48px_1fr_1fr_1fr_72px_88px] [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
              >
                <span className="font-mono text-text-sub">{i + 1}</span>
                <span className="font-mono font-semibold">{s.weight} kg</span>
                <span className="font-mono">{s.reps}</span>
                <span className="font-mono text-text-sub">{s.romCm ? `${s.romCm}cm` : '—'}</span>
                <span className="hidden font-mono text-text-sub hd:lg:block">
                  {s.tempoSec ? `${s.tempoSec}s` : '—'}
                </span>
                <span className="text-right font-mono text-text-sub">
                  {Math.round(s.weight * s.reps)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border bg-surface-2 px-3 py-2.5 text-[12px]">
              <span className="text-text-sub">{t('共 {{count}} 组 · 最佳组', { count: finished.sets.length })}</span>
              <span className="font-mono text-text-sub">
                {finished.bestSet ? `${finished.bestSet.weight}kg × ${finished.bestSet.reps}` : '—'}
                {finished.e1rm ? ` · 1RM ${finished.e1rm}kg` : ''}
              </span>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border py-3.5 text-[17px] font-medium"
            >
              <Share2 size={18} />
              {t('分享成绩')}
            </button>
            <button
              onClick={() => navigate('/records')}
              className="flex-1 rounded-md bg-text py-3.5 text-[17px] font-semibold text-bg"
            >
              {t('查看记录')}
            </button>
          </div>
          <button
            onClick={() => navigate('/strength')}
            className="mt-2 w-full rounded-md border border-border py-3.5 text-[17px] font-medium text-text-sub"
          >
            {t('返回器械')}
          </button>
        </div>

        {finished && (
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            variant="strength"
            session={finished}
            subtitle={machine?.name ? t('{{name}} · 智能插销自动记录', { name: t(machine.name) }) : undefined}
            nickname={user?.nickname}
            avatar={user?.avatar}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {pin.searchRequest && <BluetoothSearchDialog request={pin.searchRequest} />}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/92 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => navigate('/strength')}
          aria-label={t('返回')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">
            {machine ? t(machine.name) : t('连接插销')}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-text-sub">
            {machine
              ? t('插片式 · {{weight}} kg × {{count}} 片', { weight: machine.plateKg, count: machine.plates })
              : t('插在配重片上即可识别器械')}
          </p>
        </div>
        {connected ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-connected/10 px-2 py-1 text-[11px] text-connected">
            <BluetoothConnected size={12} /> {t('已连接')}
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-text-sub">
            <WifiOff size={12} /> {t('未连接')}
          </span>
        )}
      </header>

      <div className="flex-1 px-5 pt-4 hd:lg:px-8 hd:lg:pt-6">
        {!connected ? (
          <>
          <section className="rounded-lg border border-border bg-surface p-5 hd:lg:mx-auto hd:lg:max-w-[620px] hd:lg:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-primary">
              <Radio size={26} />
            </div>
            <h1 className="mt-3 text-center font-display text-lg font-bold">{t('连接智能插销')}</h1>
            <p className="mt-1 text-center text-[13px] leading-relaxed text-text-sub">
              {t('插在配重片上即可读取实际配重，')}
              <br />
              {t('激光测距识别动作幅度与次数')}
            </p>

            {pin.status === 'scanning' ? (
              <div className="mt-5 flex items-center justify-center gap-2 text-[13px] text-text-sub">
                <Loader2 size={14} className="animate-spin" /> {t('正在搜索附近插销…')}
              </div>
            ) : (
              <button
                onClick={() => pin.scan()}
                disabled={pin.status === 'connecting'}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-text py-3.5 text-[16px] font-semibold text-bg disabled:opacity-40"
              >
                {pin.status === 'connecting' ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> {t('连接中…')}
                  </>
                ) : (
                  <>
                    <Bluetooth size={17} /> {t('搜索并连接')}
                  </>
                )}
              </button>
            )}

            <p className="mt-4 text-center text-[11px] leading-relaxed text-text-sub">
              {t('已连接其它器械？请先断开原设备')}
              <br />
              {t('连接后自动读取配重、次数与幅度')}
            </p>
          </section>

          {/* 该器械历史记录：每组明细 */}
          {machine && (
            <section className="mt-4 pb-6 hd:lg:mx-auto hd:lg:mt-6 hd:lg:max-w-[900px]">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-display text-[17px] font-bold hd:lg:text-[19px]">{t('训练数据')}</h2>
                <span className="text-[12px] text-text-sub">
                  {t('共 {{count}} 次训练', { count: history.filter((s) => s.machineId === machine.id).length })}
                </span>
              </div>
              {machineHistory.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-text-sub">
                  {t('还没有{{name}}的训练记录，连接插销完成第一组即可自动记录', { name: t(machine.name) })}
                </div>
              ) : (
                <div className="space-y-3 hd:lg:grid hd:lg:grid-cols-2 hd:lg:gap-4 hd:lg:space-y-0">
                  {machineHistory.map((s) => (
                    <div key={s.id} className="overflow-hidden rounded-md border border-border bg-surface">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                        <span className="text-[13px] font-medium">{formatDate(s.date)}</span>
                        <span className="font-mono text-[12px] text-text-sub">
                          {t('{{count}} 组 · {{reps}} 次 · {{volume}}', { count: s.sets.length, reps: s.totalReps, volume: formatVolume(s.volumeKg) })}
                        </span>
                      </div>
                      <div className="grid grid-cols-[36px_1fr_1fr_64px_72px] border-b border-border px-3 py-1.5 text-[11px] text-text-sub">
                        <span>{t('组')}</span>
                        <span>{t('配重')}</span>
                        <span>{t('次数')}</span>
                        <span>{t('幅度')}</span>
                        <span className="text-right">{t('容量')}</span>
                      </div>
                      {s.sets.map((set, i) => (
                        <div
                          key={set.at ?? i}
                          className="grid grid-cols-[36px_1fr_1fr_64px_72px] items-center px-3 py-2 text-[13px] tabular-nums [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
                        >
                          <span className="font-mono text-text-sub">{i + 1}</span>
                          <span className="font-mono font-semibold">{set.weight} kg</span>
                          <span className="font-mono">{set.reps}</span>
                          <span className="font-mono text-text-sub">
                            {set.romCm ? `${set.romCm}cm` : '—'}
                          </span>
                          <span className="text-right font-mono text-text-sub">
                            {Math.round(set.weight * set.reps)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          </>
        ) : !machine ? (
          <section className="rounded-lg border border-border bg-surface p-5 text-center hd:lg:mx-auto hd:lg:max-w-[680px] hd:lg:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Link2 size={26} />
            </div>
            <h1 className="mt-3 font-display text-lg font-bold">{t('插销已连接')}</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-text-sub">
              {t('{{name}} 尚未绑定器械', { name: pin.device?.name })}
              <br />
              {t('选择它所插入的器械，完成绑定')}
            </p>
            <div className="mt-4 grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto hd:lg:max-h-none hd:lg:grid-cols-3">
              {PIN_MACHINES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    void bindPin(m.id, () => navigate(`/pin/${m.id}`, { replace: true }))
                  }}
                  className="rounded-md border border-border bg-surface-2 p-3 text-left active:scale-[0.97]"
                >
                  <p className="text-[14px] font-medium">{t(m.name)}</p>
                  <p className="mt-0.5 text-[11px] text-text-sub">
                    {m.plateKg} kg × {m.plates} {t('片')}
                  </p>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            {pin.binding && pin.binding.machineId !== machine.id && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-[13px]">
                <span className="text-text-sub">{t('此插销已绑定到')}</span>
                <span className="font-medium">
                  {PIN_MACHINE_MAP[pin.binding.machineId]?.name
                    ? t(PIN_MACHINE_MAP[pin.binding.machineId].name)
                    : ''}
                </span>
                <button
                  onClick={() => navigate(`/pin/${pin.binding!.machineId}`)}
                  className="ml-auto rounded-sm bg-text px-2 py-1 text-[12px] font-medium text-bg"
                >
                  {t('切换')}
                </button>
              </div>
            )}
            <div className="hd:lg:grid hd:lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] hd:lg:items-start hd:lg:gap-5">
            <div className="[&>*:first-child]:mt-0">
            {/* 实时配重 */}
            <section className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-[12px] text-text-sub">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-connected" />
                    {t('插销实时读数')}
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="font-mono text-[44px] font-bold leading-none tabular-nums hd:lg:text-[64px]">
                      {pin.live.weight}
                    </span>
                    <span className="text-[14px] text-text-sub">kg</span>
                  </p>
                  <p className="mt-1 text-[12px] text-text-sub">
                    {t('第 {{plate}} 片 / 共 {{count}} 片', { plate: pin.live.plate, count: machine.plates })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-[12px] text-text-sub">
                    <BatteryMedium size={14} /> {pin.live.battery}%
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-text-sub">{pin.device?.name}</p>
                </div>
              </div>

              {/* 配重档位条 */}
              <div className="mt-3 flex gap-[3px]">
                {Array.from({ length: machine.plates }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-[2px] ${
                      i < pin.live.plate ? 'bg-primary' : 'bg-surface-2'
                    }`}
                  />
                ))}
              </div>

              {/* 绑定状态条 */}
              <div className="mt-3 flex items-center gap-2 rounded-sm bg-surface-2 px-3 py-2">
                {pin.binding ? (
                  <>
                    <Link2 size={14} className="text-connected" />
                    <span className="text-[12px]">
                      {t('已绑定到')} <b className="font-medium">{t(machine.name)}</b>
                    </span>
                    <button
                      onClick={unbindPin}
                      className="ml-auto flex items-center gap-1 text-[11px] text-text-sub"
                    >
                      <Unlink size={11} /> {t('解绑')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                    <span className="text-[12px] text-text-sub">{t('未绑定器械')}</span>
                    <button
                      onClick={() => bindPin(machine.id, () => toast(t('已绑定到 {{name}}', { name: t(machine.name) })))}
                      className="ml-auto rounded-sm bg-primary px-2.5 py-1 text-[11px] font-medium text-white"
                    >
                      {t('绑定到本机')}
                    </button>
                  </>
                )}
              </div>

              <p className="mt-3 text-xs text-text-sub">{t('真机请直接移动插销')}</p>
            </section>

            {/* 本次次数 */}
            <section className="mt-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[12px] text-text-sub">{t('本组次数')}</p>
                  <p className="mt-1 font-mono text-[44px] font-bold leading-none tabular-nums hd:lg:text-[56px]">
                    {pin.live.reps}
                    <span className="ml-1 text-[14px] font-normal text-text-sub">{t('次')}</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-[12px]">
                  <span className="text-text-sub">{t('动作幅度')}</span>
                  <span className="font-mono">{pin.live.romCm || '—'} cm</span>
                  <span className="text-text-sub">{t('拉动速度')}</span>
                  <span className="font-mono">{pin.live.sensorOnline ? pin.live.speedCmS : '—'} cm/s</span>
                  <span className="text-text-sub">{t('单次节奏')}</span>
                  <span className="font-mono">{pin.live.tempoSec || '—'} s</span>
                  <span className="text-text-sub">{t('已完成组')}</span>
                  <span className="font-mono">{sets.length}</span>
                </div>
              </div>

              {/* 运动相位 */}
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ${
                      pin.live.phase === 'pull' ? 'bg-primary' : 'bg-connected'
                    }`}
                    style={{ width: `${pin.live.phase === 'pull' ? 78 : pin.live.phase === 'return' ? 30 : 4}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-text-sub">
                  <span>{pin.live.phase === 'pull' ? t('向心收缩') : pin.live.phase === 'return' ? t('离心还原') : t('等待动作')}</span>
                  <span>{formatTime(elapsed)}</span>
                </div>
              </div>

              <button
                onClick={() => closeSet()}
                className="mt-3 w-full rounded-md bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[0.98]"
              >
                {t('结束本组并记录')}
              </button>
            </section>
            </div>

            <div className="[&>*:first-child]:mt-0">
            {/* 动作波形：激光测距实时位移 */}
            <section className="mt-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] text-text-sub">{t('动作波形 · 位移')}</p>
                <div className="flex items-center gap-2.5 text-[10px] text-text-sub">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#1DC981' }} /> ≥92%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#EFAA17' }} /> ≥80%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#F01808' }} /> &lt;80%
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <WaveChart waveRef={pin.waveRef} height={110} className="h-[110px] hd:lg:h-[200px]" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-sub">
                {t('每个波峰为一次动作顶点，峰点颜色表示相对本组最高幅度的保持度')}
              </p>
            </section>

            {restRemain > 0 && (
              <section className="mt-3 flex items-center gap-3 rounded-md border border-primary/25 bg-primary/5 px-4 py-3">
                <Timer size={18} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-text-sub">{t('组间休息')}</p>
                  <p className="font-mono text-xl font-bold leading-tight tabular-nums">
                    {formatTime(restRemain)}
                  </p>
                </div>
                <button
                  onClick={() => setRestRemain(0)}
                  className="rounded-sm bg-text px-3 py-1.5 text-[12px] font-medium text-bg"
                >
                  {t('跳过')}
                </button>
              </section>
            )}

            {/* 本次已完成 */}
            <section className="mt-4 pb-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">{t('本次记录')}</h2>
                <span className="text-[12px] text-text-sub">
                  {t('容量 {{volume}} · {{count}} 次', { volume: formatVolume(totalVolume), count: totalReps })}
                </span>
              </div>
              {sets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-text-sub">
                  {t('开始动作，自动计数；一组结束时点「结束本组」')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-border bg-surface">
                  <div className="grid grid-cols-[34px_1fr_1fr_60px_60px] border-b border-border px-3 py-2 text-[11px] text-text-sub">
                    <span>{t('组')}</span>
                    <span>{t('配重')}</span>
                    <span>{t('次数')}</span>
                    <span>{t('幅度')}</span>
                    <span className="text-right">{t('容量')}</span>
                  </div>
                  {sets.map((s, i) => (
                    <div
                      key={s.at}
                      className="grid grid-cols-[34px_1fr_1fr_60px_60px] items-center px-3 py-2.5 text-[13px] tabular-nums [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
                    >
                      <span className="font-mono text-text-sub">{i + 1}</span>
                      <span className="font-mono font-semibold">{s.weight} kg</span>
                      <span className="font-mono">{s.reps}</span>
                      <span className="font-mono text-text-sub">{s.romCm ? `${s.romCm}cm` : '—'}</span>
                      <span className="text-right font-mono text-text-sub">
                        {Math.round(s.weight * s.reps)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {sets.length > 0 && (
                <button
                  onClick={() => setSets((prev) => prev.slice(0, -1))}
                  className="mt-2 flex items-center gap-1 text-[12px] text-text-sub"
                >
                  <Trash2 size={12} /> {t('撤销上一组')}
                </button>
              )}
            </section>
            </div>
            </div>
          </>
        )}
      </div>

      {connected && machine && (
        <div className="sticky bottom-0 z-20 mt-4 flex gap-2 border-t border-border bg-bg px-5 py-3 backdrop-blur-xl hd:lg:static hd:lg:mt-5 hd:lg:w-full hd:lg:max-w-none hd:lg:rounded-lg hd:lg:border hd:lg:bg-surface hd:lg:px-4 hd:lg:py-4">
          <button
            onClick={() => {
              pin.disconnect()
              setSets([])
              setElapsed(0)
              startedAt.current = Date.now()
            }}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-md border border-border"
            aria-label={t('断开')}
          >
            <RotateCcw size={17} className="text-text-sub" />
          </button>
          <button
            onClick={finish}
            disabled={saving || (sets.length === 0 && pin.live.reps === 0)}
            className="flex-1 rounded-md bg-text py-3.5 text-[17px] font-semibold text-bg disabled:opacity-35"
          >
            {saving ? t('保存中…') : t('完成训练并保存')}
          </button>
        </div>
      )}
    </div>
  )
}
