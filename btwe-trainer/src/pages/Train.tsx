import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  StopCircle,
  CheckCircle2,
  ArrowRight,
  Waves,
  Dumbbell,
  Footprints,
  Info,
  Lightbulb,
  Bluetooth,
  BluetoothOff,
  Radio,
  Home,
  Heart,
  Sparkles,
} from 'lucide-react'
import { EXERCISES, BTWE_MODULES } from '../mock/data'
import { formatTimer, formatTime } from '../utils/format'
import type { SessionRecord } from '../types'
import { saveSession } from '../api'
import { useToast } from '../components/Toast'
import type { DeviceSegmentInput } from '../api/deviceSync'
import { buildTrainingResult, capturePhaseSegment, type TrainingResult } from '../../../race-trainer-shared/trainingResult'
import { useDevices, type DeviceType } from '../context/DeviceContext'
import { useBand } from '../context/BandContext'
import DevicePanel from '../components/DevicePanel'
import BandPanel from '../components/BandPanel'
import { getPrefs } from '../utils/prefs'
import { beep, vibrate } from '../utils/feedback'

type Phase = 'run' | 'cardio' | 'strength'

// 动作 → 对应器械类型
const EX_DEVICE: Record<string, DeviceType> = {
  row: 'rower',
  ski: 'ski',
  bike: 'bike',
  'sled-push': 'sled',
  'sled-pull': 'sled',
  burpee: 'rep',
  lunge: 'rep',
  'ball-wall': 'rep',
}

