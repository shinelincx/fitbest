import type { BleCharacteristic } from '../platform/ble'
import type { TreadmillRange } from './privateTreadmill'

export function parseFtmsTreadmillRange(bytes: Uint8Array | undefined, field: 'speed' | 'incline'): TreadmillRange | undefined {
  if (!bytes || bytes.byteLength < 6) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const scale = field === 'speed' ? 100 : 10
  const min = (field === 'speed' ? view.getUint16(0, true) : view.getInt16(0, true)) / scale
  const max = (field === 'speed' ? view.getUint16(2, true) : view.getInt16(2, true)) / scale
  const step = view.getUint16(4, true) / scale
  if (min < max && step > 0 && step <= max - min + 1e-6) return { min, max, step }
}

export async function sendFtmsControl(control: BleCharacteristic, commands: number[][]): Promise<void> {
  if (!control.writeWithResponse) throw new Error('FTMS control write unavailable')
  let receive: ((bytes: Uint8Array) => void) | undefined
  const unsubscribe = await control.startNotifications((bytes) => receive?.(bytes))
  try {
    for (const command of commands) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const response = new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => reject(new Error('FTMS control response timed out')), 3000)
          receive = (bytes) => {
            if (bytes.length < 3 || bytes[0] !== 0x80 || bytes[1] !== command[0]) return
            if (bytes[2] === 0x01) resolve()
            else reject(new Error(`FTMS control rejected: ${bytes[2]}`))
          }
        })
        await Promise.all([response, control.writeWithResponse(new Uint8Array(command))])
      } finally {
        clearTimeout(timer)
        receive = undefined
      }
    }
  } finally {
    unsubscribe()
    await control.stopNotifications().catch(() => undefined)
  }
}
