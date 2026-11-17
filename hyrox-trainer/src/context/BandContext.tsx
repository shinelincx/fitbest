import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { loadJSON, saveJSON } from '../utils/storage'
import {
  bandSerial, flushDeviceOutbox, getLastDeviceSync, pendingDeviceCount,
  subscribeToDeviceSync, syncDeviceSession, type DeviceSessionInput,
} from '../api/deviceSync'
import { accountStorageKey } from '../utils/sso'

// ---------- 类型 ----------

export interface BandBinding {
  serialNo: string
  name: string
  boundAt: string
}

export interface BandDevice {
  serialNo: string
  name: string
  rssi: number
  battery: number
  firmware: string
  model: string
}

export interface BandPendingSession {
  payload: DeviceSessionInput
  stagedAt: string
}

export type BandStage = 'idle' | 'scanning' | 'found' | 'connecting' | 'connected'

interface BandContextValue {
  stage: BandStage
  devices: BandDevice[]
  bindings: BandBinding[]
  connected: BandDevice | null
  pending: BandPendingSession[]
  lastSyncAt: string | null
  uploadPendingCount: number
  progress: number
  syncing: boolean
  nfcReading: boolean
  error: string | null
  scan: () => void
  connect: (serialNo: string) => Promise<void>
  disconnect: () => void
  bind: (serialNo: string) => void
  unbind: (serialNo: string) => void
  bindByNfc: () => Promise<void>
  syncNow: () => Promise<boolean>
  queueSession: (payload: DeviceSessionInput) => Promise<void>
  stageDemoSession: () => void
  clearError: () => void
  isBound: (serialNo: string) => boolean
}

const BandContext = createContext<BandContextValue | null>(null)

const BINDINGS_KEY = 'fitbest:band-bindings'
const PENDING_KEY = 'fitbest:band-pending'

// ---------- 模拟手环发现 ----------

function serialHash(serial: string): number {
  let h = 0
  for (let i = 0; i < serial.length; i += 1) {
    h = (h * 31 + serial.charCodeAt(i)) % 9973
  }
  return h
}

function buildDevice(serialNo: string, name: string, model: string): BandDevice {
  const h = serialHash(serialNo)
  return {
    serialNo,
    name,
    model,
    rssi: -35 - (h % 30),
    battery: 55 + (h % 45),
    firmware: `v1.2.${h % 5}`,
  }
}

/** 本机稳定生成的可发现手环：已绑定的手环排在第一位，另有一台可添加的新手环 */
function discoverable(bindings: BandBinding[]): BandDevice[] {
  const list: BandDevice[] = bindings.map((b, i) =>
    buildDevice(b.serialNo, b.name, i === 0 ? 'FITBEST Band Pro' : 'FITBEST Band'),
  )
  const seen = new Set(bindings.map((b) => b.serialNo))
  const primary = bandSerial()
  if (!seen.has(primary)) {
    list.push(buildDevice(primary, 'FITBEST Band Pro', 'FITBEST Band Pro'))
  }
  const airSerial = `BAND-AIR-${primary.slice(-4) || '0001'}`
  if (!seen.has(airSerial)) {
    list.push(buildDevice(airSerial, 'FITBEST Band Air', 'FITBEST Band Air'))
  }
  return list
}

function progressTo(durationMs: number, setter: (n: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    const timer = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((performance.now() - start) / durationMs) * 100))
      setter(pct)
      if (pct >= 100) {
        window.clearInterval(timer)
        resolve()
      }
    }, 50)
  })
}

// ---------- Provider ----------

