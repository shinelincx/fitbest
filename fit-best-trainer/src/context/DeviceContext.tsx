import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import i18n from '../i18n'
import { Capacitor } from '@capacitor/core'
import BluetoothSearchDialog, { type BluetoothSearchRequest } from '../components/BluetoothSearchDialog'
import { identifyDevice } from '../ble/identify'
import { fetchMachineNavigation, matchBleRule, readMachineNavigation, type MachineNavigation } from '../api/machineNavigation'
import {
  parsePrivateTreadmillCountdown, parsePrivateTreadmillData, parsePrivateTreadmillLimits, privateTreadmillControl, privateTreadmillSetTargets,
  selectPrivateTreadmillCharacteristics, TREADMILL_INCLINE_RANGE_REQUEST, TREADMILL_SPEED_RANGE_REQUEST,
  TREADMILL_TELEMETRY_REQUEST, type TreadmillLimits,
} from '../ble/privateTreadmill'
import { parseFtmsTreadmillRange, sendFtmsControl } from '../ble/ftmsControl'
import { bleAdapter, type BleCharacteristic, type BleConnection, type BleDeviceRef } from '../platform/ble'
import { normalizeUuid } from '../platform/ble/uuid'
import { NATIVE_FOREGROUND_EVENT } from '../platform/runtime'
import {
  parseHeartRateData,
  parseIndoorBikeData,
  parseRowerData,
  parseTreadmillData,
  type DeviceMetrics,
} from '../ble/ftms'
export type { DeviceMetrics } from '../ble/ftms'
import {
  ThinkFitConsole,
  TF_SERVICE,
  TF_NOTIFY,
  TF_WRITE,
  type TfDeviceInfo,
  type TfProgramSegment,
} from '../ble/thinkfit'

// 器械类型
export type DeviceType =
  | 'treadmill'
  | 'rower'
  | 'ski'
  | 'bike'
  | 'spin'
  | 'elliptical'
  | 'upright'
  | 'stair'
  | 'sled'
  | 'rep'
  | 'heartRate'

export type ConnectStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'failed'

export interface DeviceState {
  type: DeviceType
  name: string
  status: ConnectStatus
  connected: boolean
  metrics: DeviceMetrics
  treadmillLimits?: TreadmillLimits
  treadmillProtocol?: 'private' | 'ftms'
  running: boolean // 器械是否已启动（开始训练）
}

export interface FoundDevice {
  id: string
  name: string
}

interface GattRef {
  connection?: BleConnection
  controlPoint?: BleCharacteristic
  unsubscribeData?: () => void
  console?: ThinkFitConsole
  privateTreadmill?: ThinkFitConsole
  treadmillLimits?: TreadmillLimits
}

/** ThinkFit 车表状态（FFF0 私有协议） */
export interface ConsoleState {
  ready: boolean
  busy: boolean
  info: TfDeviceInfo | null
  bleName: string | null
  cache: number[] | null
  error: string | null
}

