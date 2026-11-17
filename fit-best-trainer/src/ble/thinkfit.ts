/**
 * ThinkFit 跑步机 / 健身车车表内部通信协议 V1.0.2
 *
 * 物理层：BLE，Service FFF0 / Notify FFF1 / Write FFF2，广播名 TF-xxxxxx
 * 帧格式（小端，最大 20 字节）：
 *   0x02 | 指令 | 指令数据… | FCS | 0x03
 *   FCS = 第 1 字节至第 n-3 字节（指令 + 指令数据）的异或值
 *
 * 指令集：
 *   0xCC-0x01 配置设备信息      0xCC-0x02 获取设备配置信息    0xCC-0x03 预置程式信息
 *   0xCD-0x01 屏幕全显          0xCD-0x02 漏光检测
 *   0xCE-0x01 配置蓝牙名称      0xCE-0x02 读取蓝牙名称
 *   0xCF-0x01 读取历史缓存      0xCF-0x02 开启演示（禁用息屏） 0xCF-0x03 马达微调
 */

export const TF_SERVICE = 'fff0'
export const TF_NOTIFY = 'fff1'
export const TF_WRITE = 'fff2'
export const TF_NAME_PREFIX = 'TF-'

export const TF_START = 0x02
export const TF_END = 0x03
/** 协议要求两包之间至少间隔 200ms */
export const TF_PACKET_GAP_MS = 210

export const CMD_CONFIG = 0xcc
export const CMD_LCD = 0xcd
export const CMD_NAME = 0xce
export const CMD_MISC = 0xcf

export interface TfFrame {
  cmd: number
  sub: number
  data: Uint8Array
}

/** 车表设备信息（0xCC-0x02 响应） */
export interface TfDeviceInfo {
  brandId: number
  typeId: number
  model: number
  /** 半径，单位 cm */
  radius: number
  /** 轮径比 ×10，例如 36 表示 3.6 倍 */
  wheelRatio: number
  /** 霍尔数 / 传感器数 */
  hallCount: number
  /** 最大摩擦力，单位 g */
  maxFriction: number
  /** 0 公制 / 1 英制 */
  unitType: number
  vrMax: number
  vrMin: number
  /** 1：阻力最大时 VR 阻值最大 */
  vrDirection: number
}

/** 预置程式片段：时间(秒) / 速度 / 坡度 */
export interface TfProgramSegment {
  time: number
  speed: number
  incline: number
}

export function xorChecksum(bytes: ArrayLike<number>, from = 0, to = bytes.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum ^= bytes[i]
  return sum & 0xff
}

/** 组帧：0x02 | cmd | sub | data… | FCS | 0x03 */
export function encodeFrame(cmd: number, sub: number, data: number[] = []): Uint8Array<ArrayBuffer> {
  const body = [cmd & 0xff, sub & 0xff, ...data.map((b) => b & 0xff)]
  const fcs = xorChecksum(body)
  return new Uint8Array([TF_START, ...body, fcs, TF_END])
}

/** 解帧并校验 FCS；不合法返回 null */
export function decodeFrame(input: Uint8Array): TfFrame | null {
  if (input.length < 4) return null
  if (input[0] !== TF_START || input[input.length - 1] !== TF_END) return null
  const fcs = input[input.length - 2]
  if (xorChecksum(input, 1, input.length - 2) !== fcs) return null
  return {
    cmd: input[1],
    sub: input[2],
    data: input.slice(3, input.length - 2),
  }
}

export function frameBytes(frame: TfFrame): number[] {
  return Array.from(encodeFrame(frame.cmd, frame.sub, Array.from(frame.data)))
}

/* ============ 指令构造 ============ */

/** 0xCC-0x02 获取设备配置信息 */
export function buildGetConfig(): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_CONFIG, 0x02)
}

/** 0xCC-0x01 配置设备信息 */
export function buildSetConfig(info: TfDeviceInfo): Uint8Array<ArrayBuffer> {
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff]
  return encodeFrame(CMD_CONFIG, 0x01, [
    info.brandId & 0xff,
    info.typeId & 0xff,
    ...u16(info.model),
    info.radius & 0xff,
    info.wheelRatio & 0xff,
    info.hallCount & 0xff,
    ...u16(info.maxFriction),
    info.unitType & 0xff,
    ...u16(info.vrMax),
    ...u16(info.vrMin),
    info.vrDirection & 0xff,
  ])
}

