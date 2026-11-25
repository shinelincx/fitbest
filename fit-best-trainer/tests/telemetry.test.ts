import { describe, expect, it } from 'vitest'
import {
  parseHeartRateData,
  parseClimberData,
  parseCrossTrainerData,
  parseIndoorBikeData,
  parseRowerData,
  parseTreadmillData,
} from '../src/ble/ftms'
import { parsePinPacket } from '../src/ble/pin'
import { parsePrivateTreadmillCountdown, parsePrivateTreadmillData, parsePrivateTreadmillLimits, privateTreadmillControl, privateTreadmillSetTargets, selectPrivateTreadmillCharacteristics } from '../src/ble/privateTreadmill'
import { parseFtmsTreadmillRange, sendFtmsControl } from '../src/ble/ftmsControl'
import { applyTreadmillCounterOffsets, formatTreadmillPace, resumeTreadmillCounters } from '../src/ble/treadmillCounters'
import { intervalProgress, trainingGoal } from '../src/utils/trainingGoals'
import { matchBleRule, type MachineNavigation } from '../src/api/machineNavigation'
import { parsePrivateCardioPacket, privateCardioControl, privateCardioResistance } from '../src/ble/privateCardio'

const packet = (...bytes: number[]) => new Uint8Array(bytes)

it('按优先级匹配服务端规则并保留手动选择的机型', () => {
  const config: MachineNavigation = { machineTypes: [], resistanceDisabledPatterns: [], bleRules: [
    { machineType: 'ski', match: 'contains', patterns: ['S7'], preferredProtocol: 'FTMS', priority: 20 },
    { machineType: 'treadmill', match: 'exact', patterns: ['YJ01-S7Pro-000007'], preferredProtocol: 'PRIVATE', priority: 10 },
    { machineType: 'ski', match: 'prefix', patterns: ['kpower-'], preferredProtocol: 'FTMS', priority: 30 },
  ] }
  expect(matchBleRule(config, ' yj01-s7pro-000007 ')?.preferredProtocol).toBe('PRIVATE')
  expect(matchBleRule(config, 'YJ01-S7Pro-000007', 'ski')?.machineType).toBe('ski')
  expect(matchBleRule(config, 'Kpower-00028')?.preferredProtocol).toBe('FTMS')
  expect(matchBleRule(config, 'unknown')).toBeUndefined()
})

it('用本次运动累计值推进距离、时间和间歇目标', () => {
  const config = { work: 30, rest: 10, rounds: 2 }
  expect(intervalProgress(30, config)).toMatchObject({ phase: 'rest', remain: 10, round: 1 })
  expect(intervalProgress(40, config)).toMatchObject({ phase: 'work', remain: 30, round: 2 })
  expect(intervalProgress(80, config)).toEqual({ phase: 'rest', remain: 0, round: 2, total: 80 })
  expect(trainingGoal('interval', 80, 0, 60, 1000, 80).reached).toBe(true)
  expect(trainingGoal('time', 59, 1200, 60, 1000, 80).reached).toBe(false)
  expect(trainingGoal('distance', 20, 1000, 60, 1000, 80)).toMatchObject({ progress: 100, reached: true })
})

it('读取 FTMS 调速和有符号坡度范围及步长', () => {
  expect(parseFtmsTreadmillRange(packet(80, 0, 64, 6, 10, 0), 'speed')).toEqual({ min: 0.8, max: 16, step: 0.1 })
  expect(parseFtmsTreadmillRange(packet(236, 255, 200, 0, 5, 0), 'incline')).toEqual({ min: -2, max: 20, step: 0.5 })
})

it('恢复后从暂停累计值继续，排除倒计时阶段的差值和器械归零', () => {
  const before = { elapsedTime: 19, distance: 120, calories: 6, strokeCount: 36 }
  const resumed = { elapsedTime: 20, distance: 1, calories: 0, strokeCount: 37 }
  const offsets = resumeTreadmillCounters(before, resumed, {})
  expect(applyTreadmillCounterOffsets(resumed, offsets)).toEqual(before)
  expect(applyTreadmillCounterOffsets({ elapsedTime: 22, distance: 6, calories: 1, strokeCount: 41 }, offsets))
    .toEqual({ elapsedTime: 21, distance: 125, calories: 7, strokeCount: 40 })
  expect(applyTreadmillCounterOffsets(resumed, resumeTreadmillCounters({}, resumed, {})))
    .toEqual({ elapsedTime: 0, distance: 0, calories: 0, strokeCount: 0 })
})

