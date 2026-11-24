export interface DeviceMetrics {
  speed?: number
  distance?: number
  power?: number
  cadence?: number
  calories?: number
  heartRate?: number
  elapsedTime?: number
  strokeCount?: number
  pace?: number
  resistance?: number
  incline?: number
  privateTreadmillActive?: boolean
  privateTreadmillCountdown?: number
}

export type BleBuffer = ArrayBuffer | ArrayBufferView

function toView(input: BleBuffer): DataView {
  return ArrayBuffer.isView(input)
    ? new DataView(input.buffer, input.byteOffset, input.byteLength)
    : new DataView(input)
}

class PacketReader {
  private offset = 0
  private readonly view: DataView

  constructor(view: DataView) {
    this.view = view
  }

  skip(length: number) {
    this.offset += length
  }

  get remaining() {
    return this.view.byteLength - this.offset
  }

  u8(): number | undefined {
    if (this.offset + 1 > this.view.byteLength) {
      this.offset += 1
      return undefined
    }
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  u16(): number | undefined {
    if (this.offset + 2 > this.view.byteLength) {
      this.offset += 2
      return undefined
    }
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  i16(): number | undefined {
    if (this.offset + 2 > this.view.byteLength) {
      this.offset += 2
      return undefined
    }
    const value = this.view.getInt16(this.offset, true)
    this.offset += 2
    return value
  }

  u24(): number | undefined {
    if (this.offset + 3 > this.view.byteLength) {
      this.offset += 3
      return undefined
    }
    const value = this.view.getUint8(this.offset)
      | (this.view.getUint8(this.offset + 1) << 8)
      | (this.view.getUint8(this.offset + 2) << 16)
    this.offset += 3
    return value
  }
}

export function parseTreadmillData(input: BleBuffer): DeviceMetrics {
  const reader = new PacketReader(toView(input))
  const flags = reader.u16()
  if (flags === undefined) return {}
  const m: DeviceMetrics = {}
  if (!(flags & 0x01)) {
    const speed = reader.u16()
    if (speed !== undefined) m.speed = speed / 100
  }
  if (flags & 0x02) reader.skip(2)
  if (flags & 0x04) m.distance = reader.u24()
  if (flags & 0x08) {
    const incline = reader.i16()
    if (incline !== undefined) m.incline = incline / 10
    reader.skip(2)
  }
  if (flags & 0x10) reader.skip(4)
  if (flags & 0x20) reader.skip(1)
  if (flags & 0x40) reader.skip(1)
  if (flags & 0x80) {
    m.calories = reader.u16()
    reader.skip(3)
  }
  if (flags & 0x100) m.heartRate = reader.u8()
  if (flags & 0x200) reader.skip(1)
  if (flags & 0x400) m.elapsedTime = reader.u16()
  if (flags & 0x800) reader.skip(2)
  if (flags & 0x1000) {
    reader.skip(2)
    m.power = reader.i16()
  }
  // ThinkFit firmware appends a three-byte step counter in its extension field.
  if ((flags & 0x2000) && reader.remaining === 3) m.strokeCount = reader.u24()
  return m
}

export function parseRowerData(input: BleBuffer): DeviceMetrics {
  const reader = new PacketReader(toView(input))
  const flags = reader.u16()
  if (flags === undefined) return {}
  const m: DeviceMetrics = {}
  if (!(flags & 1)) {
    const cadence = reader.u8()
    if (cadence !== undefined) m.cadence = cadence / 2
    const count = reader.u16()
    if (count !== undefined) m.strokeCount = count
  }
  if (flags & 0x02) reader.skip(1)
  if (flags & 0x04) m.distance = reader.u24()
  if (flags & 0x08) {
    const pace = reader.u16()
    if (pace !== undefined && pace > 0) {
      m.pace = pace
      m.speed = Math.round(18000 / pace) / 10
    }
  }
  if (flags & 0x10) reader.skip(2)
  if (flags & 0x20) m.power = reader.i16()
  if (flags & 0x40) reader.skip(2)
  if (flags & 0x80) m.resistance = reader.i16()
  if (flags & 0x100) {
    m.calories = reader.u16()
    reader.skip(3)
  }
  if (flags & 0x200) m.heartRate = reader.u8()
  if (flags & 0x400) reader.skip(1)
  if (flags & 0x800) m.elapsedTime = reader.u16()
  return m
}

export function parseIndoorBikeData(input: BleBuffer): DeviceMetrics {
  const reader = new PacketReader(toView(input))
  const flags = reader.u16() ?? 0
  const m: DeviceMetrics = {}
  if (flags & 0x02) reader.skip(2)
  if (flags & 0x04) {
    const cadence = reader.u16()
    if (cadence !== undefined) m.cadence = cadence / 2
  }
  if (flags & 0x08) reader.skip(2)
  if (flags & 0x10) m.distance = reader.u24()
  if (flags & 0x1000) m.power = reader.i16()
  if (flags & 0x400) m.calories = reader.u16()
  if (flags & 0x10000) m.heartRate = reader.u8()
  if (flags & 0x8000) m.elapsedTime = reader.u16()
  return m
}

export function parseHeartRateData(input: BleBuffer): DeviceMetrics {
  const reader = new PacketReader(toView(input))
  const flags = reader.u8()
  if (flags === undefined) return {}
  const heartRate = flags & 0x01 ? reader.u16() : reader.u8()
  return heartRate === undefined ? {} : { heartRate }
}