/** 0xCC-0x03 预置程式信息 */
export function buildSetProgram(programId: number, segments: TfProgramSegment[]): Uint8Array<ArrayBuffer> {
  const data = [programId & 0xff]
  segments.forEach((s) => {
    data.push(s.time & 0xff, s.speed & 0xff, s.incline & 0xff)
  })
  return encodeFrame(CMD_CONFIG, 0x03, data)
}

/** 0xCD-0x01 屏幕全显 / 0xCD-0x02 漏光检测 */
export function buildLcdTest(mode: 'all' | 'leak'): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_LCD, mode === 'all' ? 0x01 : 0x02)
}

/** 0xCE-0x01 配置蓝牙名称（最长 15 字节） */
export function buildSetBleName(name: string): Uint8Array<ArrayBuffer> {
  const bytes = Array.from(new TextEncoder().encode(name)).slice(0, 15)
  return encodeFrame(CMD_NAME, 0x01, bytes)
}

/** 0xCE-0x02 读取蓝牙名称 */
export function buildGetBleName(): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_NAME, 0x02)
}

/** 0xCF-0x01 读取历史日志缓存 */
export function buildGetHistoryCache(): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_MISC, 0x01)
}

/** 0xCF-0x02 开启演示功能（禁用息屏，断电重启失效） */
export function buildDisableSleep(): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_MISC, 0x02)
}

/** 0xCF-0x03 马达位置微调：0x01 左旋 / 0x02 右旋，持续 150ms */
export function buildNudgeMotor(direction: 'left' | 'right'): Uint8Array<ArrayBuffer> {
  return encodeFrame(CMD_MISC, 0x03, [direction === 'left' ? 0x01 : 0x02])
}

/* ============ 响应解析 ============ */

/** 0xCC-0x02 配置信息响应 */
export function parseDeviceInfo(frame: TfFrame): TfDeviceInfo | null {
  if (frame.cmd !== CMD_CONFIG || frame.sub !== 0x02 || frame.data.length < 15) return null
  const d = frame.data
  const u16 = (i: number) => d[i] | (d[i + 1] << 8)
  return {
    brandId: d[0],
    typeId: d[1],
    model: u16(2),
    radius: d[4],
    wheelRatio: d[5],
    hallCount: d[6],
    maxFriction: u16(7),
    unitType: d[9],
    vrMax: u16(10),
    vrMin: u16(12),
    vrDirection: d[14],
  }
}

/** 0xCE-0x02 蓝牙名称响应 */
export function parseBleName(frame: TfFrame): string | null {
  if (frame.cmd !== CMD_NAME || frame.sub !== 0x02) return null
  return new TextDecoder().decode(frame.data).replace(/\0+$/, '')
}

/** 0xCF-0x01 历史缓存响应（首字节为最新值） */
export function parseHistoryCache(frame: TfFrame): number[] | null {
  if (frame.cmd !== CMD_MISC || frame.sub !== 0x01) return null
  return Array.from(frame.data)
}

/** 0xCE-0x01 状态：1 写入成功 / 0 写入失败 */
export function parseWriteStatus(frame: TfFrame): boolean | null {
  if (frame.cmd !== CMD_NAME || frame.sub !== 0x01 || frame.data.length < 1) return null
  return frame.data[0] === 1
}

/** 是否为对应指令的空响应（ACK） */
export function isAck(frame: TfFrame, cmd: number, sub: number): boolean {
  return frame.cmd === cmd && frame.sub === sub && frame.data.length === 0
}

/* ============ 会话封装 ============ */

export interface TfConsoleHooks {
  onFrame?: (frame: TfFrame) => void
  onDisconnect?: () => void
}

/**
 * 车表会话：负责 FFF2 写入与 FFF1 通知的请求/响应配对，
 * 自动满足协议要求的 200ms 包间隔。
 */
export interface TfConsoleTransport {
  writeWithoutResponse(bytes: Uint8Array<ArrayBuffer>): Promise<void>
  subscribe(listener: (bytes: Uint8Array) => void): Promise<() => void | Promise<void>>
}