export default function Train({ userId }: { userId: string | null }) {
  const band = useBand()
  const [running, setRunning] = useState(false)
  const [moduleIdx, setModuleIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('run')
  const [phaseTimes, setPhaseTimes] = useState<number[]>([]) // 每阶段用时（秒，来自器械）
  const [phaseStartDist, setPhaseStartDist] = useState(0)
  const [autoAdvanced, setAutoAdvanced] = useState(false)
  const [finished, setFinished] = useState(false)
  const [aborted, setAborted] = useState(false)
  const [abortSnapshot, setAbortSnapshot] = useState<{
    times: number[]
    total: number
    partialIndex: number | null
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [pressProgress, setPressProgress] = useState(0) // 结束按钮长按进度 0-100
  const pressTimerRef = useRef<number | null>(null)
  const pressRafRef = useRef<number | null>(null)
  // AI 教练实时鼓励
  const [coachMsg, setCoachMsg] = useState<string>('准备好了吗？连接器械后点击开始，我陪你一起练！')
  const [coachKey, setCoachKey] = useState(0)
  const coachMilestoneRef = useRef<Set<string>>(new Set())
  const lastHrWarnRef = useRef(0)
  const [hrPanelOpen, setHrPanelOpen] = useState(false)
  // 手环整场数据：分段 + 心率采样 + 开训时间
  const segmentsRef = useRef<DeviceSegmentInput[]>([])
  const hrSamplesRef = useRef<number[]>([])
  const lastHrSampleRef = useRef(0)
  const recordedPhaseRef = useRef<string | null>(null)
  const sessionStartRef = useRef<{ ms: number; iso: string } | null>(null)
  const resultRef = useRef<TrainingResult | null>(null)
  const savingRef = useRef(false)
  const navigate = useNavigate()
  const toast = useToast()
  const { devices, connectDevice, startDevice, stopDevice, resetAllDevices, supported } = useDevices()

  const currentModule = BTWE_MODULES[moduleIdx]
  const cardioEx = EXERCISES.find((e) => e.id === currentModule.cardioExerciseId)!
  const strengthEx = EXERCISES.find((e) => e.id === currentModule.strengthExerciseId)!

  const phaseDeviceType: DeviceType =
    phase === 'run'
      ? 'treadmill'
      : phase === 'cardio'
        ? EX_DEVICE[cardioEx.id]
        : EX_DEVICE[strengthEx.id]

  const phaseDevice = devices[phaseDeviceType]
  const hrDevice = devices.heartRate
  const deviceConnected = phaseDevice.connected
  const deviceConnecting = phaseDevice.status === 'connecting'
  const phaseTarget =
    phase === 'run'
      ? currentModule.runDistance
      : phase === 'cardio'
        ? cardioEx.target
        : strengthEx.target

  // 计时以器械 elapsedTime 为权威源
  const deviceSeconds = phaseDevice.metrics.elapsedTime ?? 0
  const currentDist = phaseDevice.metrics.distance ?? 0
  const phaseProgress = phaseTarget
    ? Math.min(100, Math.max(0, ((currentDist - phaseStartDist) / phaseTarget) * 100))
    : 0
  // 目标是否达成（完成按钮与自动推进的唯一依据）
  const targetReached = deviceConnected && currentDist - phaseStartDist >= phaseTarget

  // 模块用时 = 该模块 3 个阶段用时之和
  const moduleTimes: number[] = []
  for (let i = 0; i < phaseTimes.length; i += 3) {
    moduleTimes.push(phaseTimes.slice(i, i + 3).reduce((a, b) => a + b, 0))
  }
  const totalSeconds = phaseTimes.reduce((a, b) => a + b, 0) + deviceSeconds

  // 自动推进：器械数据达标后立即停止器械（冻结计时），延迟后自动进入下一阶段
  useEffect(() => {
    if (!running || !targetReached || autoAdvanced) return
    setAutoAdvanced(true)
    // 目标达成：立即停止器械，elapsedTime 冻结，累计用时同步暂停
    let active = true
    let timer: number | undefined
    void stopDevice(phaseDeviceType).then((stopped) => {
      if (!active) return
      if (stopped) timer = window.setTimeout(() => completePhase(), 1200)
      else setAutoAdvanced(false)
    })
    return () => { active = false; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetReached, running, phaseDeviceType])

  // AI 教练：根据运动情况实时鼓励
  useEffect(() => {
    if (finished || aborted) return
    const phaseKey = `${moduleIdx}-${phase}`
    const hr = hrDevice.metrics.heartRate ?? 0
    const now = Date.now()

    const say = (msg: string) => {
      setCoachMsg(msg)
      setCoachKey((k) => k + 1)
    }

    // 心率预警（每 8 秒最多一次）
    if (running && hrDevice.connected && hr > 0) {
      if (hr >= 175 && now - lastHrWarnRef.current > 8000) {
        lastHrWarnRef.current = now
        say(`心率 ${hr} bpm 偏高，降一点强度，调整呼吸`)
        return
      }
      if (hr < 95 && now - lastHrWarnRef.current > 8000) {
        lastHrWarnRef.current = now
        say(`心率 ${hr} bpm，强度不够，加点速！`)
        return
      }
    }

    if (!running || !deviceConnected) return

    // 阶段开始
    if (phaseProgress < 1 && !coachMilestoneRef.current.has(`${phaseKey}-start`)) {
      coachMilestoneRef.current.add(`${phaseKey}-start`)
      if (phase === 'run') say('跑起来！保持稳定配速，鼻吸嘴呼')
      else if (phase === 'cardio') say(`${cardioEx.name}，核心收紧，发力呼气`)
      else say(`${strengthEx.name}，动作标准比数量更重要`)
      return
    }

    // 进度里程碑
    const milestones = [
      { at: 25, msg: '四分之一了，状态不错，继续保持！' },
      { at: 50, msg: '过半！调整呼吸，稳住节奏' },
      { at: 75, msg: '最后一段，拼一把，你可以的！' },
    ]
    for (const m of milestones) {
      if (phaseProgress >= m.at && !coachMilestoneRef.current.has(`${phaseKey}-${m.at}`)) {
        coachMilestoneRef.current.add(`${phaseKey}-${m.at}`)
        say(m.msg)
        return
      }
    }

    // 目标达成
    if (targetReached && !coachMilestoneRef.current.has(`${phaseKey}-done`)) {
      coachMilestoneRef.current.add(`${phaseKey}-done`)
      say('太棒了！目标达成，干得漂亮 🎉')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseProgress, running, phase, moduleIdx, targetReached, hrDevice.metrics.heartRate, hrDevice.connected, deviceConnected, finished, aborted])

  // 切换阶段时重置里程碑
  useEffect(() => {
    coachMilestoneRef.current = new Set()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, moduleIdx])

  // 心率采样（最多每 3 秒一次），用于整场同步的 avg/max HR
  useEffect(() => {
    const hr = hrDevice.metrics.heartRate
    if (!hrDevice.connected || !hr || hr < 30) return
    const now = Date.now()
    if (now - lastHrSampleRef.current < 3000) return
    lastHrSampleRef.current = now
    hrSamplesRef.current.push(hr)
    if (hrSamplesRef.current.length > 800) hrSamplesRef.current.shift()
  }, [hrDevice.metrics.heartRate, hrDevice.connected])

  // 记录当前阶段的分段数据（在手环里表现为一次器械 BLE 连接）
  function recordPhaseSegment() {
    const phaseKey = `${moduleIdx}-${phase}`
    if (recordedPhaseRef.current === phaseKey) return
    const segment = capturePhaseSegment(
      segmentsRef.current.length + 1,
      phase === 'run' ? 'treadmill' : 'station',
      phaseDeviceType,
      devices[phaseDeviceType],
      sessionStartRef.current?.ms,
    )
    if (!segment) return
    recordedPhaseRef.current = phaseKey
    segmentsRef.current.push(segment)
  }

  // 开始当前阶段：启动器械。若器械已有累计时间则为暂停恢复，否则归零启动
  async function start() {
    const reset = (phaseDevice.metrics.elapsedTime ?? 0) === 0
    if (!await startDevice(phaseDeviceType, reset)) return
    if (!sessionStartRef.current) {
      sessionStartRef.current = { ms: Date.now(), iso: new Date().toISOString() }
    }
    setRunning(true)
  }

  // 暂停：停止器械计时（保留数据）
  async function pause() {
    if (await stopDevice(phaseDeviceType)) setRunning(false)
  }

  // 训练页内连接心率带：展开面板时按偏好自动暂停训练
  function toggleHrConnect() {
    if (!hrPanelOpen && running && getPrefs().autoPause) pause()
    setHrPanelOpen((v) => !v)
  }

  // 完成当前阶段（不自动启动下一阶段器械，需用户手动点击"开始"）
  async function completePhase() {
    if (!await stopDevice(phaseDeviceType)) return
    const p = getPrefs()
    if (p.sound) beep(880, 140)
    if (p.vibration) vibrate(90)
    const phaseTime = phaseDevice.metrics.elapsedTime ?? 0
    // 先落一段手环数据，再清空器械
    recordPhaseSegment()
    const newPhaseTimes = [...phaseTimes, phaseTime]
    setPhaseTimes(newPhaseTimes)
    // 停止并清空所有器械数据，确保下一阶段器械从零开始计时
    resetAllDevices()

    if (phase === 'strength') {
      // 整个模块完成
      if (moduleIdx === 3) {
        setRunning(false)
        setFinished(true)
        return
      }
      setModuleIdx(moduleIdx + 1)
      setPhase('run')
      setPhaseStartDist(0)
      setRunning(false)
      setAutoAdvanced(false)
    } else {
      const next: Phase = phase === 'run' ? 'cardio' : 'strength'
      setPhase(next)
      setPhaseStartDist(0)
      setRunning(false)
      setAutoAdvanced(false)
    }
  }

  // 终止本次训练：先冻结当前阶段数据，再停止所有器械并显示终止页
  async function abortSession() {
    const stopped = await stopDevice(phaseDeviceType)
    if (!stopped) toast('未能确认器械停止，请在器械上停止')
    // resetAllDevices 会把器械计时清零，必须在重置前取走当前阶段的数据
    recordPhaseSegment()
    const partial = deviceSeconds
    const times = partial > 0 ? [...phaseTimes, partial] : [...phaseTimes]
    const total = phaseTimes.reduce((a, b) => a + b, 0) + partial
    setAbortSnapshot({ times, total, partialIndex: partial > 0 ? times.length - 1 : null })
    if (stopped) resetAllDevices()
    setRunning(false)
    setAborted(true)
  }

  // 长按结束按钮（2 秒）防误触
  const PRESS_DURATION = 2000
  function handlePressStart() {
    if (finished || aborted) return
    const start = performance.now()
    const tick = () => {
      const elapsed = performance.now() - start
      const pct = Math.min(100, (elapsed / PRESS_DURATION) * 100)
      setPressProgress(pct)
      if (pct < 100) {
        pressRafRef.current = requestAnimationFrame(tick)
      }
    }
    pressRafRef.current = requestAnimationFrame(tick)
    pressTimerRef.current = window.setTimeout(() => {
      abortSession()
      clearPress()
    }, PRESS_DURATION)
  }

  function handlePressEnd() {
    if (pressProgress < 100) {
      // 未达到阈值，取消
      clearPress()
    }
  }

  function clearPress() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    if (pressRafRef.current) {
      cancelAnimationFrame(pressRafRef.current)
      pressRafRef.current = null
    }
    setPressProgress(0)
  }

  // 组件卸载时清理长按计时器
  useEffect(() => {
    return () => clearPress()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 重新开始训练（保留器械连接，清空状态）
  function restart() {
    resetAllDevices()
    segmentsRef.current = []
    hrSamplesRef.current = []
    lastHrSampleRef.current = 0
    recordedPhaseRef.current = null
    sessionStartRef.current = null
    resultRef.current = null
    setRunning(false)
    setModuleIdx(0)
    setPhase('run')
    setPhaseTimes([])
    setPhaseStartDist(0)
    setAutoAdvanced(false)
    setFinished(false)
    setAborted(false)
    setAbortSnapshot(null)
  }

  async function persistResult(draft: Omit<SessionRecord, 'id' | 'date'>) {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (!resultRef.current) {
        resultRef.current = buildTrainingResult(
          'btwe', draft, segmentsRef.current, hrSamplesRef.current, sessionStartRef.current?.iso,
        )
      }
      const { session, device } = resultRef.current
      await saveSession(session, userId)
      await band.queueSession(device)
      navigate('/records')
    } catch {
      toast('保存到本机失败，请重试')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function finishSession() {
    await persistResult({
      planId: localStorage.getItem('btwe-selected-plan') || 'plan-intermediate',
      moduleTimes,
      // 每次跑段用时：phaseTimes 为「跑、有氧、力量」循环，取 3 的倍数下标
      runSplit: phaseTimes.filter((_, i) => i % 3 === 0),
      totalTime: totalSeconds,
      completed: true,
    })
  }

  // 终止后保存为未完成记录（便于在 Records 里查看部分训练数据）
  async function saveAbortedSession() {
    const snapshot = abortSnapshot
    if (!snapshot || snapshot.times.length === 0) {
      navigate('/')
      return
    }
    // 按「跑 + 有氧 + 力量」三阶段合成模块用时，最后不足一组也保留
    const moduleTotals: number[] = []
    for (let i = 0; i < snapshot.times.length; i += 3) {
      moduleTotals.push(snapshot.times.slice(i, i + 3).reduce((a, b) => a + b, 0))
    }
    await persistResult({
      planId: localStorage.getItem('btwe-selected-plan') || 'plan-intermediate',
      moduleTimes: moduleTotals,
      // 进行中的跑段不足 1km，不计入 1km 配速
      runSplit: snapshot.times.filter(
        (_, i) => i % 3 === 0 && i !== snapshot.partialIndex
      ),
      totalTime: snapshot.total,
      completed: false,
      // 最后一个模块是进行中状态（不足一整组），分享卡上需要标注
      partialModuleIndex:
        snapshot.partialIndex !== null ? moduleTotals.length - 1 : undefined,
    })
  }

  if (aborted) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="reveal reveal-1 mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-danger bg-danger/10">
          <StopCircle size={56} className="text-danger" />
        </div>
        <h1 className="reveal reveal-2 font-display text-3xl font-bold">训练已终止</h1>
        <p className="reveal reveal-3 mt-2 text-text-sub">本次训练未完成，可保存部分记录或放弃</p>

        <div className="reveal reveal-4 mt-8 w-full rounded-radius-lg border border-border bg-surface p-5">
          <p className="text-sm text-text-sub">已完成模块</p>
          <p className="mt-1 font-mono text-2xl font-bold text-text">
            {Math.floor(phaseTimes.length / 3)} / 4
          </p>
          {abortSnapshot && abortSnapshot.total > 0 && (
            <p className="mt-2 text-xs text-text-sub">
              累计用时 {formatTime(abortSnapshot.total)}
            </p>
          )}
        </div>

        {abortSnapshot && abortSnapshot.times.length > 0 && (
          <button
            onClick={saveAbortedSession}
            disabled={saving}
            className="reveal reveal-5 mt-6 w-full rounded-radius-md bg-primary py-3.5 font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? '保存中…' : '保存本次训练记录'}
          </button>
        )}
        <button
          onClick={restart}
          className={`reveal ${abortSnapshot && abortSnapshot.total > 0 ? 'reveal-6' : 'reveal-5'} mt-3 w-full rounded-radius-md border border-border bg-surface py-3 font-semibold text-text transition-transform active:scale-[0.98]`}
        >
          重新开始
        </button>
        <button
          onClick={() => navigate('/')}
          className={`reveal ${abortSnapshot && abortSnapshot.total > 0 ? 'reveal-7' : 'reveal-6'} mt-3 flex w-full items-center justify-center gap-2 rounded-radius-md border border-border bg-transparent py-3 text-sm text-text-sub`}
        >
          <Home size={16} /> 放弃并返回首页
        </button>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="reveal reveal-1 mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-primary bg-primary/10">
          <CheckCircle2 size={56} className="text-primary" />
        </div>
        <h1 className="reveal reveal-2 font-display text-3xl font-bold">训练完成！</h1>
        <p className="reveal reveal-3 mt-2 text-text-sub">4 模块全部搞定，干得漂亮</p>

        <div className="reveal reveal-4 mt-8 w-full rounded-radius-lg border border-border bg-surface p-5">
          <p className="text-sm text-text-sub">总用时</p>
          <p className="font-mono text-5xl font-bold text-primary">{formatTime(totalSeconds)}</p>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {moduleTimes.map((t, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-text-sub">M{i + 1}</p>
                <p className="font-mono text-sm font-semibold">{formatTime(t)}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={finishSession}
          disabled={saving}
          className="reveal reveal-5 mt-6 w-full rounded-radius-md bg-primary py-3.5 font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存并查看记录'}
        </button>
        <button
          onClick={restart}
          className="reveal reveal-6 mt-3 w-full rounded-radius-md border border-border bg-surface py-3 text-sm text-text-sub"
        >
          再来一次
        </button>
      </div>
    )
  }

  const phaseLabel: Record<Phase, string> = {
    run: '800m 跑步',
    cardio: cardioEx.name,
    strength: strengthEx.name,
  }
  const phaseIcon: Record<Phase, typeof Waves> = {
    run: Footprints,
    cardio: Waves,
    strength: Dumbbell,
  }
  const PhaseIcon = phaseIcon[phase]
  const progress = ((moduleIdx + (phase === 'run' ? 0 : phase === 'cardio' ? 0.33 : 0.66)) / 4) * 100

  return (
    <div className="flex h-full flex-col px-5 pt-5 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:grid-flow-row-dense lg:auto-rows-min lg:content-start lg:items-start lg:gap-5 lg:px-8 lg:pt-7">
      {/* 模块进度 */}
      <div className="reveal reveal-1 mb-3 lg:col-start-1 lg:mb-0">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-text-sub">
            BTWE 模块 {moduleIdx + 1} / 4 · {phaseLabel[phase]}
          </span>
          <span className="font-mono text-primary">{Math.floor(progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between">
          {BTWE_MODULES.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${
                i < moduleIdx ? 'bg-primary' : i === moduleIdx ? 'bg-primary/50' : 'bg-surface-2'
              }`}
              style={{ marginRight: i < 3 ? 6 : 0 }}
            />
          ))}
        </div>
      </div>

      {/* 计时器 —— 数据来自器械 elapsedTime */}
      <div className="reveal reveal-2 mb-3 text-center lg:col-start-1 lg:mb-0">
        <p className="mb-1 text-xs uppercase tracking-widest text-text-sub">
          器械计时{' '}
          {phaseDevice.running ? (
            <span className="text-primary">● 进行中</span>
          ) : targetReached ? (
            <span className="text-warning">● 目标达成，已暂停</span>
          ) : running ? (
            <span className="text-text-sub">● 已暂停</span>
          ) : null}
        </p>
        <p className="font-mono text-7xl font-bold tracking-tight text-text tabular-nums lg:text-8xl">
          {formatTimer(deviceSeconds * 1000)}
        </p>
        {phaseTimes.length > 0 && (
          <p className="mt-1 text-xs text-text-sub">
            累计 {formatTime(totalSeconds)}
          </p>
        )}
      </div>

      {/* AI 教练实时鼓励气泡 */}
      <div key={coachKey} className="reveal reveal-2 mb-3 coach-pop lg:col-start-2 lg:mb-0">
        <div className="flex items-center gap-2.5 rounded-radius-md border border-primary/30 bg-primary/5 px-3 py-2.5">
          <div className="relative shrink-0">
            <img
              src="./coach-avatar.jpg"
              alt="AI教练"
              className="h-8 w-8 rounded-full border border-primary/40 object-cover"
            />
            <Sparkles
              size={10}
              className="absolute -right-0.5 -bottom-0.5 text-primary"
            />
          </div>
          <p className="flex-1 text-sm leading-snug text-text">{coachMsg}</p>
        </div>
      </div>

      {/* 手环状态与同步 */}
      <div className="lg:col-start-2 lg:[&>div:first-child]:mb-0">
        <BandPanel />
      </div>

      {/* 心率设备状态条 */}
      <div
        className={`reveal reveal-2 mb-3 flex items-center justify-between rounded-radius-md border px-3 py-2 ${
          hrDevice.connected ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface'
        } lg:col-start-2 lg:mb-0`}
      >
        <div className="flex items-center gap-2">
          <Heart
            size={16}
            className={hrDevice.connected ? 'text-danger animate-pulse' : 'text-text-sub'}
            fill={hrDevice.connected ? 'currentColor' : 'none'}
          />
          <span
            className={`text-xs font-medium ${
              hrDevice.connected ? 'text-danger' : 'text-text-sub'
            }`}
          >
            {hrDevice.connected ? hrDevice.name : '心率带未连接'}
          </span>
        </div>
        {hrDevice.connected ? (
          <span className="font-mono text-lg font-bold text-danger tabular-nums">
            {hrDevice.metrics.heartRate ?? '—'}
            <span className="ml-1 text-[10px] font-normal text-text-sub">bpm</span>
          </span>
        ) : (
          <button onClick={toggleHrConnect} className="text-xs text-primary underline">
            {hrPanelOpen ? '收起' : '去连接'}
          </button>
        )}
      </div>

      {/* 训练页内连接心率带 */}
      {hrPanelOpen && !hrDevice.connected && (
        <div className="reveal reveal-2 mb-3 rounded-radius-md border border-border bg-surface p-3 lg:col-start-2 lg:mb-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1 text-xs font-semibold text-danger">
              <Heart size={12} /> 连接心率带
            </p>
            <button
              onClick={() => setHrPanelOpen(false)}
              className="text-[10px] text-text-sub underline"
            >
              取消
            </button>
          </div>
          <p className="mb-2 text-[10px] text-text-sub">
            {running ? '连接心率带将暂停训练' : '训练已暂停，连接后可继续点开始'}
          </p>
          <DevicePanel types={['heartRate']} />
        </div>
      )}

      {/* 实时器械数据流 */}
      <div
        className={`reveal reveal-2 mb-3 rounded-radius-md border p-3 ${
          deviceConnected ? 'border-border bg-surface' : 'border-danger/50 bg-danger/5'
        } lg:col-start-2 lg:mb-0`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {deviceConnected ? (
              <Bluetooth size={14} className="text-primary" />
            ) : deviceConnecting ? (
              <Radio size={14} className="animate-pulse text-warning" />
            ) : phaseDevice.status === 'failed' ? (
              <BluetoothOff size={14} className="text-danger" />
            ) : (
              <BluetoothOff size={14} className="text-text-sub" />
            )}
            <span
              className={`text-xs font-medium ${
                deviceConnected
                  ? 'text-primary'
                  : deviceConnecting
                    ? 'text-warning'
                    : phaseDevice.status === 'failed'
                      ? 'text-danger'
                      : 'text-text-sub'
              }`}
            >
              {deviceConnected
                ? phaseDevice.name
                : phaseDevice.status === 'connecting'
                    ? '正在建立连接…'
                    : phaseDevice.status === 'failed'
                      ? '连接失败，请重试'
                      : `${phaseLabel[phase]} 器械未连接`}
            </span>
          </div>
          <span className="text-[11px] text-text-sub">
            目标 {phaseTarget}
            {phase === 'strength' && strengthEx.metric === 'reps' ? ' 次' : 'm'}
          </span>
        </div>

        {deviceConnected ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${phaseProgress}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-mono text-[27px] font-bold text-text">
                  {Math.round(currentDist - phaseStartDist)}
                </p>
                <p className="text-[10px] text-text-sub">
                  {phase === 'strength' && strengthEx.metric === 'reps' ? '次数' : '距离 m'}
                </p>
              </div>
              <div>
                <p className="font-mono text-[27px] font-bold text-text">
                  {phaseDevice.metrics.speed ?? 0}
                </p>
                <p className="text-[10px] text-text-sub">速度 km/h</p>
              </div>
              <div>
                <p className="font-mono text-[27px] font-bold text-text">
                  {phaseDevice.metrics.calories ?? 0}
                </p>
                <p className="text-[10px] text-text-sub">卡路里 kcal</p>
              </div>
            </div>
            {phaseProgress >= 100 && (
              <p className="mt-2 text-center text-xs font-semibold text-primary">
                目标达成，即将进入下一阶段…
              </p>
            )}
          </>
        ) : (
          <div className="mt-3">
            <p className="text-xs text-text-sub">
              BTWE 训练要求每个项目连接对应智能器械，数据达标后自动推进。
            </p>

            {deviceConnecting ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                <Radio size={16} className="animate-spin" /> 正在连接器械…
              </div>
            ) : supported ? (
              <button
                onClick={() => connectDevice(phaseDeviceType)}
                className="mt-3 w-full rounded-radius-md bg-primary py-2.5 text-sm font-semibold text-bg"
              >
                搜索并连接设备
              </button>
            ) : (
              <p className="mt-3 text-xs text-warning">当前浏览器不支持蓝牙连接</p>
            )}
          </div>
        )}
      </div>

      {/* 平板驾驶舱：整场动作序列 */}
      <section className="hidden rounded-radius-lg border border-border bg-surface p-5 lg:col-start-2 lg:block">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-text-sub">整场动作序列</p>
            <h2 className="mt-1 font-display text-lg font-bold">4 模块 · 12 阶段</h2>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-xl font-bold text-primary tabular-nums">{formatTime(totalSeconds)}</p>
            <p className="text-[10px] text-text-sub">累计用时</p>
          </div>
        </div>
        <div className="space-y-2">
          {BTWE_MODULES.map((module, i) => {
            const cardio = EXERCISES.find((e) => e.id === module.cardioExerciseId)
            const strength = EXERCISES.find((e) => e.id === module.strengthExerciseId)
            return (
              <div
                key={i}
                className={`rounded-radius-md border p-3 ${
                  i === moduleIdx
                    ? 'border-primary/40 bg-primary/5'
                    : i < moduleIdx
                      ? 'border-border bg-surface-2/50'
                      : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-sm font-bold">模块 {i + 1}</p>
                  <span className={`text-[10px] ${i === moduleIdx ? 'text-primary' : 'text-text-sub'}`}>
                    {i < moduleIdx ? '已完成' : i === moduleIdx ? phaseLabel[phase] : '待训练'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-text-sub">
                  {module.runDistance}m 跑步 · {cardio?.name ?? module.cardioExerciseId} · {strength?.name ?? module.strengthExerciseId}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {phaseDevice.error && <p role="alert" className="mb-3 text-sm text-danger">{phaseDevice.error}</p>}

      {/* 动作卡 */}
      <div className="reveal reveal-3 mb-3 rounded-radius-lg border border-border bg-surface p-5 lg:col-start-1 lg:mb-0 lg:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-radius-md bg-primary/10 text-primary">
            <PhaseIcon size={24} />
          </div>
          <div>
            <p className="text-xs text-text-sub">{phase === 'run' ? '心肺过渡' : '功能训练'}</p>
            <h2 className="font-display text-xl font-bold lg:text-2xl">{phaseLabel[phase]}</h2>
          </div>
        </div>

        {phase !== 'run' && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-warning">
                <Lightbulb size={12} /> 动作要点
              </p>
              <ul className="space-y-1 text-sm text-text-sub">
                {(phase === 'cardio' ? cardioEx : strengthEx).tips.map((tip, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-primary">·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-accent">
                <Info size={12} /> 替代动作
              </p>
              <p className="text-sm text-text-sub">
                {(phase === 'cardio' ? cardioEx : strengthEx).alternatives.join(' / ')}
              </p>
            </div>
          </div>
        )}

        {phase === 'run' && (
          <div className="mt-4 rounded-radius-md bg-surface-2 p-3 text-sm text-text-sub">
            <p>
              保持稳定配速，为接下来的 {cardioEx.name} 和 {strengthEx.name} 调整呼吸。
            </p>
          </div>
        )}
      </div>

      {/* 控制按钮 */}
      <div className="reveal reveal-4 mt-auto space-y-3 lg:col-start-1 lg:mt-0">
        <button
          onClick={completePhase}
          disabled={!running || !deviceConnected || !targetReached}
          className={`flex w-full items-center justify-center gap-2 rounded-radius-md py-4 font-display text-lg font-bold transition-transform active:scale-[0.98] disabled:opacity-40 ${
            targetReached
              ? 'bg-primary text-bg'
              : 'bg-surface border border-border text-text-sub'
          }`}
        >
          {targetReached ? (
            <>
              完成 {phaseLabel[phase]} <ArrowRight size={20} />
            </>
          ) : (
            <>
              达成目标后可完成 · {Math.round(currentDist - phaseStartDist)}/{phaseTarget}
              {phase === 'strength' && strengthEx.metric === 'reps' ? ' 次' : 'm'}
            </>
          )}
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => (running ? pause() : start())}
            disabled={(!running && !deviceConnected) || targetReached}
            className="flex flex-1 items-center justify-center gap-2 rounded-radius-md border border-border bg-surface py-3 font-semibold transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {targetReached ? (
              <CheckCircle2 size={18} className="text-primary" />
            ) : running ? (
              <Pause size={18} />
            ) : (
              <Play size={18} />
            )}
            {targetReached
              ? '目标已达成'
              : running
                ? '暂停器械'
                : (phaseDevice.metrics.elapsedTime ?? 0) > 0
                  ? '继续'
                  : deviceConnected
                    ? '开始并启动器械'
                    : '请先连接器械'}
          </button>
          <button
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onContextMenu={(e) => e.preventDefault()}
            className="relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-radius-md border border-danger/40 bg-danger/10 px-3 py-3 font-semibold text-danger select-none transition-transform active:scale-[0.98]"
            style={{ touchAction: 'none' }}
          >
            {pressProgress > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-danger/20 transition-none"
                style={{ width: `${pressProgress}%` }}
              />
            )}
            <StopCircle size={18} className="relative z-10" />
            <span className="relative z-10">
              {pressProgress > 0 ? `长按结束 ${Math.ceil(pressProgress)}%` : '结束训练'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
