import type { DeviceMetrics } from './ftms'
import type { BleCharacteristicInfo } from '../platform/ble/types'
import { normalizeUuid } from '../platform/ble/uuid'
import { TF_NOTIFY, TF_WRITE } from './thinkfit'

export function selectPrivateTreadmillCharacteristics(characteristics: BleCharacteristicInfo[]) {
  const receivers = characteristics.filter(({ properties }) => properties.notify || properties.indicate)
  const senders = characteristics.filter(({ properties }) => properties.write || properties.writeWithoutResponse)
  const notify = receivers.find(({ uuid }) => normalizeUuid(uuid) === normalizeUuid(TF_NOTIFY)) ?? receivers[0]
  const write = senders.find(({ uuid }) => normalizeUuid(uuid) === normalizeUuid(TF_WRITE)) ?? senders[0]
  return notify && write ? { notify, write } : null
}

// NewAiFitbest trimotion: 0x51 requests the current treadmill telemetry.
export const TREADMILL_TELEMETRY_REQUEST = new Uint8Array([0x02, 0x51, 0x51, 0x03])
export const TREADMILL_SPEED_RANGE_REQUEST = Uint8Array.of(0x02, 0x50, 0x02, 0x52, 0x03)
export const TREADMILL_INCLINE_RANGE_REQUEST = Uint8Array.of(0x02, 0x50, 0x03, 0x53, 0x03)

export interface TreadmillRange { min: number; max: number; step?: number }
export type TreadmillLimits = Partial<Record<'speed' | 'incline', TreadmillRange>>

export function parsePrivateTreadmillLimits(bytes: Uint8Array): TreadmillLimits | null {
  if (bytes.length < 7 || bytes[0] !== 0x02 || bytes[1] !== 0x50 || bytes.at(-1) !== 0x03) return null
  const max = bytes[3]
  if (bytes[2] === 0x02 && bytes[4] > 0 && max >= bytes[4]) return { speed: { min: bytes[4] / 10, max: max / 10 } }
  if (bytes[2] === 0x03 && max <= 127) {
    const min = bytes[4] < 128 ? bytes[4] : bytes[4] - 256
    if (max >= min) return { incline: { min, max } }
  }
  return null
}

export function privateTreadmillSetTargets(speed: number, incline: number) {
  const speedByte = Math.round(speed * 10)
  const inclineByte = incline & 0xff
  return Uint8Array.of(0x02, 0x53, 0x02, speedByte, inclineByte, 0x53 ^ 0x02 ^ speedByte ^ inclineByte, 0x03)
}

// NewAiFitbest blecode.js: runStart, runStop, runPause, runGoon.
export function privateTreadmillControl(action: 'start' | 'stop' | 'pause' | 'resume') {
  const sub = { start: 0x01, stop: 0x03, pause: 0x0a, resume: 0x09 }[action]
  const payload = action === 'start' ? [sub, ...Array<number>(8).fill(0)] : [sub]
  return Uint8Array.of(0x02, 0x53, ...payload, 0x53 ^ sub, 0x03)
}

export function parsePrivateTreadmillData(bytes: Uint8Array): DeviceMetrics | null {
  if (bytes.length !== 17 || bytes[0] !== 0x02 || bytes[1] !== 0x51 || bytes[16] !== 0x03) return null
  if (bytes[2] !== 0x03 && bytes[2] !== 0x04 && bytes[2] !== 0x0a) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const distance = view.getUint16(7, true)
  return {
    speed: bytes[3] / 10,
    incline: view.getInt8(4),
    elapsedTime: view.getUint16(5, true),
    distance: distance & 0x8000 ? (distance & 0x7fff) * 10 : distance,
    calories: view.getUint16(9, true) / 10,
    strokeCount: view.getUint16(11, true),
    heartRate: bytes[13],
  }
}

export function parsePrivateTreadmillCountdown(bytes: Uint8Array): number | undefined {
  if (bytes.length !== 6 || bytes[0] !== 0x02 || bytes[1] !== 0x51 || bytes[2] !== 0x02 || bytes[5] !== 0x03) return
  const seconds = bytes[3]
  if (seconds >= 1 && seconds <= 3 && bytes[4] === (0x51 ^ 0x02 ^ seconds)) return seconds
}