it('用总分钟和秒显示每公里配速', () => {
  expect(formatTreadmillPace(3600 / 6)).toBe('10:00')
  expect(formatTreadmillPace(3600 / 0.8)).toBe('75:00')
  expect(formatTreadmillPace(Infinity)).toBe('—')
})

it('FTMS 控制权被拒绝后不发送启动指令', async () => {
  let receive: (bytes: Uint8Array) => void = () => undefined
  const sent: number[][] = []
  await expect(sendFtmsControl({
    async startNotifications(callback) { receive = callback; return () => undefined },
    async stopNotifications() {},
    async writeWithoutResponse() { throw new Error('Unexpected write without response') },
    async writeWithResponse(bytes) {
      sent.push(Array.from(bytes))
      receive(packet(0x80, bytes[0], 0x05))
    },
  }, [[0x00], [0x07]])).rejects.toThrow('FTMS control rejected')
  expect(sent).toEqual([[0x00]])
})

describe('NewAiFitbest 跑步机私有协议', () => {
  it('识别实机启动和继续时的三秒倒计时', () => {
    const frames = ['025102035003', '025102025103', '025102015203', '025102005303', '025106025503']
    expect(frames.map((frame) => parsePrivateTreadmillCountdown(Buffer.from(frame, 'hex'))))
      .toEqual([3, 2, 1, undefined, undefined])
  })
  it('读取器械速度和坡度范围，并按旧版生成调节帧', () => {
    expect(parsePrivateTreadmillLimits(packet(2, 0x50, 2, 160, 10, 0, 0, 3))).toEqual({ speed: { min: 1, max: 16 } })
    expect(parsePrivateTreadmillLimits(packet(2, 0x50, 3, 15, 0xfe, 0, 3))).toEqual({ incline: { min: -2, max: 15 } })
    expect(privateTreadmillSetTargets(6.5, -1)).toEqual(packet(2, 0x53, 2, 65, 255, 239, 3))
  })
  it('生成与旧版一致的启停帧', () => {
    expect(privateTreadmillControl('start')).toEqual(packet(2, 0x53, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0x52, 3))
    expect(privateTreadmillControl('stop')).toEqual(packet(2, 0x53, 3, 0x50, 3))
    expect(privateTreadmillControl('pause')).toEqual(packet(2, 0x53, 0x0a, 0x59, 3))
    expect(privateTreadmillControl('resume')).toEqual(packet(2, 0x53, 9, 0x5a, 3))
  })
  it('根据通知和写入属性发现通道，并优先选用兼容的标准私有 UUID', () => {
    const notify = { uuid: 'fff3', properties: { indicate: true } }
    const write = { uuid: 'fff4', properties: { write: true } }
    const preferredWrite = { uuid: 'FFF2', properties: { writeWithoutResponse: true } }
    expect(selectPrivateTreadmillCharacteristics([notify, write])).toEqual({ notify, write })
    expect(selectPrivateTreadmillCharacteristics([notify, write, preferredWrite])).toEqual({ notify, write: preferredWrite })
    expect(selectPrivateTreadmillCharacteristics([notify])).toBeNull()
  })
  it('按旧版字段解码运动状态和扩展距离', () => {
    const data = packet(2, 0x51, 3, 85, 0, 44, 1, 123, 0x80, 199, 0, 100, 0, 132, 0, 0, 3)
    expect(parsePrivateTreadmillData(data)).toEqual({
      speed: 8.5, incline: 0, elapsedTime: 300, distance: 1230, calories: 19.9, strokeCount: 100, heartRate: 132,
    })
    expect(parsePrivateTreadmillData(data.subarray(0, 16))).toBeNull()
  })
})

