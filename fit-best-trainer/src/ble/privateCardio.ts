import type { DeviceMetrics } from './ftms'

export const CARDIO_STATUS_REQUEST = Uint8Array.of(2, 0x42, 0x42, 3)
export const CARDIO_DATA_REQUEST = Uint8Array.of(2, 0x43, 1, 0x42, 3)
export const CARDIO_LIMIT_REQUEST = Uint8Array.of(2, 0x41, 2, 0x43, 3)

export function privateCardioControl(action: 'start' | 'resume' | 'pause' | 'stop') {
  const value = { start: 1, resume: 2, pause: 3, stop: 4 }[action]
  return Uint8Array.of(2, 0x44, value, 0x44 ^ value, 3)
}

export function privateCardioResistance(level: number) {
  return Uint8Array.of(2, 0x44, 5, level, 0, 0x44 ^ 5 ^ level, 3)
}

export function parsePrivateCardioPacket(bytes: Uint8Array): { metrics?: DeviceMetrics; maxResistance?: number } | null {
  if (bytes.length < 5 || bytes[0] !== 2 || bytes.at(-1) !== 3) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[1] === 0x41 && bytes[2] === 2 && bytes.length >= 6) return { maxResistance: bytes[3] }
  if (bytes[1] === 0x42 && bytes[2] <= 3) {
    if (bytes.length < 13 || (bytes[2] !== 2 && bytes[2] !== 3)) return {}
    return { metrics: {
      speed: view.getUint16(3, true) / 100, resistance: bytes[5], cadence: view.getUint16(6, true),
      heartRate: bytes[8], power: view.getUint16(9, true) / 10,
    } }
  }
  if (bytes[1] === 0x43 && bytes.length === 13) {
    const rawDistance = view.getUint16(5, true)
    return { metrics: {
      elapsedTime: view.getUint16(3, true), distance: rawDistance & 0x8000 ? (rawDistance & 0x7fff) * 10 : rawDistance,
      calories: view.getUint16(7, true) / 10, strokeCount: view.getUint16(9, true),
    } }
  }
  return null
}
