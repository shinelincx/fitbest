import { describe, expect, it } from 'vitest'
import {
  parseHeartRateData,
  parseIndoorBikeData,
  parseRowerData,
  parseTreadmillData,
} from '../src/ble/ftms'
import { parsePinPacket } from '../src/ble/pin'

const packet = (...bytes: number[]) => new Uint8Array(bytes)

describe('FTMS 与心率协议', () => {
  it('解析跑步机速度、距离和器械时间', () => {
    const data = packet(0x05, 0x80, 0xd2, 0x04, 0x01, 0x02, 0x03, 0x2c, 0x01)
    expect(parseTreadmillData(data)).toEqual({ speed: 12.34, distance: 0x030201, elapsedTime: 300 })
  })

  it('解析划船机小端字段、有符号功率和卡路里', () => {
    const data = packet(
      0xa5, 0x82,
      0x3c, 0x00,
      0xac, 0x0d,
      0xa0, 0x0f, 0x00,
      0xe7, 0xff,
      0x7b, 0x00,
      0x58, 0x02,
    )
    expect(parseRowerData(data)).toEqual({
      cadence: 30,
      speed: 3.5,
      distance: 4000,
      power: -25,
      calories: 123,
      elapsedTime: 600,
    })
  })

  it('保持动感单车字段顺序并解析功率', () => {
    const data = packet(
      0x14, 0x94,
      0x64, 0x00,
      0x59, 0x01, 0x00,
      0xc8, 0x00,
      0x58, 0x00,
      0x2a, 0x00,
    )
    expect(parseIndoorBikeData(data)).toEqual({
      cadence: 50,
      distance: 345,
      power: 200,
      calories: 88,
      elapsedTime: 42,
    })
  })

  it('解析 8 位和 16 位心率', () => {
    expect(parseHeartRateData(packet(0x00, 72))).toEqual({ heartRate: 72 })
    expect(parseHeartRateData(packet(0x01, 0x2c, 0x01))).toEqual({ heartRate: 300 })
  })

  it('短包不抛异常，且只返回完整字段', () => {
    expect(parseTreadmillData(packet(0x01))).toEqual({})
    expect(parseTreadmillData(packet(0x01, 0x00, 0xd2))).toEqual({})
    expect(parseHeartRateData(packet(0x01, 0x2c))).toEqual({})
    expect(parseRowerData(packet())).toEqual({})
  })

  it('遵守 TypedArray 的 byteOffset 和 byteLength', () => {
    const source = packet(0xff, 0xff, 0x00, 0x48, 0xee)
    const view = new DataView(source.buffer, 2, 2)
    expect(parseHeartRateData(view)).toEqual({ heartRate: 72 })
  })
})

describe('FITBEST 智能插销协议', () => {
  it('解析档位、次数、幅度和运动阶段', () => {
    expect(parsePinPacket(packet(4, 5, 0, 200, 0, 1))).toEqual({
      plate: 4,
      reps: 5,
      romCm: 20,
      phase: 'pull',
    })
    expect(parsePinPacket(packet(2, 1, 0, 50, 0, 2))?.phase).toBe('return')
    expect(parsePinPacket(packet(2, 1, 0, 50, 0, 9))?.phase).toBe('idle')
  })

  it('拒绝短包并正确处理子数组边界', () => {
    expect(parsePinPacket(packet(1, 2, 3))).toBeNull()
    const source = packet(0xff, 0xff, 7, 12, 0, 100, 0, 1, 0xff)
    expect(parsePinPacket(source.subarray(2, 8))).toEqual({
      plate: 7,
      reps: 12,
      romCm: 10,
      phase: 'pull',
    })
  })
})
