import { useCallback, useEffect, useRef, useState } from 'react'
import type { PinBinding, PinMachine } from '../types'
import { plateToWeight } from '../mock/pinMachines'
import { getBindingByPinId, removePinBinding, savePinBinding } from '../api'
import { PIN_NAME_PREFIX, PIN_SERVICE, PIN_STATE_CHAR, parsePinPacket } from '../ble/pin'
import { bleAdapter, type BleConnection, type BleDeviceRef } from '../platform/ble'
import type { BluetoothSearchRequest } from '../components/BluetoothSearchDialog'
import { isNative, isCancellation } from '../platform/runtime'

export type PinStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'failed'

export interface PinDevice {
  id: string
  name: string
  rssi: number
}

export interface PinLive {
  plate: number
  weight: number
  reps: number
  phase: 'idle' | 'pull' | 'return'
  romCm: number
  posCm: number
  speedCmS: number
  tempoSec: number
  battery: number
  sensorOnline: boolean
}

const EMPTY_LIVE: PinLive = {
  plate: 0,
  weight: 0,
  reps: 0,
  phase: 'idle',
  romCm: 0,
  posCm: 0,
  speedCmS: 0,
  tempoSec: 0,
  battery: 0,
  sensorOnline: false,
}

export function useSmartPin(machine: PinMachine | null, ownerId: string | null) {
  const [status, setStatus] = useState<PinStatus>('idle')
  const [device, setDevice] = useState<PinDevice | null>(null)
  const [live, setLive] = useState<PinLive>(EMPTY_LIVE)
  const [binding, setBinding] = useState<PinBinding | null>(null)
  const [searchRequest, setSearchRequest] = useState<BluetoothSearchRequest | null>(null)
  const connecting = useRef(false)

  const plateRef = useRef(machine?.startPlate ?? 1)
  const counter = useRef({ previous: undefined as number | undefined, reps: 0, position: 0, rom: 0, lastRepAt: 0 })
  /** 实时位移波形缓冲（cm，20Hz，保留最近 30s），供 WaveChart 直接绘制 */
  const waveRef = useRef<number[]>([])
  const gattRef = useRef<{ connection?: BleConnection; unsubscribe?: () => void }>({})

  const supported = bleAdapter.isSupported()

  useEffect(() => {
    plateRef.current = machine?.startPlate ?? 1
    setLive((prev) => ({
      ...prev,
      plate: plateRef.current,
      weight: machine ? plateToWeight(machine, plateRef.current) : 0,
    }))
  }, [machine])

  // 打开系统蓝牙选择器并连接插销
  const connect = useCallback(
    async (_id?: string) => {
      if (connecting.current) return
      if (!supported) {
        setStatus('failed')
        return
      }
      connecting.current = true
      setStatus('scanning')
      let connection: BleConnection | undefined
      try {
        const dev = isNative ? await new Promise<BleDeviceRef | null>((resolve, reject) => {
          setSearchRequest({
            matches: (device) => device.name?.toUpperCase().includes(PIN_NAME_PREFIX) ?? false,
            deviceTypeLabel: () => '智能插销',
            finish: (selected, error) => {
              setSearchRequest(null)
              if (error) reject(error)
              else resolve(selected)
            },
          })
        }) : await bleAdapter.requestDevice({
          services: [],
          optionalServices: [PIN_SERVICE],
          namePrefix: PIN_NAME_PREFIX,
        })
        if (!dev) {
          setStatus('idle')
          return
        }
        setStatus('connecting')
        connection = await bleAdapter.connect(dev, () => {
          gattRef.current.unsubscribe?.()
          gattRef.current = {}
          setDevice(null)
          setLive(EMPTY_LIVE)
          setStatus('idle')
        })
        const char = await connection.getCharacteristic(PIN_SERVICE, PIN_STATE_CHAR)
        counter.current = { previous: undefined, reps: 0, position: 0, rom: 0, lastRepAt: 0 }
        const unsubscribe = await char.startNotifications((bytes) => {
          const p = parsePinPacket(bytes)
          if (!p) return
          plateRef.current = p.plate
          const state = counter.current
          const delta = state.previous === undefined ? 0 : p.reps < state.previous ? p.reps : p.reps - state.previous
          state.previous = p.reps
          const posCm = p.distanceMm / 10
          const phase = posCm > state.position ? 'pull' : posCm < state.position && posCm > 0 ? 'return' : 'idle'
          state.position = posCm
          state.rom = Math.max(state.rom, posCm)
          const wave = waveRef.current
          if (wave.length || posCm > 0) {
            if (wave.at(-1) !== 0 || posCm > 0) wave.push(Math.min(50, posCm))
            if (wave.length > 600) wave.shift()
          }
          const now = Date.now()
          const tempoSec = delta > 0 && state.lastRepAt ? Math.round((now - state.lastRepAt) / delta / 100) / 10 : undefined
          if (delta > 0) state.lastRepAt = now
          state.reps += delta
          const { reps, rom } = state
          setLive((prev) => ({
            ...prev,
            plate: p.plate,
            reps,
            phase: p.speedCmS === 0 && phase !== 'return' ? 'idle' : phase,
            posCm,
            speedCmS: p.speedCmS,
            romCm: rom,
            tempoSec: tempoSec ?? prev.tempoSec,
            battery: Math.min(100, p.battery),
            weight: machine && p.plate > 0 ? plateToWeight(machine, p.plate) : 0,
            sensorOnline: true,
          }))
        })

        gattRef.current = { connection, unsubscribe }
        setDevice({ id: dev.id, name: dev.name || PIN_NAME_PREFIX, rssi: 0 })
        setBinding(getBindingByPinId(dev.id, ownerId) ?? null)
        setStatus('connected')
      } catch (e) {
        if (connection) void connection.disconnect().catch(() => undefined)
        if (isCancellation(e)) {
          setStatus('idle')
          return
        }
        console.warn('插销连接失败：', e)
        setStatus('failed')
      } finally {
        connecting.current = false
      }
    },
    [machine, ownerId, supported],
  )

  const disconnect = useCallback(() => {
    const g = gattRef.current
    if (g?.unsubscribe) {
      try { g.unsubscribe() } catch { /* ignore */ }
    }
    gattRef.current = {}
    if (g?.connection) void g.connection.disconnect().catch(() => undefined)
    counter.current = { previous: undefined, reps: 0, position: 0, rom: 0, lastRepAt: 0 }
    waveRef.current = []
    setDevice(null)
    setLive(EMPTY_LIVE)
    setStatus('idle')
  }, [])

  useEffect(() => () => disconnect(), [disconnect])

  /** 清空当前组计数（开始新组时调用） */
  const resetReps = useCallback(() => {
    counter.current.reps = 0
    counter.current.rom = 0
    counter.current.lastRepAt = 0
    waveRef.current = []
    setLive((prev) => ({ ...prev, reps: 0, romCm: 0, tempoSec: 0 }))
  }, [])

  /** 将当前插销绑定到指定器械（覆盖旧绑定） */
  const bindTo = useCallback(
    async (machineId: string) => {
      if (!device) return
      const b: PinBinding = {
        pinId: device.id,
        pinName: device.name,
        machineId,
        boundAt: Date.now(),
      }
      await savePinBinding(b, ownerId)
      setBinding(b)
    },
    [device, ownerId],
  )

  /** 解除当前插销与器械的绑定 */
  const unbind = useCallback(async () => {
    if (!device) return
    await removePinBinding(device.id, ownerId)
    setBinding(null)
  }, [device, ownerId])

  return {
    supported,
    status,
    device,
    live,
    binding,
    waveRef,
    searchRequest,
    scan: connect,
    connect,
    disconnect,
    resetReps,
    bindTo,
    unbind,
  }
}
