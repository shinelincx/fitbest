export type DeviceType = 'treadmill' | 'rower' | 'ski' | 'bike' | 'sled' | 'rep' | 'heartRate'

export interface DeviceMetrics {
  speed?: number // km/h (or m/s for rower/ski)
  distance?: number // meters (or reps for rep device)
  power?: number // watts
  cadence?: number // spm or rpm
  calories?: number // kcal
  heartRate?: number // bpm
  elapsedTime?: number // seconds —— 器械权威时间
}

// FTMS BLE UUID
export const FTMS_SERVICE = 0x1826
const TREADMILL_DATA = 0x2acd
const ROWER_DATA = 0x2ad1
const INDOOR_BIKE_DATA = 0x2ad2
export const CONTROL_POINT = 0x2ad9 // Fitness Machine Control Point
export const HEART_RATE_SERVICE = 0x180d
export const HEART_RATE_MEASUREMENT = 0x2a37

// FTMS Control Point opcodes
const CP_REQUEST_CONTROL = 0x00
const CP_RESET = 0x01
const CP_START = 0x07
const CP_STOP = 0x08

type ControlPoint = Pick<BluetoothRemoteGATTCharacteristic,
  'writeValueWithResponse' | 'addEventListener' | 'removeEventListener' | 'value'>

function command(control: ControlPoint, opcode: number, ...params: number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer)
      control.removeEventListener('characteristicvaluechanged', receive)
    }
    function fail(error: unknown) {
      cleanup()
      reject(error)
    }
    function receive() {
      const response = control.value
      if (!response || response.byteLength < 3 || response.getUint8(0) !== 0x80 || response.getUint8(1) !== opcode) return
      if (response.getUint8(2) !== 0x01) {
        fail(new Error('器械拒绝了控制指令'))
        return
      }
      cleanup()
      resolve()
    }
    const timer = setTimeout(() => fail(new Error('器械控制指令未收到确认')), 3000)
    control.addEventListener('characteristicvaluechanged', receive)
    void Promise.resolve().then(() => control.writeValueWithResponse(Uint8Array.of(opcode, ...params))).catch(fail)
  })
}

export async function startFtms(control: ControlPoint, reset: boolean) {
  await command(control, CP_REQUEST_CONTROL)
  if (reset) await command(control, CP_RESET)
  await command(control, CP_START)
}

export async function stopFtms(control: ControlPoint) {
  await command(control, CP_STOP, 0x01)
}

export function ftmsMeasurement(type: Exclude<DeviceType, 'heartRate'>) {
  if (type === 'treadmill') return { uuid: TREADMILL_DATA, parse: parseTreadmillData }
  if (type === 'bike') return { uuid: INDOOR_BIKE_DATA, parse: parseIndoorBikeData }
  return { uuid: ROWER_DATA, parse: parseRowerData }
}

function parseFlags(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function parseTreadmillData(view: DataView): DeviceMetrics {
  let offset = 0
  const flags = parseFlags(view, offset)
  offset += 2
  const m: DeviceMetrics = {}
  if (!(flags & 0x01)) {
    m.speed = view.getUint16(offset, true) / 100
    offset += 2
  }
  if (flags & 0x02) offset += 2
  if (flags & 0x04) {
    m.distance = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
    offset += 3
  }
  if (flags & 0x08) offset += 4
  if (flags & 0x10) offset += 4
  if (flags & 0x20) offset += 1
  if (flags & 0x40) offset += 1
  if (flags & 0x80) {
    m.calories = view.getUint16(offset, true)
    offset += 5
  }
  if (flags & 0x100) {
    m.heartRate = view.getUint8(offset)
    offset += 1
  }
  if (flags & 0x200) offset += 1
  if (flags & 0x400) {
    m.elapsedTime = view.getUint16(offset, true)
    offset += 2
  }
  if (flags & 0x800) offset += 2
  if (flags & 0x1000) {
    m.power = view.getInt16(offset + 2, true)
  }
  return m
}

function parseRowerData(view: DataView): DeviceMetrics {
  let offset = 0
  const flags = parseFlags(view, offset)
  offset += 2
  const m: DeviceMetrics = {}
  if (!(flags & 0x01)) {
    m.cadence = view.getUint8(offset) / 2
    offset += 3
  }
  if (flags & 0x02) offset += 1
  if (flags & 0x04) {
    m.distance = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
    offset += 3
  }
  if (flags & 0x08) {
    const pace = view.getUint16(offset, true)
    if (pace > 0) m.speed = 500 / pace
    offset += 2
  }
  if (flags & 0x10) offset += 2
  if (flags & 0x20) {
    m.power = view.getInt16(offset, true)
    offset += 2
  }
  if (flags & 0x40) offset += 2
  if (flags & 0x80) offset += 2
  if (flags & 0x100) {
    m.calories = view.getUint16(offset, true)
    offset += 5
  }
  if (flags & 0x200) {
    m.heartRate = view.getUint8(offset)
    offset += 1
  }
  if (flags & 0x400) offset += 1
  if (flags & 0x800) {
    m.elapsedTime = view.getUint16(offset, true)
  }
  return m
}

function parseIndoorBikeData(view: DataView): DeviceMetrics {
  let offset = 0
  const flags = parseFlags(view, offset)
  offset += 2
  const m: DeviceMetrics = {}
  if (!(flags & 0x01)) {
    m.speed = view.getUint16(offset, true) / 100
    offset += 2
  }
  if (flags & 0x02) offset += 2
  if (flags & 0x04) {
    m.cadence = view.getUint16(offset, true) / 2
    offset += 2
  }
  if (flags & 0x08) offset += 2
  if (flags & 0x10) {
    m.distance = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
    offset += 3
  }
  if (flags & 0x20) offset += 2
  if (flags & 0x40) {
    m.power = view.getInt16(offset, true)
    offset += 2
  }
  if (flags & 0x80) offset += 2
  if (flags & 0x100) {
    m.calories = view.getUint16(offset, true)
    offset += 5
  }
  if (flags & 0x200) {
    m.heartRate = view.getUint8(offset)
    offset += 1
  }
  if (flags & 0x400) offset += 1
  if (flags & 0x800) {
    m.elapsedTime = view.getUint16(offset, true)
  }
  return m
}

// 解析心率测量特征（Heart Rate Measurement, 0x2a37）
export function parseHeartRateData(view: DataView): DeviceMetrics {
  const flags = view.getUint8(0)
  const m: DeviceMetrics = {}
  if (flags & 0x01) {
    m.heartRate = view.getUint16(1, true)
  } else {
    m.heartRate = view.getUint8(1)
  }
  return m
}
