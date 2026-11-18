import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  Gauge,
  Heart,
  Loader2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Share2,
} from 'lucide-react'
import { AirBikeIcon, EllipticalIcon, RowerIcon, SkiIcon, SpinIcon, StairIcon, TreadmillIcon, UprightIcon } from '../components/MachineIcons'
import { MACHINE_MAP, MODE_LABELS } from '../mock/data'
import type { IntervalConfig, MachineSession, MachineType, TrainMode } from '../types'
import { useDevices } from '../context/DeviceContext'
import { useKeepAwake } from '../platform/keepAwake'
import { useNativeBack } from '../platform/NativeRuntime'
import { useAuth } from '../context/AuthContext'
import QuickConnect from '../components/QuickConnect'
import ShareSheet from '../components/ShareSheet'
import { fetchSessions, getMachineSessionOwner, saveSession } from '../api'
import { formatTime } from '../utils/format'
import { getPrefs } from '../utils/prefs'
import { beep, vibrate } from '../utils/feedback'
import { useToast } from '../components/Toast'

const MACHINE_ICON = {
  treadmill: TreadmillIcon,
  rower: RowerIcon,
  ski: SkiIcon,
  bike: AirBikeIcon,
  spin: SpinIcon,
  elliptical: EllipticalIcon,
  upright: UprightIcon,
  stair: StairIcon,
}

const MODES: TrainMode[] = ['free', 'interval', 'distance', 'time']

/** 主指标显示速度（km/h）的器械；其余显示功率（W） */
const SPEED_MACHINES: MachineType[] = ['treadmill', 'bike', 'spin', 'upright']

/** 踏频单位为 rpm 的器械；其余为 spm */
const RPM_MACHINES: MachineType[] = ['bike', 'spin', 'upright']

const CADENCE_LABEL: Record<MachineType, string> = {
  treadmill: '步频',
  rower: '桨频',
  ski: '频率',
  bike: '踏频',
  spin: '踏频',
  elliptical: '步频',
  upright: '踏频',
  stair: '步频',
}

const INTERVAL_PRESETS: IntervalConfig[] = [
  { work: 30, rest: 30, rounds: 8 },
  { work: 45, rest: 15, rounds: 8 },
  { work: 60, rest: 60, rounds: 6 },
]

function hrZone(bpm: number) {
  if (!bpm) return { label: '未连接', color: 'text-text-sub', idx: -1, pct: 0 }
  if (bpm < 120) return { label: '热身', color: 'text-text-sub', idx: 0, pct: Math.min(24, (bpm / 190) * 100) }
  if (bpm < 145) return { label: '燃脂', color: 'text-warning', idx: 1, pct: Math.min(49, (bpm / 190) * 100) }
  if (bpm < 165) return { label: '有氧', color: 'text-primary', idx: 2, pct: Math.min(74, (bpm / 190) * 100) }
  return { label: '无氧', color: 'text-danger', idx: 3, pct: Math.min(97, (bpm / 190) * 100) }
}

