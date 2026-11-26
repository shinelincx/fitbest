import { cadenceDisplay } from '../utils/cadence'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { applyTreadmillCounterOffsets, formatTreadmillPace, resumeTreadmillCounters, type TreadmillCounterOffsets } from '../ble/treadmillCounters'
import type { DeviceMetrics } from '../ble/ftms'
import { isResistanceDisabled } from '../api/machineNavigation'
import { intervalProgress, trainingGoal } from '../utils/trainingGoals'

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

const INTERVAL_PRESETS: IntervalConfig[] = [
  { work: 30, rest: 30, rounds: 8 },
  { work: 45, rest: 15, rounds: 8 },
  { work: 60, rest: 60, rounds: 6 },
]

function comparableWorkouts(
  history: MachineSession[],
  workout: Pick<MachineSession, 'machine' | 'mode' | 'target'> & { id?: string },
) {
  if (workout.mode === 'free') return []
  // 旧记录只保存间歇组数。组数相同但训练和休息设置不同的方案不能区分。
  if (workout.mode === 'interval' && INTERVAL_PRESETS.filter(({ rounds }) => rounds === workout.target).length !== 1) return []
  if (!(workout.target && workout.target > 0)) return []
  return history
    .filter((session) => session.completed === true && session.id !== workout.id &&
      session.machine === workout.machine && session.mode === workout.mode &&
      session.target === workout.target && session.durationSec > 0)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

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
  const { state } = useLocation()
  const toast = useToast()
  const { user } = useAuth()

  const [history, setHistory] = useState<MachineSession[]>([])
  useEffect(() => {
    fetchSessions().then(setHistory)
  }, [])

  const { devices, machineNavigation, disconnectDevice, startDevice, stopDevice, setTreadmillTargets, setFtmsTreadmillTarget, setResistanceTarget } = useDevices()
  const device = machine ? devices[machineType] : undefined
  const hrDevice = devices.heartRate

  const [mode, setMode] = useState<TrainMode>('free')
  const [intervalCfg, setIntervalCfg] = useState<IntervalConfig>(INTERVAL_PRESETS[0])
  const [distanceTarget, setDistanceTarget] = useState(machine?.targetDistances[0] ?? 0)
  const [timeTarget, setTimeTarget] = useState(machine?.targetTimes[0] ?? 0)

  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [pausedTreadmill, setPausedTreadmill] = useState<{ metrics: DeviceMetrics; heartRate: number } | null>(null)
  const [resumeFrom, setResumeFrom] = useState<DeviceMetrics | null>(null)
  const [treadmillOffsets, setTreadmillOffsets] = useState<TreadmillCounterOffsets>({})
  const [startBaselinePending, setStartBaselinePending] = useState(false)
  const [localElapsed, setLocalElapsed] = useState(0)
  const [localCountdown, setLocalCountdown] = useState<{ seconds: number; resume: boolean } | null>(null)
  const [privateStarting, setPrivateStarting] = useState<{ resume: boolean; previous: DeviceMetrics } | null>(null)
  const [privateCount, setPrivateCount] = useState<number | undefined>()
  const privateConfirmation = useRef<((confirmed: boolean) => void) | null>(null)
  const countdownAbort = useRef<AbortController | null>(null)
  const [finished, setFinished] = useState<MachineSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [showMoreData, setShowMoreData] = useState(false)

  useKeepAwake(running && !paused && !finished)
  useNativeBack(true, () => {
    if (countdownAbort.current) countdownAbort.current.abort()
    else if (confirmOpen) setConfirmOpen(false)
    else if (running || paused) setConfirmOpen(true)
    else navigate(-1)
  })

  const accRef = useRef({ speed: 0, speedN: 0, cadence: 0, cadenceN: 0, power: 0, powerN: 0, hr: 0, hrN: 0 })
  const sampleRef = useRef<Pick<DeviceMetrics, 'speed' | 'cadence' | 'power'> & { hr: number }>({ hr: 0 })
  const autoRef = useRef(false)
  const workoutRef = useRef<{ id: string; startedAt: string; owner: ReturnType<typeof getMachineSessionOwner> } | null>(null)
  const resultRef = useRef<MachineSession | null>(null)
  const finishingRef = useRef(false)
  const phaseRef = useRef<'work' | 'rest'>('work')
  const controlPending = useRef(false)
  const [adjustingTreadmill, setAdjustingTreadmill] = useState(false)
  const [pendingTarget, setPendingTarget] = useState<{ field: 'speed' | 'incline' | 'resistance'; value: number } | null>(null)
  const treadmillLimits = device?.treadmillLimits

  const Icon = MACHINE_ICON[machineType] ?? Gauge
  const liveMetrics = device?.metrics ?? {}
  const countdown = localCountdown?.seconds ?? (privateStarting ? privateCount : undefined)
  const showingCountdown = localCountdown !== null || privateStarting !== null

  useEffect(() => {
    if (!privateStarting) return
    if (!device?.connected) privateConfirmation.current?.(false)
    else if (device.metrics !== privateStarting.previous) {
      if (device.metrics.privateTreadmillActive) privateConfirmation.current?.(true)
      const next = device.metrics.privateTreadmillCountdown
      if (next !== undefined) setPrivateCount((value) => value === undefined ? next : Math.min(value, next))
      else setPrivateCount((value) => value === 1 ? 0 : value)
    }
  }, [device, privateStarting])

  useEffect(() => {
    if (!privateStarting) return
    const timeout = window.setTimeout(() => {
      privateConfirmation.current?.(false)
    }, 15_000)
    return () => window.clearTimeout(timeout)
  }, [privateStarting])

  useEffect(() => () => privateConfirmation.current?.(false), [])

  useEffect(() => {
    if (!pendingTarget) return
    const actual = device?.metrics[pendingTarget.field]
    if (!running || paused || !device?.connected || (actual !== undefined && Math.abs(actual - pendingTarget.value) < 0.01)) {
      setPendingTarget(null)
    }
  }, [device, paused, pendingTarget, running])

  useEffect(() => {
    if (!pendingTarget) return
    const timer = window.setTimeout(() => {
      setPendingTarget(null)
      toast(t('器械尚未确认调节，请查看器械面板'))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [pendingTarget, t, toast])

  useEffect(() => {
    if (!device?.connected) countdownAbort.current?.abort()
    return () => countdownAbort.current?.abort()
  }, [device?.connected, machineType])

  const waitForFtmsCountdown = useCallback(async (resume: boolean) => {
    if (machineType !== 'treadmill' || device?.treadmillProtocol !== 'ftms') return true
    const controller = new AbortController()
    countdownAbort.current = controller
    try {
      for (let seconds = 3; seconds > 0; seconds--) {
        if (controller.signal.aborted) return false
        setLocalCountdown({ seconds, resume })
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve() }, 1000)
          function abort() { window.clearTimeout(timer); resolve() }
          controller.signal.addEventListener('abort', abort, { once: true })
        })
      }
      if (controller.signal.aborted) return false
      setLocalCountdown({ seconds: 0, resume })
      return true
    } finally {
      countdownAbort.current = null
    }
  }, [device?.treadmillProtocol, machineType])

  const requestWorkoutStart = useCallback(async (resume: boolean) => {
    if (machineType !== 'treadmill' || device?.treadmillProtocol !== 'private') {
      if (!(await waitForFtmsCountdown(resume))) return false
      await startDevice(machineType, !resume)
      return true
    }
    setPrivateCount(undefined)
    setPrivateStarting({ resume, previous: device.metrics })
    const confirmed = new Promise<void>((resolve, reject) => {
      let activeReported = false
      let commandSent = false
      privateConfirmation.current = (active) => {
        if (!active) {
          reject(new Error('Treadmill start unconfirmed'))
          return
        }
        activeReported = true
        if (commandSent) resolve()
      }
      void startDevice(machineType, !resume).then(() => {
        commandSent = true
        if (activeReported) resolve()
      }, reject)
    })
    try {
      await confirmed
      return true
    } finally {
      privateConfirmation.current = null
      setPrivateStarting(null)
    }
  }, [device, machineType, startDevice, waitForFtmsCountdown])
  const metrics = pausedTreadmill?.metrics ?? (startBaselinePending
    ? applyTreadmillCounterOffsets(liveMetrics, resumeTreadmillCounters({}, liveMetrics, {}))
    : applyTreadmillCounterOffsets(liveMetrics, treadmillOffsets))
  const liveHeartRate = hrDevice.metrics.heartRate || liveMetrics.heartRate || 0
  const hr = pausedTreadmill?.heartRate ?? liveHeartRate

  const elapsed = running || paused ? metrics.elapsedTime ?? (machineType === 'treadmill' ? 0 : localElapsed) : 0
  const distance = running || paused ? metrics.distance ?? 0 : 0
  const hasMinimumMovement = distance >= 50 ||
    ((machineType === 'rower' || machineType === 'ski') && (metrics.strokeCount ?? 0) >= 10) ||
    (machineType === 'stair' &&
      ((metrics.strokeCount ?? metrics.strideCount ?? 0) >= 10 || (metrics.elevationGain ?? 0) >= 3 || (metrics.floors ?? 0) >= 1))
  const canSaveWorkout = Boolean(resultRef.current) || (elapsed >= 10 && hasMinimumMovement)
  const speed = metrics.speed ?? 0
  const calories = metrics.calories ?? 0
  type Readout = [label: string, value: string | number | undefined, unit?: string]
  const isStrokeMachine = machineType === 'rower' || machineType === 'ski'
  const isStair = machineType === 'stair'
  const isElliptical = machineType === 'elliptical'
  const showsSpeed = SPEED_MACHINES.includes(machineType) || isElliptical
  const speedReadout: Readout = ['速度', metrics.speed, 'km/h']
  const powerReadout: Readout = ['功率', metrics.power?.toFixed(0), 'W']
  const paceReadout: Readout = [
    '配速',
    formatTreadmillPace(isStrokeMachine ? metrics.pace ?? 1800 / speed : 3600 / speed),
    isStrokeMachine ? 'min/500m' : 'min/km',
  ]
  const { label: cadenceLabel, unit: cadenceUnit } = cadenceDisplay(machineType)
  const cadenceReadout: Readout = [cadenceLabel, metrics.cadence?.toFixed(0), cadenceUnit]
  const caloriesReadout: Readout = ['消耗', metrics.calories?.toFixed(0), 'kcal']
  const distanceReadout: Readout = ['距离', metrics.distance === undefined ? undefined : (distance / 1000).toFixed(2), 'km']
  const stepsReadout: Readout = ['器械步数', metrics.strokeCount ?? metrics.strideCount]
  const basicReadouts: Readout[] = machineType === 'treadmill' ? [
    speedReadout, distanceReadout, paceReadout, ['坡度', metrics.incline, '%'],
  ] : [
    isStair ? stepsReadout : showsSpeed ? speedReadout : powerReadout,
    cadenceReadout, distanceReadout, caloriesReadout,
  ]
  const extraReadouts: Readout[] = machineType === 'treadmill' ? [
    caloriesReadout, cadenceReadout, stepsReadout,
  ] : [
    ...(showsSpeed ? [powerReadout] : [speedReadout]),
    ...(isStair && metrics.power !== undefined ? [powerReadout] : []),
    ...(!isStair ? [paceReadout] : []),
    ...(!isStair && (isStrokeMachine || metrics.strokeCount !== undefined)
      ? [['累计次数', metrics.strokeCount] satisfies Readout] : []),
    ...(isElliptical ? [
      ['累计步幅', metrics.strideCount],
      ['坡度', metrics.incline, '%'],
    ] satisfies Readout[] : []),
    ...(isStair ? [['楼层', metrics.floors] satisfies Readout] : []),
    ...(isStair || isElliptical ? [['累计爬升', metrics.elevationGain, 'm'] satisfies Readout] : []),
    ['阻力', metrics.resistance],
  ]

  useEffect(() => {
    if (!running || paused || pausedTreadmill || machineType === 'treadmill') return
    const startedAt = Date.now()
    let previousSeconds = 0
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      const delta = seconds - previousSeconds
      previousSeconds = seconds
      if (delta > 0) setLocalElapsed((total) => total + delta)
    }, 250)
    return () => window.clearInterval(timer)
  }, [running, paused, pausedTreadmill, machineType])

  useEffect(() => {
    if (!startBaselinePending || !device) return
    const data = device.metrics
    if (machineType === 'treadmill' ? !data.speed || data.privateTreadmillActive === false
      : !Object.keys(data).length) return
    setTreadmillOffsets(resumeTreadmillCounters({}, device.metrics, {}))
    setStartBaselinePending(false)
  }, [startBaselinePending, device, machineType])

  useEffect(() => {
    if (paused || !pausedTreadmill || !resumeFrom || !device?.metrics) return
    if (device.metrics === resumeFrom || (machineType === 'treadmill' &&
      (device.metrics.privateTreadmillActive === false || !device.metrics.speed))) return
    setTreadmillOffsets((offsets) => resumeTreadmillCounters(pausedTreadmill.metrics, device.metrics, offsets))
    setPausedTreadmill(null)
    setResumeFrom(null)
    const speed = pausedTreadmill.metrics.speed
    const { incline, privateTreadmillActive } = device.metrics
    if (machineType !== 'treadmill' || !privateTreadmillActive || !speed || speed === device.metrics.speed || incline === undefined) return
    controlPending.current = true
    setAdjustingTreadmill(true)
    void setTreadmillTargets(speed, incline).catch(() => {
      toast(t('未能恢复暂停前的速度，请使用器械面板调节'))
    }).finally(() => {
      controlPending.current = false
      setAdjustingTreadmill(false)
    })
  }, [device, machineType, paused, pausedTreadmill, resumeFrom, setTreadmillTargets, t, toast])

  // 间歇阶段由器械权威计时推导
  const interval = intervalProgress(elapsed, intervalCfg)
  const { target: targetValue, progress, reached } = trainingGoal(mode, elapsed, distance, timeTarget, distanceTarget, interval.total)

  useEffect(() => {
    sampleRef.current = { speed: metrics.speed, cadence: metrics.cadence, power: metrics.power, hr }
  }, [metrics.speed, metrics.cadence, metrics.power, hr])

  // 等间隔采样，持续不变的读数和实际收到的零值也参与平均。
  useEffect(() => {
    if (!device?.connected || !running || paused || pausedTreadmill || startBaselinePending || showingCountdown) return
    const timer = window.setInterval(() => {
      const sample = sampleRef.current
      const totals = accRef.current
      for (const key of ['speed', 'cadence', 'power', 'hr'] as const) {
        const value = sample[key]
        if (value === undefined || !Number.isFinite(value) || value < 0 || (key === 'hr' && value === 0)) continue
        totals[key] += value
        totals[`${key}N`] += 1
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [device?.connected, running, paused, pausedTreadmill, startBaselinePending, showingCountdown])

  const adjustTreadmill = async (field: 'speed' | 'incline' | 'resistance', value: number) => {
    if (!running || paused || pausedTreadmill || pendingTarget || !connected || controlPending.current || finishingRef.current ||
      (field !== 'resistance' && !liveMetrics.speed)) return
    controlPending.current = true
    setPendingTarget({ field, value })
    try {
      if (field === 'resistance') await setResistanceTarget(machineType, value)
      else if (device?.treadmillProtocol === 'ftms') await setFtmsTreadmillTarget(field, value)
      else if (liveMetrics.incline !== undefined && liveMetrics.speed !== undefined) {
        await setTreadmillTargets(field === 'speed' ? value : liveMetrics.speed, field === 'incline' ? value : liveMetrics.incline)
      }
    } catch {
      setPendingTarget(null)
      toast(t('器械控制失败，请使用器械面板'))
    } finally {
      controlPending.current = false
    }
  }
  const start = useCallback(async () => {
    if (controlPending.current) return
    controlPending.current = true
    try {
      if (!(await requestWorkoutStart(false))) return
    } catch {
      setPrivateStarting(null)
      toast(t('未确认器械启动，请先检查器械面板，再重试'))
      return
    } finally {
      controlPending.current = false
      setLocalCountdown(null)
    }
    workoutRef.current = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), owner: getMachineSessionOwner() }
    resultRef.current = null
    accRef.current = { speed: 0, speedN: 0, cadence: 0, cadenceN: 0, power: 0, powerN: 0, hr: 0, hrN: 0 }
    autoRef.current = false
    phaseRef.current = 'work'
    setFinished(null)
    setPausedTreadmill(null)
    setResumeFrom(null)
    setTreadmillOffsets({})
    setLocalElapsed(0)
    setStartBaselinePending(true)
    setPaused(false)
    setRunning(true)
  }, [requestWorkoutStart, t, toast])

  const togglePause = useCallback(async () => {
    if (controlPending.current || finishingRef.current) return
    controlPending.current = true
    try {
      if (paused) {
        if (!(await requestWorkoutStart(true))) return
        setResumeFrom(liveMetrics)
      } else {
        setPrivateStarting(null)
        setResumeFrom(null)
        setPausedTreadmill(pausedTreadmill ?? { metrics, heartRate: liveHeartRate })
        await stopDevice(machineType, true)
      }
      setPaused(!paused)
    } catch {
      setPrivateStarting(null)
      if (!paused) setPausedTreadmill(null)
      toast(t(paused ? '未确认器械恢复，请先检查器械面板，再重试' : '器械控制失败，请使用器械面板'))
    } finally {
      controlPending.current = false
      setLocalCountdown(null)
    }
  }, [paused, machineType, liveMetrics, liveHeartRate, metrics, pausedTreadmill, requestWorkoutStart, stopDevice, t, toast])

  const finish = useCallback(
    async (auto = false) => {
      if (controlPending.current || finishingRef.current || !workoutRef.current) return
      finishingRef.current = true
      setSaving(true)
      const workout = workoutRef.current
      const a = accRef.current
      setRunning(false)
      setPaused(false)
      setPausedTreadmill(null)
      setResumeFrom(null)
      setStartBaselinePending(false)
      setPrivateStarting(null)
      try {
        await stopDevice(machineType)
      } catch {
        toast(t('未能确认器械停止，请使用器械面板停止'))
      }
      if (!canSaveWorkout) {
        workoutRef.current = null
        setConfirmOpen(false)
        finishingRef.current = false
        setSaving(false)
        toast(t('未达到最低记录条件，本次训练未保存'))
        return
      }
      const avg = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 10) / 10 : 0)
      const record: MachineSession = resultRef.current ?? {
        id: workout.id,
        date: workout.startedAt,
        endedAt: new Date().toISOString(),
        machine: machineType,
        mode,
        durationSec: elapsed,
        distanceM: Math.round(distance),
        avgSpeed: distance > 0 && elapsed > 0 ? avg(distance * 3.6, elapsed) : avg(a.speed, a.speedN),
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
    [machineType, stopDevice, elapsed, distance, mode, distanceTarget, timeTarget, intervalCfg.rounds, calories, reached, canSaveWorkout, t, toast],
  )

  // 目标达成自动结束
  useEffect(() => {
    if (!running || paused || pausedTreadmill || (machineType === 'treadmill' && startBaselinePending) || showingCountdown || adjustingTreadmill ||
      !reached || controlPending.current || autoRef.current) return
    autoRef.current = true
    finish(true)
  }, [reached, running, paused, pausedTreadmill, machineType, startBaselinePending, showingCountdown, adjustingTreadmill, finish])

  // 间歇阶段切换提示
  useEffect(() => {
    if (!running || paused || pausedTreadmill || showingCountdown || (machineType === 'treadmill' && startBaselinePending) || reached || mode !== 'interval') return
    if (phaseRef.current !== interval.phase) {
      phaseRef.current = interval.phase
      const prefs = getPrefs()
      if (prefs.sound) beep(interval.phase === 'work' ? 880 : 520, 160)
      if (prefs.vibration) vibrate(interval.phase === 'work' ? 120 : 60)
    }
  }, [interval.phase, running, paused, pausedTreadmill, showingCountdown, machineType, startBaselinePending, reached, mode])

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
    const past = finished.completed ? comparableWorkouts(history, finished) : []
    const prev = past[0]
    const bestTime = past.length ? Math.min(...past.map((s) => s.durationSec)) : 0
    const delta = prev ? prev.durationSec - finished.durationSec : 0
    const statItems = [
      { label: t('平均功率'), value: finished.power ? `${finished.power} W` : '—' },
      finished.mode === 'distance'
        ? { label: t('总用时'), value: formatTime(finished.durationSec) }
        : { label: t('距离'), value: `${(finished.distanceM / 1000).toFixed(2)} km` },
      { label: t('消耗'), value: `${finished.calories} kcal` },
      { label: t('平均心率'), value: finished.avgHr ? `${finished.avgHr} bpm` : '—' },
      { label: t('平均速度'), value: finished.avgSpeed ? `${finished.avgSpeed} km/h` : '—' },
      { label: t('平均{{label}}', { label: t(cadenceLabel) }), value: finished.cadence ? `${finished.cadence} ${cadenceUnit}` : '—' },
      ...(machineType === 'treadmill' ? [{ label: t('平均配速'), value: finished.distanceM > 0 && finished.durationSec > 0
        ? `${formatTreadmillPace(finished.durationSec * 1000 / finished.distanceM)} /km` : '—' }] : []),
    ]

    return (
      <div className="px-5 pt-5 pb-6 hd:lg:mx-auto hd:lg:max-w-[820px] hd:lg:px-8 hd:lg:pt-8">
        <Link to="/machines" replace className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-text-sub">
          <ArrowLeft size={18} aria-hidden="true" />
          {t('返回器械列表')}
        </Link>
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

          {prev && (
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

  const machinePast = comparableWorkouts(history, {
    machine: machineType,
    mode,
    target: mode === 'distance' ? distanceTarget : mode === 'time' ? timeTarget
      : mode === 'interval' ? intervalCfg.rounds : undefined,
  })
  const lastRun = mode === 'free'
    ? history.filter((session) => session.machine === machineType && session.mode === 'free' && session.completed)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0]
    : machinePast[0]
  const bestRunTime = machinePast.length ? Math.min(...machinePast.map((s) => s.durationSec)) : 0

  return (
    <div className={`px-5 pt-4 hd:lg:px-8 hd:lg:pt-6 ${connected ? 'pb-[calc(env(safe-area-inset-bottom)+84px)] hd:lg:pb-8' : ''}`}>
      {showingCountdown && createPortal(
        <div className="fixed inset-0 z-[80] grid place-items-center bg-text text-white">
          <div className="flex flex-col items-center gap-5 text-center" role="status" aria-live="assertive">
            <p className="text-lg font-semibold">{t(localCountdown?.resume || privateStarting?.resume ? '即将恢复训练' : '准备开始')}</p>
            {countdown ? <p className="font-mono text-[clamp(8rem,38vmin,20rem)] font-bold leading-none text-primary tabular-nums">{countdown}</p>
              : <p className="text-sm text-white/75">{t(countdown === 0 ? '等待启动确认…' : '等待器械启动…')}</p>}
            {Boolean(localCountdown?.seconds) && <button type="button" onClick={() => countdownAbort.current?.abort()}
              className="rounded-full border border-white/50 px-6 py-2 text-sm font-semibold">{t('取消')}</button>}
          </div>
        </div>, document.body,
      )}
      {/* 顶栏 */}
      <header className="mb-4 flex items-center gap-3">
        <button
          onClick={() => {
            if (controlPending.current || finishingRef.current) return
            if (running || paused) setConfirmOpen(true)
            else navigate('/machines')
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
        {connected && !running && !paused && !showingCountdown && !saving && (
          <button
            onClick={() => {
              if (controlPending.current || finishingRef.current) return
              disconnectDevice(machineType)
              if (state?.fromDeviceSearch === true) navigate(-1)
              else navigate('/machines', { replace: true })
            }}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-[15px] text-text-sub"
          >
            {t('断开')}
          </button>
        )}
      </header>

      {connected && (running || paused) && (
        <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-card">
          <span className={`font-semibold ${paused ? 'text-text-sub' : 'text-connected'}`}>
            {paused ? t('已暂停') : pausedTreadmill ? t('即将恢复训练') : t('训练中')}
          </span>
          <span className="text-text-sub">
            {mode === 'interval' ? `${t('第 {{current}}/{{total}} 组', { current: interval.round, total: intervalCfg.rounds })} · ${t(interval.phase === 'work' ? '训练阶段' : '休息阶段')} · ${formatTime(interval.remain)}`
              : mode === 'distance' ? t('还剩 {{distance}} 公里', { distance: Math.max(0, (distanceTarget - distance) / 1000).toFixed(2) })
                : mode === 'time' ? `${t('剩余时间')} ${formatTime(Math.max(0, timeTarget - elapsed))}`
                  : t('已用时 {{time}}', { time: formatTime(elapsed) })}
          </span>
        </div>
      )}

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
                      {paused ? t('已暂停') : showingCountdown ? t('准备开始') : t('训练中')}
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
                            ? t(metrics.elapsedTime === undefined && machineType !== 'treadmill' ? '应用计时' : '器械计时')
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
                  {basicReadouts.concat(showMoreData ? extraReadouts : []).map(([label, value, unit], i, items) => (
                    <div
                      key={label}
                      className={`px-4 py-3.5 ${i >= 2 ? 'border-t border-border' : ''} ${
                        i % 2 === 0 ? (i === items.length - 1 ? 'col-span-2' : 'border-r border-border') : ''
                      }`}
                    >
                      <p className="text-[15px] text-text-sub">{t(label)}</p>
                      <div className="mt-1 flex items-baseline gap-1">
                        <p className={`font-mono text-[28px] font-bold leading-none tabular-nums hd:lg:text-[34px]`}>
                          {value ?? '--'}
                        </p>
                        {unit && <span className="text-[15px] text-text-sub">{unit}</span>}
                      </div>
                    </div>
                  ))}
                  {extraReadouts.length > 0 && <button type="button" aria-expanded={showMoreData} onClick={() => setShowMoreData((expanded) => !expanded)}
                    className="col-span-2 flex min-h-11 items-center justify-center gap-2 border-t border-border px-4 py-2 text-sm font-semibold text-text-sub">
                    {showMoreData ? t('收起') : t('更多数据')}
                    <span aria-hidden="true" className={`size-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-current ${showMoreData ? 'rotate-180' : ''}`} />
                  </button>}
                </div>
                </div>

                <div className="space-y-3">
                {treadmillLimits && (
                  <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
                    <h2 className="font-display text-base font-bold">{t('跑步机控制')}</h2>
                    {(['speed', 'incline'] as const).map((field) => {
                      const range = treadmillLimits[field]
                      const current = liveMetrics[field]
                      const isSpeed = field === 'speed'
                      const label = t(isSpeed ? '速度' : '坡度')
                      const step = range?.step ?? (isSpeed ? 0.1 : 1)
                      const privatePairUnavailable = device?.treadmillProtocol === 'private' &&
                        (!treadmillLimits.speed || !treadmillLimits.incline || liveMetrics.incline === undefined)
                      const disabled = privatePairUnavailable || !range || current === undefined || !liveMetrics.speed ||
                        paused || Boolean(pausedTreadmill) || adjustingTreadmill || Boolean(pendingTarget) || showingCountdown
                      return (
                        <div key={field} className="rounded-md bg-surface-2 px-3 py-2">
                          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
                            <p className="text-sm font-semibold">{label}</p>
                            <p className="text-xs text-text-sub">{range ? `${range.min}–${range.max} ${isSpeed ? 'km/h' : '%'}`
                              : t(device?.treadmillProtocol === 'ftms' ? '器械未提供调节范围' : '等待读取器械范围')}</p>
                          </div>
                          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                            {[-1, 0, 1].map((direction) => {
                              if (direction === 0) return <div key={direction} className="min-w-0 text-center">
                                <p className="font-mono text-lg font-bold tabular-nums">{metrics[field] ?? '—'} <span className="text-xs font-normal text-text-sub">{isSpeed ? 'km/h' : '%'}</span></p>
                                {pendingTarget?.field === field && <p role="status" className="text-xs text-text-sub">{t('调节中')} · {pendingTarget.value}</p>}
                              </div>
                              const min = range?.min ?? 0
                              const index = Math.round(((current ?? min) - min) / step) + direction
                              const target = Math.round((min + index * step) * 100) / 100
                              return <button key={direction} type="button"
                                aria-label={`${direction < 0 ? t('降低') : t('提高')}${label}`}
                                disabled={disabled || !range || target < range.min || target > range.max}
                                onClick={() => void adjustTreadmill(field, target)}
                                className="grid size-11 place-items-center rounded-md bg-text text-xl font-bold text-bg disabled:opacity-30">
                                {direction < 0 ? '−' : '+'}
                              </button>
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </section>
                )}

                {machineType !== 'treadmill' && (() => {
                  const range = device.resistanceRange
                  const resistanceDisabled = isResistanceDisabled(machineNavigation, device.name)
                  const current = metrics.resistance
                  return range && <section className="rounded-lg border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="font-display text-base font-bold">{t('阻力')}</h2>
                        <p className="text-xs text-text-sub">{resistanceDisabled ? t('器械仅支持手动调节') : `${range.min}–${range.max}`}</p>
                      </div>
                      {!resistanceDisabled && <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
                        {[-1, 0, 1].map((direction) => {
                          if (direction === 0) return <div key={direction} className="text-center">
                            <p className="font-mono text-lg font-bold tabular-nums">{current ?? '—'}</p>
                            {pendingTarget?.field === 'resistance' && <p role="status" className="text-xs text-text-sub">{t('调节中')} · {pendingTarget.value}</p>}
                          </div>
                          const step = range.step ?? 1
                          const index = Math.round(((current ?? range.min) - range.min) / step) + direction
                          const target = Math.round((range.min + index * step) * 10) / 10
                          return <button key={direction} type="button" aria-label={t(direction < 0 ? '降低阻力' : '提高阻力')}
                            disabled={paused || Boolean(pausedTreadmill) || Boolean(pendingTarget) || current === undefined || target < range.min || target > range.max}
                            onClick={() => void adjustTreadmill('resistance', target)}
                            className="grid size-11 place-items-center rounded-md bg-text text-xl font-bold text-bg disabled:opacity-30">
                            {direction < 0 ? '−' : '+'}
                          </button>
                        })}
                      </div>}
                    </section>
                })()}

                <section className="rounded-lg border border-border bg-surface px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                      <Heart size={15} aria-hidden="true" className="text-primary" /> {t('心率')}
                    </h2>
                    {hrDevice.connected ? <span className="max-w-full truncate text-xs text-connected">{hrDevice.name}</span>
                      : <QuickConnect type="heartRate" label={t('连接心率带')} />}
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[28px] font-bold leading-none tabular-nums">{hr || '--'}</span>
                    <span className="text-[15px] text-text-sub">bpm</span>
                    {hr > 0 && <span className={`text-xs font-semibold ${zone.color}`}>{t(zone.label)}</span>}
                  </div>
                </section>
                </div>
              </div>

              {paused && !showingCountdown && createPortal(
                <div className="pointer-events-none fixed inset-0 z-40" role="status" aria-live="polite">
                  <div className="absolute left-1/2 top-1/2 w-[calc(100%-2.5rem)] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface/95 p-5 text-center shadow-lg backdrop-blur">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface-2">
                          <Pause size={18} />
                        </div>
                        <p className="mt-2 font-display text-[19px] font-bold">{t('已暂停')}</p>
                        <p className="mt-1 text-[15px] text-text-sub">{t('计时与器械数据已停止，继续后从当前位置恢复')}</p>
                        {machineType === 'treadmill' && pausedTreadmill?.metrics.speed ? <p className="mt-2 text-sm font-semibold">
                          {t(device.treadmillProtocol === 'private' && treadmillLimits?.speed && treadmillLimits?.incline
                            ? '继续后将恢复至 {{speed}} km/h' : '暂停前速度 {{speed}} km/h', { speed: pausedTreadmill.metrics.speed })}
                        </p> : null}
                  </div>
                </div>, document.body,
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
            <p className="font-display text-lg font-bold">{t(canSaveWorkout ? '结束本次训练？' : '结束且不保存？')}</p>
            <p className="mt-1 text-sm text-text-sub">
              {t(canSaveWorkout
                ? '当前用时 {{time}} · 距离 {{distance}} km，结束后将保存记录。'
                : '当前用时 {{time}} · 距离 {{distance}} 米。本次训练未达到最低记录条件，结束后不会保存或计入统计。', {
                time: formatTime(elapsed),
                distance: canSaveWorkout ? (distance / 1000).toFixed(2) : Math.floor(distance),
              })}
            </p>
            {!canSaveWorkout && !saving && (
              <p className="mt-2 text-sm text-text-sub">
                {t(machineType === 'stair'
                  ? '至少训练 10 秒，并达到 50 米、10 步、爬升 3 米或 1 层中的任一项。'
                  : machineType === 'rower' || machineType === 'ski'
                    ? '至少训练 10 秒，并达到 50 米或累计 10 次。'
                    : '至少训练 10 秒，并达到 50 米。')}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="flex-1 rounded-md border border-border py-3 text-[17px]"
              >
                {t('继续训练')}
              </button>
              <button
                onClick={() => finish(false)}
                disabled={saving}
                className="flex-1 rounded-md bg-text py-3 text-[17px] font-semibold text-bg disabled:opacity-60"
              >
                {saving ? t('正在结束…') : t(canSaveWorkout ? '结束并保存' : '结束且不保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
