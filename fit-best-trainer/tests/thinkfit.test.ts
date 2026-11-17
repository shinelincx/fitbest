import { describe, expect, it } from 'vitest'
import {
  buildDisableSleep,
  buildGetConfig,
  buildLcdTest,
  buildNudgeMotor,
  buildSetBleName,
  buildSetConfig,
  buildSetProgram,
  ThinkFitConsole,
  decodeFrame,
  encodeFrame,
  parseBleName,
  parseDeviceInfo,
  parseHistoryCache,
  parseWriteStatus,
  type TfDeviceInfo,
} from '../src/ble/thinkfit'

const bytes = (value: Uint8Array) => Array.from(value)

describe('ThinkFit V1.0.2 协议基线', () => {
  it('组帧并校验 FCS', () => {
    expect(bytes(buildGetConfig())).toEqual([0x02, 0xcc, 0x02, 0xce, 0x03])
    expect(bytes(buildLcdTest('all'))).toEqual([0x02, 0xcd, 0x01, 0xcc, 0x03])
    expect(bytes(buildNudgeMotor('right'))).toEqual([0x02, 0xcf, 0x03, 0x02, 0xce, 0x03])
    expect(bytes(buildDisableSleep())).toEqual([0x02, 0xcf, 0x02, 0xcd, 0x03])
  })

  it('拒绝帧头、帧尾和校验错误的包', () => {
    expect(decodeFrame(new Uint8Array([0x02, 0xcc]))).toBeNull()
    expect(decodeFrame(new Uint8Array([0x01, 0xcc, 0x02, 0xce, 0x03]))).toBeNull()
    expect(decodeFrame(new Uint8Array([0x02, 0xcc, 0x02, 0x00, 0x03]))).toBeNull()
  })

  it('设备配置 15 字节小端往返解析', () => {
    const info: TfDeviceInfo = {
      brandId: 1,
      typeId: 2,
      model: 0x1234,
      radius: 20,
      wheelRatio: 36,
      hallCount: 4,
      maxFriction: 5000,
      unitType: 0,
      vrMax: 900,
      vrMin: 100,
      vrDirection: 1,
    }
    const decoded = decodeFrame(buildSetConfig(info))
    expect(decoded).not.toBeNull()
    expect(decoded!.sub).toBe(0x01)
    expect(decoded!.data).toHaveLength(15)
    expect(parseDeviceInfo({ ...decoded!, sub: 0x02 })).toEqual(info)
  })

  it('解析名称、历史缓存和写入状态', () => {
    const name = decodeFrame(encodeFrame(0xce, 0x02, Array.from(new TextEncoder().encode('TF-A1'))))!
    expect(parseBleName(name)).toBe('TF-A1')
    const history = decodeFrame(encodeFrame(0xcf, 0x01, [9, 8, 7]))!
    expect(parseHistoryCache(history)).toEqual([9, 8, 7])
    const write = decodeFrame(encodeFrame(0xce, 0x01, [1]))!
    expect(parseWriteStatus(write)).toBe(true)
  })

  it('名称限制 15 字节，程式按时间速度坡度排列', () => {
    const name = decodeFrame(buildSetBleName('1234567890abcdefXYZ'))!
    expect(name.data).toHaveLength(15)
    const program = decodeFrame(buildSetProgram(2, [{ time: 60, speed: 8, incline: 3 }]))!
    expect(Array.from(program.data)).toEqual([2, 60, 8, 3])
  })

  it('通过通用传输订阅通知并配对响应', async () => {
    let listener: ((data: Uint8Array) => void) | undefined
    const writes: number[][] = []
    const client = new ThinkFitConsole({
      subscribe: async (callback) => {
        listener = callback
        return () => { listener = undefined }
      },
      writeWithoutResponse: async (data) => {
        writes.push(Array.from(data))
        listener?.(encodeFrame(0xce, 0x02, Array.from(new TextEncoder().encode('TF-NATIVE'))))
      },
    })

    await expect(client.getBleName()).resolves.toBe('TF-NATIVE')
    expect(writes).toEqual([[0x02, 0xce, 0x02, 0xcc, 0x03]])
    client.dispose()
    expect(listener).toBeUndefined()
  })
})