interface DeviceContextValue {
  machineNavigation: MachineNavigation | null
  devices: Record<DeviceType, DeviceState>
  supported: boolean
  /** 打开系统蓝牙选择器并连接该类型设备 */
  scanDevices: (type: DeviceType) => void
  /** 全局搜索：不预选类型，选中后自动识别器械类型 */
  allFound: FoundDevice[]
  allScanning: boolean
  allError: string | null
  scanAllDevices: (acceptAll?: boolean) => Promise<DeviceType | null>
  connectDevice: (type: DeviceType, deviceId?: string, namePrefix?: string) => Promise<void>
  disconnectDevice: (type: DeviceType) => void
  startDevice: (type: DeviceType, reset?: boolean) => Promise<void>
  stopDevice: (type: DeviceType, pause?: boolean) => Promise<void>
  setTreadmillTargets: (speed: number, incline: number) => Promise<void>
  setFtmsTreadmillTarget: (field: 'speed' | 'incline', value: number) => Promise<void>
  resetAllDevices: () => void
  /** ThinkFit 车表（FFF0 协议）状态与操作 */
  consoles: Partial<Record<DeviceType, ConsoleState>>
  consoleRead: (type: DeviceType) => Promise<void>
  consoleRename: (type: DeviceType, name: string) => Promise<boolean>
  consoleSetConfig: (type: DeviceType, info: TfDeviceInfo) => Promise<void>
  consoleSetProgram: (type: DeviceType, programId: number, segments: TfProgramSegment[]) => Promise<void>
  consoleLcdTest: (type: DeviceType, mode: 'all' | 'leak') => Promise<void>
  consoleDisableSleep: (type: DeviceType) => Promise<void>
  consoleNudgeMotor: (type: DeviceType, direction: 'left' | 'right') => Promise<void>
  consoleReadCache: (type: DeviceType) => Promise<void>
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

// FTMS BLE UUID
const FTMS_SERVICE = '1826'
const TREADMILL_DATA = '2acd'
const CROSS_TRAINER_DATA = '2ace'
const STAIR_CLIMBER_DATA = '2ad0'
const ROWER_DATA = '2ad1'
const INDOOR_BIKE_DATA = '2ad2'
const CONTROL_POINT = '2ad9' // Fitness Machine Control Point
const HEART_RATE_SERVICE = '180d'
const HEART_RATE_MEASUREMENT = '2a37'

// FTMS Control Point opcodes
const CP_REQUEST_CONTROL = 0x00
const CP_RESET = 0x01
const CP_START = 0x07
const CP_STOP = 0x08

const DEFAULT_NAMES: Record<DeviceType, string> = {
  treadmill: '智能跑步机',
  rower: '智能划船机',
  ski: '智能滑雪机',
  bike: '智能风扇车',
  spin: '智能动感单车',
  elliptical: '智能椭圆机',
  upright: '智能健身车',
  stair: '智能楼梯机',
  sled: '智能雪橇',
  rep: '智能计数传感器',
  heartRate: '智能心率带',
}

function initialDevices(): Record<DeviceType, DeviceState> {
  const all = Object.keys(DEFAULT_NAMES) as DeviceType[]
  return all.reduce((acc, type) => {
    acc[type] = {
      type,
      name: i18n.t(DEFAULT_NAMES[type]),
      status: 'idle',
      connected: false,
      metrics: {},
      running: false,
    }
    return acc
  }, {} as Record<DeviceType, DeviceState>)
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [machineNavigation, setMachineNavigation] = useState(readMachineNavigation)
  const navigationRef = useRef(machineNavigation)
  const refreshNavigation = useCallback(async () => {
    try {
      const config = await fetchMachineNavigation()
      navigationRef.current = config
      setMachineNavigation(config)
      return config
    } catch (error) {
      console.warn('器械导航配置读取失败：', error)
      return navigationRef.current
    }
  }, [])
  useEffect(() => { void refreshNavigation() }, [refreshNavigation])
  const [devices, setDevices] = useState<Record<DeviceType, DeviceState>>(initialDevices)
  const gattRefs = useRef<Record<string, GattRef>>({})
  const treadmillSteps = useRef<{ time: number; count: number } | null>(null)

  const supported = bleAdapter.isSupported()

  const updateMetrics = useCallback((type: DeviceType, patch: Partial<DeviceMetrics>) => {
    if (type === 'treadmill' && patch.elapsedTime !== undefined && patch.strokeCount !== undefined) {
      const next = { time: patch.elapsedTime, count: patch.strokeCount }
      const previous = treadmillSteps.current
      if (!previous || next.time < previous.time || next.count < previous.count) {
        treadmillSteps.current = next
        patch = { ...patch, cadence: undefined }
      } else if (next.time - previous.time >= 2) {
        treadmillSteps.current = next
        patch = { ...patch, cadence: Math.round((next.count - previous.count) * 60 / (next.time - previous.time)) }
      }
    }
    setDevices((prev) => ({
      ...prev,
      [type]: { ...prev[type], metrics: { ...prev[type].metrics, ...patch } },
    }))
  }, [])

  const setStatus = useCallback((type: DeviceType, status: ConnectStatus) => {
    setDevices((prev) => ({
      ...prev,
      [type]: { ...prev[type], status, connected: status === 'connected' },
    }))
  }, [])

  const disconnectDevice = useCallback((type: DeviceType) => {
    if (type === 'treadmill') treadmillSteps.current = null
    const id = String(type)
    const gatt = gattRefs.current[id]
    if (gatt?.console) {
      try { gatt.console.dispose() } catch { /* ignore */ }
    }
    if (gatt?.unsubscribeData) {
      try { gatt.unsubscribeData() } catch { /* ignore */ }
    }
    delete gattRefs.current[id]
    if (gatt?.connection) void gatt.connection.disconnect().catch(() => undefined)
    setConsoles((prev) => {
      if (!prev[type]) return prev
      const next = { ...prev }
      delete next[type]
      return next
    })
    setDevices((prev) => ({
      ...prev,
      [type]: { ...prev[type], status: 'idle', connected: false, metrics: {}, treadmillLimits: undefined, treadmillProtocol: undefined, running: false, name: i18n.t(DEFAULT_NAMES[type]) },
    }))
  }, [])

  useEffect(() => {
    const checkConnections = () => {
      Object.entries(gattRefs.current).forEach(([id, gatt]) => {
        if (!gatt.connection) return
        void gatt.connection.isConnected().then((connected) => {
          if (!connected && gattRefs.current[id] === gatt) disconnectDevice(id as DeviceType)
        })
      })
    }
    window.addEventListener(NATIVE_FOREGROUND_EVENT, checkConnections)
    return () => window.removeEventListener(NATIVE_FOREGROUND_EVENT, checkConnections)
  }, [disconnectDevice])

  // ===== 全局搜索（真实蓝牙设备选择器）=====
  const [allFound, setAllFound] = useState<FoundDevice[]>([])
  const [allScanning, setAllScanning] = useState(false)
  const [allError, setAllError] = useState<string | null>(null)

  // ===== ThinkFit 车表（FFF0 私有协议）=====
  const [consoles, setConsoles] = useState<Partial<Record<DeviceType, ConsoleState>>>({})

  const patchConsole = useCallback((type: DeviceType, patch: Partial<ConsoleState>) => {
    setConsoles((prev) => ({
      ...prev,
      [type]: {
        ready: true,
        busy: false,
        info: null,
        bleName: null,
        cache: null,
        error: null,
        ...prev[type],
        ...patch,
      },
    }))
  }, [])

  const refreshConsoleInfo = useCallback(
    async (type: DeviceType) => {
      const client = gattRefs.current[String(type)]?.console
      if (!client) return
      patchConsole(type, { busy: true, error: null })
      try {
        const [info, bleName] = await Promise.all([client.getDeviceInfo(), client.getBleName()])
        patchConsole(type, { info, bleName, error: null })
      } catch (e) {
        patchConsole(type, { error: e instanceof Error ? e.message : i18n.t('读取车表信息失败') })
      } finally {
        patchConsole(type, { busy: false })
      }
    },
    [patchConsole],
  )

  /** 统一的车表指令执行：处理忙碌态与错误提示 */
  const runConsole = useCallback(
    async <T,>(type: DeviceType, task: (client: ThinkFitConsole) => Promise<T>): Promise<T | undefined> => {
      const client = gattRefs.current[String(type)]?.console
      if (!client) {
        patchConsole(type, { error: i18n.t('未连接 ThinkFit 车表') })
        return undefined
      }
      patchConsole(type, { busy: true, error: null })
      try {
        return await task(client)
      } catch (e) {
        patchConsole(type, { error: e instanceof Error ? e.message : i18n.t('车表指令执行失败') })
        return undefined
      } finally {
        patchConsole(type, { busy: false })
      }
    },
    [patchConsole],
  )

  const consoleRead = useCallback(
    async (type: DeviceType) => {
      await refreshConsoleInfo(type)
    },
    [refreshConsoleInfo],
  )

  const consoleRename = useCallback(
    async (type: DeviceType, name: string) => {
      const ok = await runConsole(type, (c) => c.setBleName(name))
      if (ok) patchConsole(type, { bleName: name })
      return ok ?? false
    },
    [runConsole, patchConsole],
  )

  const consoleSetConfig = useCallback(
    async (type: DeviceType, info: TfDeviceInfo) => {
      await runConsole(type, async (c) => {
        await c.setDeviceInfo(info)
        patchConsole(type, { info })
      })
    },
    [runConsole, patchConsole],
  )

  const consoleSetProgram = useCallback(
    async (type: DeviceType, programId: number, segments: TfProgramSegment[]) => {
      await runConsole(type, (c) => c.setProgram(programId, segments))
    },
    [runConsole],
  )

  const consoleLcdTest = useCallback(
    async (type: DeviceType, mode: 'all' | 'leak') => {
      await runConsole(type, (c) => c.lcdTest(mode))
    },
    [runConsole],
  )

  const consoleDisableSleep = useCallback(
    async (type: DeviceType) => {
      await runConsole(type, (c) => c.disableSleep())
    },
    [runConsole],
  )

  const consoleNudgeMotor = useCallback(
    async (type: DeviceType, direction: 'left' | 'right') => {
      await runConsole(type, (c) => c.nudgeMotor(direction))
    },
    [runConsole],
  )

  const consoleReadCache = useCallback(
    async (type: DeviceType) => {
      const cache = await runConsole(type, (c) => c.readHistoryCache())
      if (cache) patchConsole(type, { cache })
    },
    [runConsole, patchConsole],
  )

  const [searchRequest, setSearchRequest] = useState<BluetoothSearchRequest | null>(null)
  const pendingSearch = useRef(false)

  // Web Bluetooth 需要用户手势；原生端用应用内列表展示扫描结果。
  const pickDevice = useCallback(
    async (type: DeviceType | 'all', namePrefix?: string, acceptAll = false): Promise<BleDeviceRef | null> => {
      void refreshNavigation()
      if (!supported) {
        if (type !== 'all') setStatus(type, 'failed')
        return null
      }
      if (Capacitor.isNativePlatform()) {
        if (pendingSearch.current) return null
        pendingSearch.current = true
        return new Promise<BleDeviceRef | null>((resolve, reject) => {
          setSearchRequest({
            matches: (device, services) => {
              const name = device.name ?? ''
              const advertised = services.map(normalizeUuid)
              if (type === 'heartRate') return advertised.includes(normalizeUuid(HEART_RATE_SERVICE))
              const kind = matchBleRule(navigationRef.current, name)?.machineType ?? identifyDevice(name)
              if (type === 'all') return kind !== null && kind !== 'pin'
              return kind === type || Boolean(namePrefix && name.startsWith(namePrefix)) ||
                (!kind && ((type === 'treadmill' && Boolean(name)) ||
                  advertised.includes(normalizeUuid(FTMS_SERVICE)) || advertised.includes(normalizeUuid(TF_SERVICE))))
            },
            finish: (device, error) => {
              pendingSearch.current = false
              setSearchRequest(null)
              if (error) reject(error)
              else resolve(device)
            },
          })
        })
      }
      if (type === 'heartRate') {
        return bleAdapter.requestDevice({
          services: [HEART_RATE_SERVICE],
          optionalServices: [HEART_RATE_SERVICE],
          namePrefix,
        })
      }
      if (acceptAll || (type === 'treadmill' && !namePrefix)) {
        // 兜底：不按广播过滤，列出附近全部 BLE 设备（部分固件不广播服务 UUID）
        return bleAdapter.requestDevice({
          services: [],
          optionalServices: [FTMS_SERVICE, TF_SERVICE, HEART_RATE_SERVICE],
          acceptAll: true,
        })
      }
      return bleAdapter.requestDevice({
        services: [FTMS_SERVICE, TF_SERVICE],
        optionalServices: [FTMS_SERVICE, TF_SERVICE, HEART_RATE_SERVICE],
        namePrefix,
      })
    },
    [supported, setStatus, refreshNavigation],
  )

  // 绑定已选中的设备：订阅真实通知、建立连接引用
  const attachDevice = useCallback(
    async (type: DeviceType, device: BleDeviceRef) => {
      setStatus(type, 'connecting')
      let connection: BleConnection | undefined
      let consoleClient: ThinkFitConsole | undefined
      let unsubscribeData: (() => void) | undefined
      let readsPrivateTelemetry = false
      const treadmillLimits: TreadmillLimits = {}
      let useWriteResponse = false
      let supportsConsoleConfiguration = true
      try {
        connection = await bleAdapter.connect(device, () => disconnectDevice(type))

        // 心率带走 Heart Rate Service
        if (type === 'heartRate') {
          const hrChar = await connection.getCharacteristic(HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT)
          unsubscribeData = await hrChar.startNotifications((bytes) => {
            updateMetrics('heartRate', parseHeartRateData(bytes))
          })
          gattRefs.current[String(type)] = { connection, unsubscribeData }
          setDevices((prev) => ({
            ...prev,
            [type]: { ...prev[type], status: 'connected', connected: true, name: device.name || prev[type].name },
          }))
          return
        }

        // 旧版跑步机按特征属性发现私有协议通道。
        try {
          const pair = type === 'treadmill'
            ? selectPrivateTreadmillCharacteristics(await connection.listCharacteristics(TF_SERVICE))
            : null
          if (type === 'treadmill' && !pair) throw new Error('Private treadmill characteristics unavailable')
          if (pair) {
            supportsConsoleConfiguration = normalizeUuid(pair.notify.uuid) === normalizeUuid(TF_NOTIFY) &&
              normalizeUuid(pair.write.uuid) === normalizeUuid(TF_WRITE)
          }
          const notifyChar = await connection.getCharacteristic(TF_SERVICE, pair?.notify.uuid ?? TF_NOTIFY)
          const writeChar = await connection.getCharacteristic(TF_SERVICE, pair?.write.uuid ?? TF_WRITE)
          useWriteResponse = Boolean(pair?.write.properties.write && !pair.write.properties.writeWithoutResponse)
          consoleClient = new ThinkFitConsole({
            subscribe: (listener) => notifyChar.startNotifications((bytes) => {
              if (readsPrivateTelemetry) {
                const metrics = parsePrivateTreadmillData(bytes)
                if (bytes[0] === 0x02 && bytes[1] === 0x51) updateMetrics(type, {
                  ...metrics,
                  privateTreadmillActive: Boolean(metrics && bytes[2] === 0x03),
                  privateTreadmillCountdown: parsePrivateTreadmillCountdown(bytes),
                })
                const limits = parsePrivateTreadmillLimits(bytes)
                if (limits) {
                  Object.assign(treadmillLimits, limits)
                  setDevices((previous) => ({
                    ...previous,
                    treadmill: { ...previous.treadmill, treadmillLimits: { ...treadmillLimits } },
                  }))
                }
              }
              listener(bytes)
            }),
            writeWithoutResponse: async (bytes) => {
              if (bytes !== TREADMILL_TELEMETRY_REQUEST || !writeChar.writeWithResponse) {
                if (readsPrivateTelemetry && useWriteResponse && writeChar.writeWithResponse) {
                  return writeChar.writeWithResponse(bytes)
                }
                return writeChar.writeWithoutResponse(bytes)
              }
              if (!useWriteResponse) {
                try {
                  return await writeChar.writeWithoutResponse(bytes)
                } catch {
                  useWriteResponse = true
                }
              }
              return writeChar.writeWithResponse(bytes)
            },
          })
        } catch {
          // 非 ThinkFit 车表，继续走标准 FTMS
        }

        const config = navigationRef.current ?? await refreshNavigation()
        const preference = matchBleRule(config, device.name ?? '', type)?.preferredProtocol
        const usePrivateFirst = type === 'treadmill' && preference === 'PRIVATE'
        if (usePrivateFirst && consoleClient) {
          readsPrivateTelemetry = true
          try {
            await consoleClient.send(TREADMILL_TELEMETRY_REQUEST)
          } catch (error) {
            readsPrivateTelemetry = false
            console.warn('首选私有通道不可用，尝试 FTMS：', error)
          }
        }
        // 2) 标准 FTMS 实时数据
        let controlPoint: BleCharacteristic | undefined
        try {
          const charMap: Record<DeviceType, string> = {
            treadmill: TREADMILL_DATA,
            rower: ROWER_DATA,
            ski: ROWER_DATA,
            bike: INDOOR_BIKE_DATA,
            spin: INDOOR_BIKE_DATA,
            upright: INDOOR_BIKE_DATA,
            elliptical: CROSS_TRAINER_DATA,
            stair: STAIR_CLIMBER_DATA,
            sled: ROWER_DATA,
            rep: ROWER_DATA,
            heartRate: ROWER_DATA, // 不会走到这里
          }
          if (!readsPrivateTelemetry && connection.hasService(FTMS_SERVICE)) {
            const dataChar = await connection.getCharacteristic(FTMS_SERVICE, charMap[type])
            unsubscribeData = await dataChar.startNotifications((bytes) => {
              const parsed = type === 'treadmill'
                ? parseTreadmillData(bytes)
                : type === 'bike' || type === 'spin' || type === 'upright'
                  ? parseIndoorBikeData(bytes)
                  : parseRowerData(bytes)
              updateMetrics(type, parsed)
            })
            try {
              controlPoint = await connection.getCharacteristic(FTMS_SERVICE, CONTROL_POINT)
            } catch {
              // 部分器械不暴露 Control Point，降级为仅读取数据
            }
          }
        } catch {
          // 没有可订阅的 FTMS 数据特征时，检查私有通道。
        }
        if (!unsubscribeData) {
          // 无 FTMS：ThinkFit 车表仅提供配置能力时也能保持连接
          if (!consoleClient || type === 'ski') {
            throw new Error('未找到可用的器械服务')
          }
          if (type === 'treadmill') {
            const client = consoleClient
            if (!readsPrivateTelemetry) {
              if (usePrivateFirst) throw new Error('未找到可用的跑步机数据通道')
              readsPrivateTelemetry = true
              await client.send(TREADMILL_TELEMETRY_REQUEST)
            }
            let pending = false
            let tick = 0
            const timer = window.setInterval(() => {
              if (pending) return
              pending = true
              tick += 1
              const request = tick % 8 === 1 && !treadmillLimits.speed ? TREADMILL_SPEED_RANGE_REQUEST
                : tick % 8 === 3 && !treadmillLimits.incline ? TREADMILL_INCLINE_RANGE_REQUEST
                  : TREADMILL_TELEMETRY_REQUEST
              void client.send(request).catch((error) => {
                console.warn('跑步机数据读取失败：', error)
              }).finally(() => { pending = false })
            }, 250)
            unsubscribeData = () => {
              readsPrivateTelemetry = false
              window.clearInterval(timer)
            }
          }
        }

        if (type === 'treadmill' && controlPoint && connection.hasService(FTMS_SERVICE)) {
          for (const [field, uuid] of [['speed', '2ad4'], ['incline', '2ad5']] as const) {
            try {
              const characteristic = await connection.getCharacteristic(FTMS_SERVICE, uuid)
              const range = parseFtmsTreadmillRange(await characteristic.read?.(), field)
              if (range) treadmillLimits[field] = range
            } catch {
              // 缺少范围时不发送该项调节指令。
            }
          }
        }
        gattRefs.current[String(type)] = {
          connection, controlPoint, unsubscribeData, console: consoleClient,
          privateTreadmill: readsPrivateTelemetry ? consoleClient : undefined,
          treadmillLimits: type === 'treadmill' ? treadmillLimits : undefined,
        }
        setDevices((prev) => ({
          ...prev,
          [type]: { ...prev[type], status: 'connected', connected: true, name: device.name || prev[type].name,
            treadmillLimits: type === 'treadmill' ? { ...treadmillLimits } : undefined,
            treadmillProtocol: type === 'treadmill' ? (readsPrivateTelemetry ? 'private' : 'ftms') : undefined },
        }))

        if (consoleClient && supportsConsoleConfiguration) {
          setConsoles((prev) => ({ ...prev, [type]: { ready: true, busy: true, info: null, bleName: null, cache: null, error: null } }))
          void refreshConsoleInfo(type)
        }
      } catch (err) {
        if (consoleClient) consoleClient.dispose()
        if (unsubscribeData) unsubscribeData()
        if (connection) void connection.disconnect().catch(() => undefined)
        console.warn('设备连接失败：', err)
        setStatus(type, 'failed')
        throw err
      }
    },
    [updateMetrics, setStatus, disconnectDevice, refreshConsoleInfo, refreshNavigation],
  )

  // 连接设备：弹出系统选择器 → 绑定所选设备
  const connectDevice = useCallback(
    async (type: DeviceType, _deviceId?: string, namePrefix?: string) => {
      try {
        const device = await pickDevice(type, namePrefix)
        if (!device) return
        await attachDevice(type, device)
      } catch (error) {
        if (!(error instanceof Error && error.name === 'NotFoundError')) setStatus(type, 'failed')
      }
    },
    [pickDevice, attachDevice, setStatus],
  )

  // 搜索即连接：系统设备选择器本身就是搜索结果
  const scanDevices = useCallback(
    (type: DeviceType) => {
      void connectDevice(type)
    },
    [connectDevice],
  )

  // 全局搜索：不预选类型，按广播名自动识别器械类型
  const scanAllDevices = useCallback(async (acceptAll = false): Promise<DeviceType | null> => {
    setAllScanning(true)
    setAllError(null)
    setAllFound([])
    let device: BleDeviceRef | null = null
    try {
      device = await pickDevice('all', undefined, acceptAll)
    } catch (e) {
      setAllScanning(false)
      if (e instanceof Error && e.name === 'NotFoundError') {
        setAllError(i18n.t('未选择设备或已取消'))
      } else {
        const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
        setAllError(i18n.t('搜索失败：{{msg}}', { msg }))
        console.warn('BLE 搜索失败：', e)
      }
      return null
    }
    if (!device) {
      setAllScanning(false)
      if (!supported) setAllError(i18n.t('当前浏览器不支持蓝牙'))
      return null
    }
    const name = device.name || ''
    const config = navigationRef.current ?? await refreshNavigation()
    const kind = matchBleRule(config, name)?.machineType ?? identifyDevice(name)
    if (!kind || kind === 'pin') {
      setAllError(i18n.t('无法识别的设备，请到智能器械页选择类型后连接'))
      setAllScanning(false)
      return null
    }
    try {
      await attachDevice(kind, device)
      setAllFound([{ id: device.id, name }])
      return kind
    } catch (e) {
      const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
      setAllError(i18n.t('连接失败：{{msg}}', { msg }))
      console.warn('器械连接失败：', e)
      return null
    } finally {
      setAllScanning(false)
    }
  }, [pickDevice, attachDevice, supported, refreshNavigation])

  // 启动器械（reset=true 归零后启动；reset=false 暂停恢复）。心率带无需启停，连接后持续推送
  const startDevice = useCallback(
    async (type: DeviceType, reset = false) => {
      if (type === 'heartRate') return
      const gatt = gattRefs.current[String(type)]
      if (type === 'treadmill') {
        if (gatt?.privateTreadmill) {
          await gatt.privateTreadmill.send(privateTreadmillControl(reset ? 'start' : 'resume'))
        } else if (gatt?.controlPoint) {
          await sendFtmsControl(gatt.controlPoint, [[CP_REQUEST_CONTROL], [CP_START]])
        } else {
          throw new Error('Treadmill control unavailable')
        }
      } else if (gatt?.controlPoint) {
        try {
          await gatt.controlPoint.writeWithoutResponse(new Uint8Array([CP_REQUEST_CONTROL]))
          if (reset) {
            await gatt.controlPoint.writeWithoutResponse(new Uint8Array([CP_RESET]))
          }
          await gatt.controlPoint.writeWithoutResponse(new Uint8Array([CP_START]))
        } catch (e) {
          console.warn('控制指令写入失败，仍以设备数据为准：', e)
        }
      }
      setDevices((prev) => ({
        ...prev,
        [type]: {
          ...prev[type],
          running: true,
          metrics: reset ? { privateTreadmillCountdown: prev[type].metrics.privateTreadmillCountdown } : prev[type].metrics,
        },
      }))
    },
    [],
  )

  // 停止器械
  const setTreadmillTargets = useCallback(async (speed: number, incline: number) => {
    const gatt = gattRefs.current.treadmill
    const speedRange = gatt?.treadmillLimits?.speed
    const inclineRange = gatt?.treadmillLimits?.incline
    if (!gatt?.privateTreadmill || !speedRange || !inclineRange || !Number.isFinite(speed) ||
      !Number.isInteger(incline) || speed < speedRange.min || speed > speedRange.max ||
      incline < inclineRange.min || incline > inclineRange.max) {
      throw new Error('Treadmill targets unavailable or outside device limits')
    }
    await gatt.privateTreadmill.send(privateTreadmillSetTargets(speed, incline))
  }, [])

  const setFtmsTreadmillTarget = useCallback(async (field: 'speed' | 'incline', value: number) => {
    const gatt = gattRefs.current.treadmill
    const range = gatt?.treadmillLimits?.[field]
    if (!gatt?.controlPoint || !range || !Number.isFinite(value) || value < range.min - 1e-6 || value > range.max + 1e-6) {
      throw new Error('FTMS target unavailable or outside device limits')
    }
    const target = Math.round(value * (field === 'speed' ? 100 : 10))
    await sendFtmsControl(gatt.controlPoint, [[field === 'speed' ? 0x02 : 0x03, target & 0xff, (target >> 8) & 0xff]])
  }, [])

  const stopDevice = useCallback(
    async (type: DeviceType, pause = false) => {
      if (type === 'heartRate') return
      const gatt = gattRefs.current[String(type)]
      if (type === 'treadmill') {
        if (gatt?.privateTreadmill) {
          await gatt.privateTreadmill.send(privateTreadmillControl(pause ? 'pause' : 'stop'))
        } else if (gatt?.controlPoint) {
          await sendFtmsControl(gatt.controlPoint, [[CP_STOP, pause ? 0x02 : 0x01]])
        } else {
          throw new Error('Treadmill control unavailable')
        }
      } else if (gatt?.controlPoint) {
        try {
          await gatt.controlPoint.writeWithoutResponse(new Uint8Array([CP_STOP]))
        } catch { /* ignore */ }
      }
      setDevices((prev) => ({ ...prev, [type]: { ...prev[type], running: false } }))
    },
    [],
  )

  // 重置所有器械：停止运行 + 清空累计数据（保留连接状态，不影响心率带）
  const resetAllDevices = useCallback(() => {
    const allTypes = (Object.keys(DEFAULT_NAMES) as DeviceType[]).filter((t) => t !== 'heartRate')
    allTypes.forEach((type) => {
      const id = String(type)
      // 向真实器械发送 STOP
      const gatt = gattRefs.current[id]
      if (gatt?.controlPoint) {
        void gatt.controlPoint.writeWithoutResponse(new Uint8Array([CP_STOP])).catch(() => undefined)
      }
    })
    // 清空所有器械的 metrics 与 running 状态（心率带数据保留）
    setDevices((prev) => {
      const next = { ...prev }
      allTypes.forEach((type) => {
        next[type] = { ...next[type], metrics: {}, running: false }
      })
      return next
    })
  }, [])

  return (
    <DeviceContext.Provider
      value={{
        devices,
        machineNavigation,
        supported,
        scanDevices,
        allFound,
        allScanning,
        allError,
        scanAllDevices,
        connectDevice,
        disconnectDevice,
        startDevice,
        stopDevice,
        setTreadmillTargets,
        setFtmsTreadmillTarget,
        resetAllDevices,
        consoles,
        consoleRead,
        consoleRename,
        consoleSetConfig,
        consoleSetProgram,
        consoleLcdTest,
        consoleDisableSleep,
        consoleNudgeMotor,
        consoleReadCache,
      }}
    >
      {children}
      {searchRequest && <BluetoothSearchDialog request={searchRequest} />}
    </DeviceContext.Provider>
  )
}

export function useDevices() {
  const ctx = useContext(DeviceContext)
  if (!ctx) throw new Error('useDevices must be used within DeviceProvider')
  return ctx
}