export class ThinkFitConsole {
  private queue: Promise<unknown> = Promise.resolve()
  private lastWriteAt = 0
  private pending = new Map<string, {
    resolve: (f: TfFrame) => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private transport: TfConsoleTransport
  private hooks: TfConsoleHooks
  private ready: Promise<void>
  private unsubscribe?: () => void | Promise<void>
  private disposed = false

  constructor(transport: TfConsoleTransport, hooks: TfConsoleHooks = {}) {
    this.transport = transport
    this.hooks = hooks
    this.ready = transport.subscribe(this.handleNotify).then((unsubscribe) => {
      if (this.disposed) void unsubscribe()
      else this.unsubscribe = unsubscribe
    })
  }

  private handleNotify = (bytes: Uint8Array) => {
    const frame = decodeFrame(bytes)
    if (!frame) return
    this.hooks.onFrame?.(frame)
    const key = `${frame.cmd}-${frame.sub}`
    const waiter = this.pending.get(key)
    if (waiter) {
      clearTimeout(waiter.timer)
      this.pending.delete(key)
      waiter.resolve(frame)
    }
  }

  /** 发送指令并等待同 cmd/sub 的响应（默认 3s 超时） */
  request(bytes: Uint8Array<ArrayBuffer>, cmd: number, sub: number, timeout = 3000): Promise<TfFrame> {
    const run = async () => {
      const key = `${cmd}-${sub}`
      const result = new Promise<TfFrame>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(key)
          reject(new Error(`ThinkFit 指令超时：0x${cmd.toString(16)}-0x${sub.toString(16)}`))
        }, timeout)
        this.pending.set(key, { resolve, reject, timer })
      })
      try {
        await this.ready
        const wait = TF_PACKET_GAP_MS - (Date.now() - this.lastWriteAt)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        await this.transport.writeWithoutResponse(bytes)
        this.lastWriteAt = Date.now()
      } catch (err) {
        const waiter = this.pending.get(key)
        if (waiter) {
          clearTimeout(waiter.timer)
          this.pending.delete(key)
        }
        throw err
      }
      return result
    }
    const task = this.queue.then(run, run)
    this.queue = task.catch(() => undefined)
    return task
  }

  /** 只发不收（用于屏幕测试、马达微调等 ACK 可选的指令） */
  async send(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const run = async () => {
      await this.ready
      const wait = TF_PACKET_GAP_MS - (Date.now() - this.lastWriteAt)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      await this.transport.writeWithoutResponse(bytes)
      this.lastWriteAt = Date.now()
    }
    const task = this.queue.then(run, run)
    this.queue = task.catch(() => undefined)
    await task
  }

  async getDeviceInfo(): Promise<TfDeviceInfo> {
    const frame = await this.request(buildGetConfig(), CMD_CONFIG, 0x02)
    const info = parseDeviceInfo(frame)
    if (!info) throw new Error('ThinkFit 配置信息解析失败')
    return info
  }

  async getBleName(): Promise<string> {
    const frame = await this.request(buildGetBleName(), CMD_NAME, 0x02)
    return parseBleName(frame) ?? ''
  }

  async setBleName(name: string): Promise<boolean> {
    const frame = await this.request(buildSetBleName(name), CMD_NAME, 0x01)
    return parseWriteStatus(frame) ?? false
  }

  async setDeviceInfo(info: TfDeviceInfo): Promise<void> {
    await this.request(buildSetConfig(info), CMD_CONFIG, 0x01)
  }

  async setProgram(programId: number, segments: TfProgramSegment[]): Promise<void> {
    await this.request(buildSetProgram(programId, segments), CMD_CONFIG, 0x03)
  }

  async lcdTest(mode: 'all' | 'leak'): Promise<void> {
    await this.send(buildLcdTest(mode))
  }

  async disableSleep(): Promise<void> {
    await this.send(buildDisableSleep())
  }

  async nudgeMotor(direction: 'left' | 'right'): Promise<void> {
    await this.send(buildNudgeMotor(direction))
  }

  async readHistoryCache(): Promise<number[]> {
    const frame = await this.request(buildGetHistoryCache(), CMD_MISC, 0x01)
    return parseHistoryCache(frame) ?? []
  }

  dispose() {
    this.disposed = true
    if (this.unsubscribe) void this.unsubscribe()
    this.pending.forEach((w) => {
      clearTimeout(w.timer)
      w.reject(new Error('连接已断开'))
    })
    this.pending.clear()
  }
}