export default function MachineTrain() {
  const { t } = useTranslation()
  const { type } = useParams<{ type: string }>()
  const machineType = (type ?? '') as MachineType
  const machine = Object.hasOwn(MACHINE_MAP, machineType) ? MACHINE_MAP[machineType] : undefined
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const [history, setHistory] = useState<MachineSession[]>([])
  useEffect(() => {
    fetchSessions().then(setHistory)
  }, [])

  const { devices, disconnectDevice, startDevice, stopDevice } = useDevices()
  const device = machine ? devices[machineType] : undefined
  const hrDevice = devices.heartRate

  const [mode, setMode] = useState<TrainMode>('free')
  const [intervalCfg, setIntervalCfg] = useState<IntervalConfig>(INTERVAL_PRESETS[0])
  const [distanceTarget, setDistanceTarget] = useState(machine?.targetDistances[0] ?? 0)
  const [timeTarget, setTimeTarget] = useState(machine?.targetTimes[0] ?? 0)

  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [finished, setFinished] = useState<MachineSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useKeepAwake(running && !paused && !finished)
  useNativeBack(true, () => {
    if (confirmOpen) setConfirmOpen(false)
    else if (running || paused) setConfirmOpen(true)
    else navigate(-1)
  })

  const accRef = useRef({ speed: 0, speedN: 0, cadence: 0, cadenceN: 0, power: 0, powerN: 0, hr: 0, hrN: 0 })
  const autoRef = useRef(false)
  const workoutRef = useRef<{ id: string; startedAt: string; owner: ReturnType<typeof getMachineSessionOwner> } | null>(null)
  const resultRef = useRef<MachineSession | null>(null)
  const finishingRef = useRef(false)
  const phaseRef = useRef<'work' | 'rest'>('work')

  const Icon = MACHINE_ICON[machineType] ?? Gauge
  const metrics = device?.metrics ?? {}
  const hr = hrDevice.metrics.heartRate ?? 0

  const elapsed = running || paused ? metrics.elapsedTime ?? 0 : 0
  const distance = running || paused ? metrics.distance ?? 0 : 0
  const speed = metrics.speed ?? 0
  const cadence = metrics.cadence ?? 0
  const power = metrics.power ?? 0
  const calories = metrics.calories ?? 0

  // 间歇阶段由器械权威计时推导
  const interval = useMemo(() => {
    const cycle = intervalCfg.work + intervalCfg.rest
    const idx = Math.floor(elapsed / cycle)
    const pos = elapsed % cycle
    const phase: 'work' | 'rest' = pos < intervalCfg.work ? 'work' : 'rest'
    const remain = phase === 'work' ? intervalCfg.work - pos : cycle - pos
    return {
      phase,
      remain,
      round: Math.min(intervalCfg.rounds, idx + 1),
      done: Math.floor(elapsed / cycle),
      total: intervalCfg.rounds * cycle,
    }
  }, [elapsed, intervalCfg])

  // 目标进度
  const targetValue =
    mode === 'distance' ? distanceTarget : mode === 'time' ? timeTarget : mode === 'interval' ? interval.total : 0
  const progressSource =
    mode === 'distance' ? distance : mode === 'time' ? elapsed : mode === 'interval' ? elapsed : 0
  const progress = targetValue > 0 ? Math.min(100, (progressSource / targetValue) * 100) : 0
  const reached = targetValue > 0 && progressSource >= targetValue

  // 采样平均指标
  useEffect(() => {
    if (!running || paused) return
    const a = accRef.current
    if (speed > 0) {
      a.speed += speed
      a.speedN += 1
    }
    if (cadence > 0) {
      a.cadence += cadence
      a.cadenceN += 1
    }
    if (power > 0) {
      a.power += power
      a.powerN += 1
    }
  }, [speed, cadence, power, running, paused])

  useEffect(() => {
    if (!running || paused || hr <= 0) return
    accRef.current.hr += hr
    accRef.current.hrN += 1
  }, [hr, running, paused])

  const start = useCallback(async () => {
    workoutRef.current = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), owner: getMachineSessionOwner() }
    resultRef.current = null
    accRef.current = { speed: 0, speedN: 0, cadence: 0, cadenceN: 0, power: 0, powerN: 0, hr: 0, hrN: 0 }
    autoRef.current = false
    phaseRef.current = 'work'
    setFinished(null)
    setPaused(false)
    setRunning(true)
    await startDevice(machineType, true)
  }, [machineType, startDevice])

  const togglePause = useCallback(async () => {
    if (paused) {
      setPaused(false)
      await startDevice(machineType, false)
    } else {
      setPaused(true)
      await stopDevice(machineType)
    }
  }, [paused, machineType, startDevice, stopDevice])

  const finish = useCallback(
    async (auto = false) => {
      if (finishingRef.current || !workoutRef.current) return
      finishingRef.current = true
      setSaving(true)
      const workout = workoutRef.current
      const a = accRef.current
      setRunning(false)
      setPaused(false)
      void stopDevice(machineType)
      const avg = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 10) / 10 : 0)
      const record: MachineSession = resultRef.current ?? {
        id: workout.id,
        date: workout.startedAt,
        endedAt: new Date().toISOString(),
        machine: machineType,
        mode,
        durationSec: elapsed,
        distanceM: Math.round(distance),
        avgSpeed: avg(a.speed, a.speedN),
        cadence: Math.round(avg(a.cadence, a.cadenceN)),
        power: Math.round(avg(a.power, a.powerN)),
        calories: Math.round(calories),
        avgHr: Math.round(avg(a.hr, a.hrN)),
        target:
          mode === 'distance'
            ? distanceTarget
            : mode === 'time'
              ? timeTarget
              : mode === 'interval'
                ? intervalCfg.rounds
                : undefined,
        completed: auto || mode === 'free' || reached,
      }
      resultRef.current = record
      try {
        const saved = await saveSession(record, workout.owner)
        setConfirmOpen(false)
        setFinished(saved)
        toast(saved.syncState ? t('训练已保存到本机，联网后自动同步')
          : auto ? t('目标达成，已自动保存') : t('训练已保存'))
        if (auto) {
          if (getPrefs().sound) beep(1040, 260)
          if (getPrefs().vibration) vibrate([120, 80, 120])
        }
      } catch {
        setConfirmOpen(true)
        toast(t('保存到本机失败，请重试'))
      } finally {
        finishingRef.current = false
        setSaving(false)
      }
    },
    [machineType, stopDevice, elapsed, distance, mode, distanceTarget, timeTarget, intervalCfg.rounds, calories, reached, t, toast],
  )

  // 目标达成自动结束
  useEffect(() => {
    if (!running || paused || !reached || autoRef.current) return
    autoRef.current = true
    finish(true)
  }, [reached, running, paused, finish])

  // 间歇阶段切换提示
  useEffect(() => {
    if (!running || paused || mode !== 'interval') return
    if (phaseRef.current !== interval.phase) {
      phaseRef.current = interval.phase
      const prefs = getPrefs()
      if (prefs.sound) beep(interval.phase === 'work' ? 880 : 520, 160)
      if (prefs.vibration) vibrate(interval.phase === 'work' ? 120 : 60)
    }
  }, [interval.phase, running, paused, mode])

  if (!machine || !device) {
    return (
      <div className="p-8 text-center text-base text-text-sub">
        {t('器械不存在')}
        <button className="mt-4 block w-full text-primary" onClick={() => navigate('/machines')}>
          {t('返回器械列表')}
        </button>
      </div>
    )
  }

  const connected = device.connected
  const busy = device.status === 'scanning' || device.status === 'connecting'
  const zone = hrZone(hr)
  const statusText = busy
    ? device.status === 'scanning'
      ? t('搜索中…')
      : t('连接中…')
    : connected
      ? device.name || t('已连接')
      : t('未连接器械')

  if (finished) {
    const past = history
      .filter((s) => s.machine === finished.machine && s.id !== finished.id)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    const prev = past[0]
    const bestTime = past.length ? Math.min(...past.map((s) => s.durationSec)) : 0
    const delta = prev ? prev.durationSec - finished.durationSec : 0
    const statItems = [
      { label: t('总用时'), value: formatTime(finished.durationSec) },
      { label: t('距离'), value: `${(finished.distanceM / 1000).toFixed(2)} km` },
      { label: t('消耗'), value: `${finished.calories} kcal` },
      { label: t('平均心率'), value: finished.avgHr ? `${finished.avgHr} bpm` : '—' },
      { label: t('平均速度'), value: finished.avgSpeed ? `${finished.avgSpeed} km/h` : '—' },
      { label: t('平均{{label}}', { label: t(CADENCE_LABEL[machineType]) }), value: finished.cadence ? `${finished.cadence}` : '—' },
    ]

    return (
      <div className="px-5 pt-5 pb-6 hd:lg:mx-auto hd:lg:max-w-[820px] hd:lg:px-8 hd:lg:pt-8">
        <div className="sheet-up rounded-lg border border-border bg-surface p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-text/5 text-text">
            <CheckCircle2 size={36} />
          </div>
          <h1 className="font-display text-[28px] font-bold">{t('训练完成')}</h1>
          <p className="mt-1.5 text-[16px] text-primary">{t('一起，为了活力')}</p>
          <p className="mt-2 text-[16px] text-text-sub">
            {t(machine.name)} · {t(MODE_LABELS[finished.mode])}
            {finished.mode === 'free' ? '' : finished.completed ? t(' · 目标达成') : t(' · 提前结束')}
          </p>

          <div className="mt-5 border-y border-border py-5">
            <p className="text-[15px] tracking-[0.16em] text-text-sub">
              {finished.mode === 'distance' ? t('距离') : t('总用时')}
            </p>
            <p className="mt-1 font-mono text-[44px] font-bold leading-none tabular-nums">
              {finished.mode === 'distance'
                ? (finished.distanceM / 1000).toFixed(2)
                : formatTime(finished.durationSec)}
            </p>
            <p className="mt-1.5 text-[17px] text-text-sub">{finished.mode === 'distance' ? t('公里') : t('时:分:秒')}</p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-left">
            {statItems.map((it) => (
              <div key={it.label} className="rounded-md bg-surface-2 px-3 py-2.5">
                <p className="font-mono text-[18px] font-semibold">{it.value}</p>
                <p className="mt-0.5 text-[15px] text-text-sub">{it.label}</p>
              </div>
            ))}
          </div>

          {(prev || bestTime) && (
            <p className="mt-4 text-[16px] text-text-sub">
              {prev
                ? delta > 0
                  ? t('比上次快 {{time}}', { time: formatTime(delta) })
                  : delta < 0
                    ? t('比上次慢 {{time}}', { time: formatTime(-delta) })
                    : t('与上次用时持平')
                : t('首次完成该器械训练')}
              {bestTime > 0 &&
                (finished.durationSec <= bestTime
                  ? t(' · 刷新个人最佳')
                  : t(' · 距个人最佳差 {{time}}', { time: formatTime(finished.durationSec - bestTime) }))}
            </p>
          )}

          <button
            onClick={() => setShareOpen(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface py-3.5 text-[17px] font-medium"
          >
            <Share2 size={17} /> {t('分享成绩')}
          </button>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                setFinished(null)
                start()
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-text py-3.5 text-[17px] font-semibold text-bg transition-transform active:scale-[0.98]"
            >
              <RotateCcw size={16} /> {t('再来一次')}
            </button>
            <button
              onClick={() => navigate('/records')}
              className="flex-1 rounded-md border border-border py-3.5 text-[17px] font-medium text-text"
            >
              {t('查看记录')}
            </button>
          </div>
          <button onClick={() => navigate('/machines')} className="mt-4 w-full text-[16px] text-text-sub underline">
            {t('返回器械列表')}
          </button>
        </div>

        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          session={finished}
          machineName={t(machine.name)}
          subtitle={`${t(MODE_LABELS[finished.mode])}${finished.mode === 'free' ? '' : finished.completed ? t(' · 目标达成') : t(' · 提前结束')}${device.name ? ` · ${device.name}` : ''}`}
          nickname={user?.nickname}
          avatar={user?.avatar}
        />
      </div>
    )
  }

  const machinePast = history
    .filter((s) => s.machine === machineType)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
  const lastRun = machinePast[0]
  const bestRunTime = machinePast.length ? Math.min(...machinePast.map((s) => s.durationSec)) : 0

  return (
    <div className={`px-5 pt-4 hd:lg:px-8 hd:lg:pt-6 ${connected ? 'pb-[calc(env(safe-area-inset-bottom)+84px)] hd:lg:pb-8' : ''}`}>
      {/* 顶栏 */}
      <header className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            if (running || paused) stopDevice(machineType)
            navigate('/machines')
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-text-sub"
          aria-label={t('返回')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate font-display text-[20px] font-bold leading-tight">{t(machine.name)}</h1>
          <p className={`flex shrink-0 items-center gap-1 text-[15px] ${connected ? 'text-connected' : 'text-text-sub'}`}>
            {busy ? <Radio size={12} className="animate-pulse" /> : connected ? <BluetoothConnected size={12} /> : <Bluetooth size={12} />}
            {statusText}
          </p>
        </div>
        {connected ? (
          <button
            onClick={() => {
              if (running) return
              disconnectDevice(machineType)
            }}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[15px] text-text-sub"
          >
            {t('断开')}
          </button>
        ) : null}
      </header>

      {/* 未连接引导 */}
      {!connected && (
        <div className="reveal mb-4 rounded-lg border border-dashed border-border bg-surface p-6 text-center hd:lg:mx-auto hd:lg:max-w-[560px] hd:lg:py-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {busy ? <Loader2 size={30} className="animate-spin" /> : <Icon size={30} />}
          </div>
          <p className="text-[19px] font-semibold">{t('连接你的{{machine}}', { machine: t(machine.name) })}</p>
          <p className="mt-1.5 text-[16px] leading-relaxed text-text-sub">{t('开启器械蓝牙后点击连接。')}</p>
          <div className="mt-5">
            <QuickConnect type={machineType} label={t('搜索并连接')} full />
          </div>
          <p className="mt-4 text-[15px] text-text-sub">
            {t('支持智能跑步机、划船机、滑雪机与风阻单车')}
          </p>
        </div>
      )}

      {/* 连接后：训练面板 */}
      {connected && (
        <>
          {/* 训练中：驾驶舱 */}
          {(running || paused) && (
            <div className="relative">
              <div
                className={`space-y-3 transition-all duration-200 hd:lg:grid hd:lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-5 hd:lg:space-y-0 ${
                  paused ? 'opacity-40 saturate-50' : ''
                }`}
              >
                <div className="space-y-3">
                <section className="reveal reveal-1 rounded-lg border border-border bg-surface p-5 hd:lg:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[15px] text-text-sub">
                      {mode === 'free'
                        ? t('自由训练')
                        : mode === 'interval'
                          ? t('间歇 · {{count}} 组', { count: intervalCfg.rounds })
                          : mode === 'distance'
                            ? t('距离目标 · {{distance}} 公里', { distance: (distanceTarget / 1000).toFixed(1) })
                            : t('时间目标 · {{count}} 分钟', { count: Math.round(timeTarget / 60) })}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1.5 text-[15px] font-medium ${
                        paused ? 'bg-surface-2 text-text-sub' : 'bg-connected/10 text-connected'
                      }`}
                    >
                      {paused ? t('已暂停') : t('训练中')}
                    </span>
                  </div>

                  <p className="mt-4 text-[15px] tracking-[0.16em] text-text-sub">
                    {mode === 'interval'
                      ? interval.phase === 'work'
                        ? t('训练阶段')
                        : t('休息阶段')
                      : mode === 'distance'
                        ? t('距离')
                        : mode === 'time'
                          ? t('剩余时间')
                          : t('已用时')}
                  </p>
                  <div className="mt-1 flex items-end gap-2">
                    <p className="font-mono text-[60px] font-bold leading-none tabular-nums hd:lg:text-[96px]">
                      {mode === 'interval'
                        ? formatTime(interval.remain)
                        : mode === 'distance'
                          ? (distance / 1000).toFixed(2)
                          : mode === 'time'
                            ? formatTime(Math.max(0, timeTarget - elapsed))
                            : formatTime(elapsed)}
                    </p>
                    <span className="pb-1 text-[17px] text-text-sub">
                      {mode === 'interval'
                        ? t('剩余')
                        : mode === 'distance'
                          ? t('公里')
                          : mode === 'time'
                            ? t('剩余')
                            : t('时:分:秒')}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3 text-[15px] text-text-sub">
                    <span>
                      {mode === 'interval'
                        ? t('第 {{current}}/{{total}} 组', { current: interval.round, total: intervalCfg.rounds })
                        : mode === 'free'
                          ? running
                            ? t('器械计时')
                            : t('准备开始')
                          : t('已用时 {{time}}', { time: formatTime(elapsed) })}
                    </span>
                    {mode === 'distance' && (
                      <span>{t('还剩 {{distance}} 公里', { distance: Math.max(0, (distanceTarget - distance) / 1000).toFixed(2) })}</span>
                    )}
                    {mode === 'time' && <span>{t('目标 {{time}}', { time: formatTime(timeTarget) })}</span>}
                    {mode === 'interval' && <span>{t('总计时 {{time}}', { time: formatTime(elapsed) })}</span>}
                  </div>

                  {targetValue > 0 && (
                    <>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[15px] text-text-sub">
                        <span>{t('目标进度')}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                    </>
                  )}
                </section>

                {/* 实时指标 */}
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface">
                  {[
                    {
                      label: SPEED_MACHINES.includes(machineType) ? '速度' : '功率',
                      value: SPEED_MACHINES.includes(machineType) ? `${speed}` : `${Math.round(power)}`,
                      unit: SPEED_MACHINES.includes(machineType) ? 'km/h' : 'W',
                      color: '',
                    },
                    {
                      label: '消耗',
                      value: `${Math.round(calories)}`,
                      unit: 'kcal',
                      color: '',
                    },
                    {
                      label: CADENCE_LABEL[machineType],
                      value: cadence ? `${Math.round(cadence)}` : '—',
                      unit: RPM_MACHINES.includes(machineType) ? 'rpm' : 'spm',
                      color: '',
                    },
                    {
                      label: '距离',
                      value: `${(distance / 1000).toFixed(2)}`,
                      unit: 'km',
                      color: '',
                    },
                  ].map((it, i) => (
                    <div
                      key={it.label}
                      className={`px-4 py-3.5 ${i % 2 === 0 ? 'border-r border-border' : ''} ${
                        i < 2 ? 'border-b border-border' : ''
                      }`}
                    >
                      <p className="text-[15px] text-text-sub">{t(it.label)}</p>
                      <div className="mt-1 flex items-baseline gap-1">
                        <p className={`font-mono text-[28px] font-bold leading-none tabular-nums hd:lg:text-[34px] ${it.color}`}>
                          {it.value}
                        </p>
                        {it.unit && <span className="text-[15px] text-text-sub">{it.unit}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                </div>

                <div className="space-y-3">
                {/* 心率区间 */}
                <section className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[17px] font-semibold">
                      <Heart size={14} className={zone.color} /> {t('心率区间')}
                    </p>
                    {hr ? (
                      <p className={`text-[15px] font-medium ${zone.color}`}>
                        {t(zone.label)} · {hr} bpm
                      </p>
                    ) : (
                      <p className="text-[15px] text-text-sub">{t('未连接')}</p>
                    )}
                  </div>

                  {hr ? (
                    <>
                      <div className="relative mt-4 grid grid-cols-4 gap-1">
                        {['bg-[#f6c445]', 'bg-[#f59e0b]', 'bg-primary', 'bg-[#b91c1c]'].map((c) => (
                          <i key={c} className={`block h-2.5 rounded-sm ${c}`} />
                        ))}
                        <span
                          className="absolute -top-1 h-[18px] w-[2px] rounded-full bg-text"
                          style={{ left: `${zone.pct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 grid grid-cols-4 text-center text-[14px] text-text-sub">
                        <span>{t('热身')}</span>
                        <span>{t('燃脂')}</span>
                        <span>{t('有氧')}</span>
                        <span>{t('无氧')}</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3">
                      <QuickConnect type="heartRate" label={t('连接心率带')} full />
                    </div>
                  )}
                </section>
                </div>
              </div>

              {paused && (
                <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center">
                  <div className="w-[86%] rounded-lg border border-border bg-surface/95 p-5 text-center shadow-card backdrop-blur">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
                      <Pause size={18} />
                    </div>
                    <p className="mt-2 font-display text-[19px] font-bold">{t('已暂停')}</p>
                    <p className="mt-1 text-[15px] text-text-sub">{t('计时与器械数据已停止，继续后从当前位置恢复')}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 开始前配置 */}
          {!running && !paused && (
            <section className="reveal reveal-2 space-y-3 hd:lg:grid hd:lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-5 hd:lg:space-y-0">
              <div className="rounded-lg border border-border bg-surface p-4 hd:lg:p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[17px] font-semibold">{t('训练模式')}</p>
                  <p className="text-[15px] text-text-sub">{t('目标达成后自动结束')}</p>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-md bg-surface-2 p-1">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-sm py-2.5 text-[16px] font-medium transition-colors ${
                        mode === m ? 'bg-text text-bg' : 'text-text-sub'
                      }`}
                    >
                      {t(MODE_LABELS[m])}
                    </button>
                  ))}
                </div>

                {mode === 'interval' && (
                  <div className="mt-4">
                    <p className="mb-2 text-[15px] text-text-sub">{t('间歇方案')}</p>
                    <div className="space-y-2">
                      {INTERVAL_PRESETS.map((p) => {
                        const active = p.work === intervalCfg.work && p.rest === intervalCfg.rest && p.rounds === intervalCfg.rounds
                        return (
                          <button
                            key={`${p.work}-${p.rest}-${p.rounds}`}
                            onClick={() => setIntervalCfg(p)}
                            className={`flex w-full items-center justify-between rounded-md border px-4 py-3.5 transition-colors ${
                              active ? 'border-text bg-surface-2' : 'border-border bg-surface'
                            }`}
                          >
                            <span className="text-[17px] font-medium">
                              {t('{{work}}s 训练 / {{rest}}s 休息', { work: p.work, rest: p.rest })}
                            </span>
                            <span className={`text-[15px] ${active ? 'text-text' : 'text-text-sub'}`}>
                              {t('{{count}} 组 · {{time}}', { count: p.rounds, time: formatTime((p.work + p.rest) * p.rounds) })}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {mode === 'distance' && (
                  <div className="mt-4">
                    <p className="mb-2 text-[15px] text-text-sub">{t('目标距离')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {machine.targetDistances.map((d) => (
                        <button
                          key={d}
                          onClick={() => setDistanceTarget(d)}
                          className={`rounded-md border py-3.5 text-[18px] font-semibold transition-colors ${
                            distanceTarget === d ? 'border-text bg-surface-2 text-text' : 'border-border bg-surface text-text-sub'
                          }`}
                        >
                          {t('{{distance}} 公里', { distance: (d / 1000).toFixed(1) })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mode === 'time' && (
                  <div className="mt-4">
                    <p className="mb-2 text-[15px] text-text-sub">{t('目标时间')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {machine.targetTimes.map((targetTime) => (
                        <button
                          key={targetTime}
                          onClick={() => setTimeTarget(targetTime)}
                          className={`rounded-md border py-3.5 text-[18px] font-semibold transition-colors ${
                            timeTarget === targetTime ? 'border-text bg-surface-2 text-text' : 'border-border bg-surface text-text-sub'
                          }`}
                        >
                          {t('{{count}} 分钟', { count: Math.round(targetTime / 60) })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
              {lastRun && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[15px] text-text-sub">{t('最近一次')}</p>
                    <p className="mt-0.5 truncate font-mono text-[18px] font-semibold">
                      {t('{{time}} · {{distance}} 公里', {
                        time: formatTime(lastRun.durationSec),
                        distance: (lastRun.distanceM / 1000).toFixed(2),
                      })}
                    </p>
                  </div>
                  {bestRunTime > 0 && (
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] text-text-sub">{t('个人最佳')}</p>
                      <p className="mt-0.5 font-mono text-[18px] font-semibold">{formatTime(bestRunTime)}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-[17px] font-semibold">
                    <Heart size={14} className="text-primary" /> {t('心率带')}
                  </p>
                  {hrDevice.connected ? (
                    <p className="min-w-0 truncate text-[15px] text-connected">{t('已连接 · {{name}}', { name: hrDevice.name })}</p>
                  ) : (
                    <QuickConnect type="heartRate" label={t('连接')} />
                  )}
                </div>
                {hrDevice.connected ? (
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <p className="font-mono text-[32px] font-bold leading-none tabular-nums">{hr || '—'}</p>
                      <span className="text-[15px] text-text-sub">bpm</span>
                    </div>
                    <p className={`text-[15px] font-medium ${hr ? zone.color : 'text-text-sub'}`}>
                      {hr ? t(zone.label) : t('等待心率数据')}
                    </p>
                  </div>
                ) : null}
              </div>
              </div>
            </section>
          )}

          {/* 开始训练：固定在屏幕底部 */}
          {!running && !paused && (
            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 hd:lg:static hd:lg:left-auto hd:lg:z-auto hd:lg:mx-auto hd:lg:mt-5 hd:lg:max-w-[640px] hd:lg:translate-x-0 hd:lg:rounded-lg hd:lg:border hd:lg:pb-3">
              <button
                onClick={start}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-text py-4 text-[18px] font-bold text-bg transition-transform active:scale-[0.98]"
              >
                <Play size={18} /> {t('开始训练')}
              </button>
            </div>
          )}

          {/* 训练中控制：固定在屏幕底部 */}
          {(running || paused) && (
            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 hd:lg:static hd:lg:left-auto hd:lg:z-auto hd:lg:mx-auto hd:lg:mt-5 hd:lg:max-w-[760px] hd:lg:translate-x-0 hd:lg:rounded-lg hd:lg:border hd:lg:pb-3">
              <div className="flex gap-3">
                <button
                  onClick={togglePause}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-text py-3.5 text-[18px] font-semibold text-bg transition-transform active:scale-[0.98]"
                >
                  {paused ? <Play size={18} /> : <Pause size={18} />}
                  {paused ? t('继续') : t('暂停')}
                </button>
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="flex-1 rounded-md border border-border bg-surface py-3.5 text-[18px] font-semibold text-danger"
                >
                  {t('结束训练')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 结束确认 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 px-5 pb-8">
          <div className="sheet-up w-full max-w-[400px] rounded-lg border border-border bg-surface p-5">
            <p className="font-display text-lg font-bold">{t('结束本次训练？')}</p>
            <p className="mt-1 text-sm text-text-sub">
              {t('当前用时 {{time}} · 距离 {{distance}} km，结束后将保存记录。', {
                time: formatTime(elapsed),
                distance: (distance / 1000).toFixed(2),
              })}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 rounded-md border border-border py-3 text-[17px]"
              >
                {t('继续训练')}
              </button>
              <button
                onClick={() => finish(false)}
                disabled={saving}
                className="flex-1 rounded-md bg-text py-3 text-[17px] font-semibold text-bg disabled:opacity-60"
              >
                {saving ? t('保存中…') : t('结束并保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
