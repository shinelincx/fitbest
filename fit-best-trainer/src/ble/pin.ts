import type { BleBuffer } from './ftms'

export const PIN_SERVICE = 'fff0'
export const PIN_STATE_CHAR = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
export const PIN_NAME_PREFIX = 'ZTYNLLZ'

export interface PinPacket {
  plate: number
  reps: number
  distanceMm: number
  speedCmS: number
  battery: number
}

export function parsePinPacket(input: BleBuffer): PinPacket | null {
  const view = ArrayBuffer.isView(input)
    ? new DataView(input.buffer, input.byteOffset, input.byteLength)
    : new DataView(input)
  if (view.byteLength !== 14 || view.getUint8(0) !== 0x22 ||
    view.getUint8(1) !== 0xe3 || view.getUint8(13) !== 0x27) return null

  let checksum = 0
  for (let index = 1; index <= 11; index++) checksum += view.getUint8(index)
  if ((checksum & 0xff) !== view.getUint8(12)) return null

  return {
    plate: view.getUint8(2),
    reps: view.getUint16(3),
    distanceMm: view.getUint16(5),
    speedCmS: view.getUint16(7),
    battery: view.getUint8(9),
  }
}
