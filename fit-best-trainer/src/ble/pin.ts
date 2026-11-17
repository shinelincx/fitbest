import type { BleBuffer } from './ftms'

export const PIN_SERVICE = '0000fd00-0000-1000-8000-00805f9b34fb'
export const PIN_STATE_CHAR = '0000fd01-0000-1000-8000-00805f9b34fb'
export const PIN_NAME_PREFIX = 'FITBEST-PIN'

export interface PinPacket {
  plate: number
  reps: number
  romCm: number
  phase: 'idle' | 'pull' | 'return'
}

/**
 * 插销上行数据帧（正式 UUID 与帧格式仍需固件确认）：
 * [0] 档位，[1..2] 次数 uint16 LE，[3..4] 幅度 mm uint16 LE，[5] 运动状态。
 */
export function parsePinPacket(input: BleBuffer): PinPacket | null {
  const view = ArrayBuffer.isView(input)
    ? new DataView(input.buffer, input.byteOffset, input.byteLength)
    : new DataView(input)
  if (view.byteLength < 6) return null
  const phaseFlag = view.getUint8(5)
  return {
    plate: view.getUint8(0),
    reps: view.getUint16(1, true),
    romCm: Math.round(view.getUint16(3, true) / 10),
    phase: phaseFlag === 1 ? 'pull' : phaseFlag === 2 ? 'return' : 'idle',
  }
}
