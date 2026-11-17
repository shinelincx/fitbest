import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import {
  FTMS_SERVICE, CONTROL_POINT, HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT,
  ftmsMeasurement, parseHeartRateData, startFtms, stopFtms, type DeviceMetrics, type DeviceType,
} from '../../../race-trainer-shared/ftms'

export type { DeviceMetrics, DeviceType } from '../../../race-trainer-shared/ftms'

export type ConnectStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export interface DeviceState {
  type: DeviceType
  name: string
  status: ConnectStatus
  connected: boolean
  metrics: DeviceMetrics
  running: boolean
  error?: string
}

const names: Record<DeviceType, string> = {
  treadmill: '智能跑步机',
  rower: '智能划船机',
  ski: '智能滑雪机',
  bike: '智能风扇车',
  sled: '智能雪橇',
  rep: '智能计数传感器',
  heartRate: '智能心率带',
}

const types = Object.keys(names) as DeviceType[]

function idle(type: DeviceType): DeviceState {
  return { type, name: names[type], status: 'idle', connected: false, metrics: {}, running: false }
}

interface Connection {
  server?: BluetoothRemoteGATTServer
  control?: BluetoothRemoteGATTCharacteristic
  release?: () => void
  collect: boolean
  mayBeRunning?: boolean
  starting?: Promise<boolean>
  stopping?: Promise<boolean>
}

interface DeviceContextValue {
  devices: Record<DeviceType, DeviceState>
  supported: boolean
  connectDevice: (type: DeviceType) => Promise<void>
  disconnectDevice: (type: DeviceType) => void
  startDevice: (type: DeviceType, reset?: boolean) => Promise<boolean>
  stopDevice: (type: DeviceType) => Promise<boolean>
  resetAllDevices: () => void
}

const DeviceContext = createContext<DeviceContextValue | null>(null)

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState(() =>
    Object.fromEntries(types.map((type) => [type, idle(type)])) as Record<DeviceType, DeviceState>,
  )
  const connections = useRef<Partial<Record<DeviceType, Connection>>>({})
  const supported = typeof navigator !== 'undefined' && Boolean(navigator.bluetooth?.requestDevice)

  const update = useCallback((type: DeviceType, patch: Partial<DeviceState>) => {
    setDevices((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }, [])

  const disconnectDevice = useCallback((type: DeviceType) => {
    const connection = connections.current[type]
    delete connections.current[type]
    connection?.release?.()
    if (connection?.server?.connected) connection.server.disconnect()
    update(type, idle(type))
  }, [update])

  const connectDevice = useCallback(async (type: DeviceType) => {
    if (connections.current[type]) return
    if (!supported) {
      update(type, { ...idle(type), status: 'failed', error: '当前浏览器不支持蓝牙连接' })
      return
    }

    const connection: Connection = { collect: type === 'heartRate' }
    connections.current[type] = connection
    update(type, { ...idle(type), status: 'connecting' })
    try {
      const measurement = type === 'heartRate'
        ? { uuid: HEART_RATE_MEASUREMENT, parse: parseHeartRateData }
        : ftmsMeasurement(type)
      const serviceId = type === 'heartRate' ? HEART_RATE_SERVICE : FTMS_SERVICE
      const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [serviceId] }] })
      if (!device.gatt) throw new Error('GATT 不可用')
      connection.server = await device.gatt.connect()
      const service = await connection.server.getPrimaryService(serviceId)
      const characteristic = await service.getCharacteristic(measurement.uuid)
      const notify = () => {
        if (connections.current[type] !== connection || !connection.collect || !characteristic.value) return
        try {
          const patch = measurement.parse(characteristic.value)
          setDevices((prev) => ({ ...prev, [type]: { ...prev[type], metrics: { ...prev[type].metrics, ...patch } } }))
        } catch (error) {
          if (!(error instanceof RangeError)) console.warn('读取蓝牙训练数据失败', error)
        }
      }
      const disconnected = () => {
        if (connections.current[type] !== connection) return
        delete connections.current[type]
        connection.release?.()
        update(type, { status: 'failed', connected: false, running: false, error: '器械已断开，请重新连接' })
      }
      device.addEventListener('gattserverdisconnected', disconnected)
      characteristic.addEventListener('characteristicvaluechanged', notify)
      connection.release = () => {
        device.removeEventListener('gattserverdisconnected', disconnected)
        characteristic.removeEventListener('characteristicvaluechanged', notify)
      }
      await characteristic.startNotifications()
      if (type !== 'heartRate') {
        try {
          const control = await service.getCharacteristic(CONTROL_POINT)
          await control.startNotifications()
          connection.control = control
        } catch { /* read-only connection */ }
      }
      if (connections.current[type] !== connection) return
      update(type, { status: 'connected', connected: true, name: device.name || names[type] })
    } catch {
      if (connections.current[type] !== connection) return
      disconnectDevice(type)
      update(type, { status: 'failed', error: '器械连接失败，请重试' })
    }
  }, [disconnectDevice, supported, update])

  const startDevice = useCallback((type: DeviceType, reset = false): Promise<boolean> => {
    const connection = connections.current[type]
    if (!connection?.server?.connected || type === 'heartRate' || connection.stopping) return Promise.resolve(false)
    if (connection.starting) return connection.starting
    if (connection.collect) return Promise.resolve(true)
    update(type, { error: undefined, ...(reset ? { metrics: {} } : {}) })
    const job = Promise.resolve().then(async () => {
      try {
        if (connection.control) {
          connection.mayBeRunning = true
          await startFtms(connection.control, reset)
        }
      } catch {
        if (connections.current[type] === connection) {
          update(type, { error: '未能启动器械，请检查连接后重试' })
        }
        return false
      }
      if (connections.current[type] !== connection) return false
      connection.collect = true
      update(type, { running: true })
      return true
    }).finally(() => { connection.starting = undefined })
    connection.starting = job
    return job
  }, [update])

  const stopDevice = useCallback(async (type: DeviceType): Promise<boolean> => {
    const connection = connections.current[type]
    if (!connection || type === 'heartRate') return true
    if (connection.starting) await connection.starting
    if (connection.stopping) return connection.stopping
    if (connections.current[type] !== connection) return false
    if (!connection.collect && !connection.mayBeRunning) return true
    const wasCollecting = connection.collect
    connection.collect = false
    const job = Promise.resolve().then(async () => {
      try {
        if (connection.control) await stopFtms(connection.control)
        connection.mayBeRunning = false
        if (connections.current[type] !== connection) return false
        update(type, { running: false, error: undefined })
        return true
      } catch {
        if (connections.current[type] === connection) {
          connection.collect = wasCollecting
          update(type, { error: '未能确认器械停止，请在器械上停止' })
        }
        return false
      }
    }).finally(() => { connection.stopping = undefined })
    connection.stopping = job
    return job
  }, [update])

  const resetAllDevices = useCallback(() => {
    for (const type of types) {
      if (type === 'heartRate') continue
      if (connections.current[type]) void stopDevice(type)
      update(type, { metrics: {}, running: false })
    }
  }, [stopDevice, update])

  return (
    <DeviceContext.Provider value={{ devices, supported, connectDevice, disconnectDevice, startDevice, stopDevice, resetAllDevices }}>
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevices() {
  const context = useContext(DeviceContext)
  if (!context) throw new Error('useDevices 必须位于 DeviceProvider 中')
  return context
}
