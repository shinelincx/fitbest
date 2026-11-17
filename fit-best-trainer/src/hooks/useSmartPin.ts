import { useCallback, useEffect, useRef, useState } from 'react'
import type { PinBinding, PinMachine } from '../types'
import { PIN_MACHINE_MAP, plateToWeight } from '../mock/pinMachines'
import { getBindingByPinId, removePinBinding, savePinBinding } from '../api'
import { PIN_NAME_PREFIX, PIN_SERVICE, PIN_STATE_CHAR, parsePinPacket } from '../ble/pin'
import { bleAdapter, type BleConnection } from '../platform/ble'

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
  tempoSec: 0,
  battery: 0,
  sensorOnline: false,
}

export function useSmartPin(machine: PinMachine | null, ownerId: string | null) {
  const [status, setStatus] = useState<PinStatus>('idle')
  const [device, setDevice] = useState<PinDevice | null>(null)
  const [live, setLive] = useState<PinLive>(EMPTY_LIVE)
  const [binding, setBinding] = useState<PinBinding | null>(null)

  const plateRef = useRef(machine?.startPlate ?? 1)
  const repRef = useRef(0)
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
      if (!supported) {
        setStatus('failed')
        return
      }
      setStatus('connecting')
      let connection: BleConnection | undefined
      try {
        const dev = await bleAdapter.requestDevice({
          services: [PIN_SERVICE],
          optionalServices: [PIN_SERVICE],
          namePrefix: PIN_NAME_PREFIX,
        })
        connection = await bleAdapter.connect(dev, () => {
          gattRef.current.unsubscribe?.()
          gattRef.current = {}
          setDevice(null)
          setLive(EMPTY_LIVE)
          setStatus('idle')
        })
        const char = await connection.getCharacteristic(PIN_SERVICE, PIN_STATE_CHAR)
        const unsubscribe = await char.startNotifications((bytes) => {
          const p = parsePinPacket(bytes)
          if (!p) return
          plateRef.current = p.plate
          repRef.current = p.reps
          setLive((prev) => ({
            ...prev,
            ...p,
            weight: machine ? plateToWeight(machine, p.plate) : 0,
            sensorOnline: true,
          }))
        })

        gattRef.current = { connection, unsubscribe }
        setDevice({ id: dev.id, name: dev.name || PIN_NAME_PREFIX, rssi: 0 })
        setBinding(getBindingByPinId(dev.id, ownerId) ?? null)
        setStatus('connected')
      } catch (e) {
        if (connection) void connection.disconnect().catch(() => undefined)
        console.warn('插销连接失败：', e)
        setStatus('failed')
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
    repRef.current = 0
    waveRef.current = []
    setDevice(null)
    setLive(EMPTY_LIVE)
    setStatus('idle')
  }, [])

  useEffect(() => () => disconnect(), [disconnect])

  /** 调整插销到指定档位（真机为重新插销后由测距自动上报） */
  const setPlate = useCallback(
    (plate: number) => {
      if (!machine) return
      const next = Math.max(1, Math.min(machine.plates, plate))
      plateRef.current = next
      setLive((prev) => ({
        ...prev,
        plate: next,
        weight: plateToWeight(machine, next),
      }))
    },
    [machine],
  )

  /** 清空当前组计数（开始新组时调用） */
  const resetReps = useCallback(() => {
    repRef.current = 0
    waveRef.current = []
    setLive((prev) => ({ ...prev, reps: 0 }))
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
    scan: connect,
    connect,
    disconnect,
    setPlate,
    resetReps,
    bindTo,
    unbind,
  }
}

export function pinMachineById(id: string | undefined): PinMachine | null {
  return id ? PIN_MACHINE_MAP[id] ?? null : null
}