export function BandProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const bindingsKey = accountStorageKey(BINDINGS_KEY, userId)
  const pendingKey = accountStorageKey(PENDING_KEY, userId)
  const [stage, setStage] = useState<BandStage>('idle')
  const [devices, setDevices] = useState<BandDevice[]>([])
  const [bindings, setBindings] = useState<BandBinding[]>(() =>
    loadJSON<BandBinding[]>(bindingsKey, []),
  )
  const [connected, setConnected] = useState<BandDevice | null>(null)
  const [pending, setPending] = useState<BandPendingSession[]>(() =>
    loadJSON<BandPendingSession[]>(pendingKey, []),
  )
  const lastSyncAt = useSyncExternalStore(subscribeToDeviceSync, () => getLastDeviceSync(userId))
  const uploadPendingCount = useSyncExternalStore(subscribeToDeviceSync, () => pendingDeviceCount(userId))
  const [progress, setProgress] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [nfcReading, setNfcReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 供异步回调读取最新值，避免闭包过期
  const bindingsRef = useRef(bindings)
  const connectedRef = useRef(connected)
  const pendingRef = useRef(pending)
  const syncingRef = useRef(false)

  const persistBindings = useCallback((next: BandBinding[]) => {
    bindingsRef.current = next
    setBindings(next)
    saveJSON(bindingsKey, next)
  }, [bindingsKey])

  const persistPending = useCallback((next: BandPendingSession[]) => {
    pendingRef.current = next
    setPending(next)
    saveJSON(pendingKey, next)
  }, [pendingKey])

  const isBoundSerial = useCallback(
    (serialNo: string) => bindingsRef.current.some((b) => b.serialNo === serialNo),
    [],
  )

  const scan = useCallback(() => {
    setError(null)
    setDevices([])
    setProgress(0)
    setStage('scanning')
    window.setTimeout(() => {
      setDevices(discoverable(bindingsRef.current))
      setStage('found')
    }, 1500)
  }, [])

  const connect = useCallback(
    async (serialNo: string) => {
      const dev =
        devices.find((d) => d.serialNo === serialNo) ??
        discoverable(bindingsRef.current).find((d) => d.serialNo === serialNo)
      if (!dev) {
        setError('附近没有发现这只手环，请重新搜索')
        return
      }
      setError(null)
      setStage('connecting')
      setProgress(0)
      await progressTo(1500, setProgress)
      connectedRef.current = dev
      setConnected(dev)
      setStage('connected')
    },
    [devices],
  )

  const disconnect = useCallback(() => {
    connectedRef.current = null
    setConnected(null)
    setStage(devices.length ? 'found' : 'idle')
    setProgress(0)
  }, [devices.length])

  const bind = useCallback(
    (serialNo: string) => {
      const dev =
        connectedRef.current?.serialNo === serialNo
          ? connectedRef.current
          : discoverable(bindingsRef.current).find((d) => d.serialNo === serialNo)
      if (!dev) return
      const existing = bindingsRef.current.find((b) => b.serialNo === serialNo)
      // 重复绑定保留最早绑定时间，保证「最早绑定优先」的排序稳定
      const binding: BandBinding = {
        serialNo,
        name: dev.name,
        boundAt: existing?.boundAt ?? new Date().toISOString(),
      }
      persistBindings([binding, ...bindingsRef.current.filter((b) => b.serialNo !== serialNo)])
      // 后续训练 payload 使用这只手环的序列号
      saveJSON('fitbest:band-serial', serialNo)
      setError(null)
    },
    [persistBindings],
  )

  const unbind = useCallback(
    (serialNo: string) => {
      persistBindings(bindingsRef.current.filter((b) => b.serialNo !== serialNo))
      if (connectedRef.current?.serialNo === serialNo) {
        connectedRef.current = null
        setConnected(null)
      }
      // 解除后不再有绑定手环，清掉本地手环待同步数据
      persistPending([])
    },
    [persistBindings, persistPending],
  )

  const bindByNfc = useCallback(async () => {
    const target = connectedRef.current ?? discoverable(bindingsRef.current)[0]
    if (!target) {
      setError('请先搜索并连接手环')
      return
    }
    setError(null)
    setNfcReading(true)
    await new Promise((r) => window.setTimeout(r, 1400))
    setNfcReading(false)
    bind(target.serialNo)
  }, [bind])

  const performSync = useCallback(async () => {
    const list = [...pendingRef.current]
    if (!list.length) return
    for (const entry of list) {
      await syncDeviceSession(entry.payload, userId)
    }
    persistPending(pendingRef.current.filter((entry) => !list.includes(entry)))
  }, [persistPending, userId])

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return false
    const dev = connectedRef.current
    if (!dev) {
      setError('请先连接手环')
      return false
    }
    if (!isBoundSerial(dev.serialNo)) {
      setError('请先绑定手环')
      return false
    }
    if (!userId) {
      setError('请先登录以同步当前账号的记录')
      return false
    }
    setError(null)
    syncingRef.current = true
    setSyncing(true)
    setProgress(0)
    try {
      const hadPending = pendingRef.current.length > 0 || pendingDeviceCount(userId) > 0
      await performSync()
      await flushDeviceOutbox()
      if (pendingDeviceCount(userId) > 0) {
        setError('数据仍待同步，请检查网络后重试')
        return false
      }
      setProgress(100)
      return hadPending
    } catch {
      setError('无法保存待同步数据，请重试')
      return false
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [isBoundSerial, performSync, userId])

  /** 训练结束时数据已在本机采集，直接进入网络补传队列。 */
  const queueSession = useCallback(
    async (payload: DeviceSessionInput) => {
      await syncDeviceSession(payload, userId)
    },
    [userId],
  )

  /**
   * 演示用：生成一场写在手环里的待同步训练（8 组 HYROX）。
   * quality=invalid 时后端只存手环数据、不写训练记录，避免污染真实统计。
   */
  const stageDemoSession = useCallback(() => {
    const serial = connectedRef.current?.serialNo ?? bandSerial()
    const startedAt = new Date(Date.now() - 26 * 60 * 1000)
    const segments: DeviceSessionInput['segments'] = []
    let seq = 1
    let cursor = 0
    const treadmillSec = [286, 292, 288, 295, 290, 300, 296, 305]
    const stationSec = [180, 210, 240, 195, 225, 200, 230, 215]
    for (let i = 0; i < 8; i += 1) {
      segments.push({
        seq: seq++,
        type: 'treadmill',
        machineType: 'treadmill',
        connectTick: cursor,
        disconnectTick: cursor + treadmillSec[i],
        durationSec: treadmillSec[i],
        distanceM: 1000,
        metrics: { speed: 12.4 + i * 0.1 },
      })
      cursor += treadmillSec[i]
      segments.push({
        seq: seq++,
        type: 'station',
        machineType: i % 2 === 0 ? 'rower' : 'rep',
        connectTick: cursor,
        disconnectTick: cursor + stationSec[i],
        durationSec: stationSec[i],
        distanceM: i % 2 === 0 ? 1000 : 0,
        metrics: { power: 170 + i * 5 },
      })
      cursor += stationSec[i]
    }
    segments.push({ seq: seq++, type: 'finish', durationSec: 0, distanceM: 0 })

    const payload: DeviceSessionInput = {
      clientSessionId: `band-demo-${Date.now()}`,
      device: { serialNo: serial, kind: 'band', label: 'FITBEST 手环' },
      app: 'hyrox',
      mode: 'training',
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: cursor,
      distanceM: 8000,
      avgHr: 152,
      maxHr: 176,
      metrics: { source: 'band-demo', demo: true },
      closeReason: 'finish',
      quality: 'invalid',
      segments,
    }
    persistPending([
      { payload, stagedAt: new Date().toISOString() },
      ...pendingRef.current,
    ])
  }, [persistPending])

  return (
    <BandContext.Provider
      value={{
        stage,
        devices,
        bindings,
        connected,
        pending,
        lastSyncAt,
        uploadPendingCount,
        progress,
        syncing,
        nfcReading,
        error,
        scan,
        connect,
        disconnect,
        bind,
        unbind,
        bindByNfc,
        syncNow,
        queueSession,
        stageDemoSession,
        clearError: () => setError(null),
        isBound: isBoundSerial,
      }}
    >
      {children}
    </BandContext.Provider>
  )
}

export function useBand() {
  const ctx = useContext(BandContext)
  if (!ctx) throw new Error('useBand must be used within BandProvider')
  return ctx
}