describe('FTMS 与心率协议', () => {
  it('解析跑步机速度、距离和器械时间', () => {
    const data = packet(0x04, 0x04, 0xd2, 0x04, 0x01, 0x02, 0x03, 0x2c, 0x01)
    expect(parseTreadmillData(data)).toEqual({ speed: 12.34, distance: 0x030201, elapsedTime: 300 })
  })

  it('解析 TF04 实机通知的字段布局和三字节步数扩展', () => {
    const captured = Buffer.from('9C25000000000000000000000000000000000000000000000000', 'hex')
    expect(parseTreadmillData(captured)).toEqual({ speed: 0, distance: 0, incline: 0, calories: 0, heartRate: 0, elapsedTime: 0, strokeCount: 0 })
    const moving = Buffer.from(captured)
    moving.writeUInt16LE(650, 2)
    moving.writeUIntLE(140, 4, 3)
    moving.writeUInt16LE(12, 15)
    moving[20] = 126
    moving.writeUInt16LE(85, 21)
    moving.writeUIntLE(102, 23, 3)
    expect(parseTreadmillData(moving)).toEqual({ speed: 6.5, distance: 140, incline: 0, calories: 12, heartRate: 126, elapsedTime: 85, strokeCount: 102 })
  })

  it('解析划船机小端字段、有符号功率和卡路里', () => {
    const data = packet(
      0x2c, 0x09,
      0x3c, 0x32, 0x00,
      0xa0, 0x0f, 0x00,
      0x78, 0x00,
      0xe7, 0xff,
      0x7b, 0x00, 0x00, 0x00, 0x00,
      0x58, 0x02,
    )
    expect(parseRowerData(data)).toEqual({
      cadence: 30,
      strokeCount: 50,
      pace: 120,
      speed: 15,
      distance: 4000,
      power: -25,
      calories: 123,
      elapsedTime: 600,
    })
  })

  it('按 Kpower-00028 实机通知解析划桨字段和累积读数', () => {
    const data = Buffer.from('7C0B92C8020F24005B000900D401D301840376077300A206', 'hex')
    expect(parseRowerData(data)).toMatchObject({
      cadence: 73,
      strokeCount: 712,
      distance: 9231,
      pace: 91,
      power: 468,
      calories: 900,
      elapsedTime: 1698,
    })
  })

  it('保持动感单车字段顺序并解析功率', () => {
    const data = packet(
      0x74, 0x0b,
      0xd0, 0x07,
      0x64, 0x00,
      0x59, 0x01, 0x00,
      8,
      0xc8, 0x00,
      0x58, 0x00, 0, 0, 0,
      123,
      0x2a, 0x00,
    )
    expect(parseIndoorBikeData(data)).toEqual({
      speed: 20, cadence: 50, resistance: 8, heartRate: 123,
      distance: 345,
      power: 200,
      calories: 88,
      elapsedTime: 42,
    })
  })

  it('分别解析椭圆机、楼梯机和踏步机的独立特征', () => {
    expect(parseCrossTrainerData(packet(0x0c, 0x21, 0, 0xe8, 3, 100, 0, 0, 60, 0, 50, 0, 120, 0, 20, 0)))
      .toEqual({ speed: 10, distance: 100, cadence: 60, power: 120, elapsedTime: 20 })
    expect(parseClimberData(packet(0x1a, 1, 5, 0, 60, 0, 12, 0, 30, 0, 20, 0)))
      .toEqual({ floors: 5, cadence: 60, elevationGain: 12, strideCount: 30, elapsedTime: 20 })
    expect(parseClimberData(packet(0x02, 0, 5, 0, 80, 0, 60, 0), true))
      .toEqual({ floors: 5, strokeCount: 80, cadence: 60 })
  })

  it('解码旧版 ThinkFit 有氧数据并编码启停与阻力指令', () => {
    expect(parsePrivateCardioPacket(packet(2, 0x42, 2, 0xd0, 7, 4, 52, 0, 120, 0xb0, 4, 0, 3)))
      .toEqual({ metrics: { speed: 20, resistance: 4, cadence: 52, heartRate: 120, power: 120 } })
    expect(parsePrivateCardioPacket(packet(2, 0x43, 1, 60, 0, 20, 0x80, 100, 0, 32, 0, 0, 3)))
      .toEqual({ metrics: { elapsedTime: 60, distance: 200, calories: 10, strokeCount: 32 } })
    expect(privateCardioControl('pause')).toEqual(packet(2, 0x44, 3, 0x47, 3))
    expect(privateCardioResistance(8)).toEqual(packet(2, 0x44, 5, 8, 0, 0x49, 3))
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
