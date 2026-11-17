import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ftmsMeasurement,
  parseHeartRateData,
  startFtms,
  stopFtms,
} from '../../race-trainer-shared/ftms'
import type { DeviceSegmentInput } from '../../race-trainer-shared/deviceProtocol'

const alice = ['test', Buffer.from(JSON.stringify({ sub: 'alice' })).toString('base64url'), 'test'].join('.')
const bob = ['test', Buffer.from(JSON.stringify({ sub: 'bob' })).toString('base64url'), 'test'].join('.')

const races = [
  {
    app: 'hyrox',
    completed: true,
    modules: 8,
    distance: 1000,
    stations: [{ type: 'rower', duration: 120, distance: 1000 }],
    load: async () => ({
      records: await import('../../hyrox-trainer/src/api'),
      devices: await import('../../hyrox-trainer/src/api/deviceSync'),
      auth: await import('../../hyrox-trainer/src/api/client'),
    }),
  },
  {
    app: 'btwe',
    completed: false,
    modules: 4,
    distance: 800,
    stations: [{ type: 'bike', duration: 70, distance: 500 }, { type: 'rep', duration: 50, distance: 15 }],
    load: async () => ({
      records: await import('../../btwe-trainer/src/api'),
      devices: await import('../../btwe-trainer/src/api/deviceSync'),
      auth: await import('../../btwe-trainer/src/api/client'),
    }),
  },
] as const

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(races)('$app', ({ app, completed, distance, load, modules, stations }) => {
  it('断网训练结束后保留完整记录，重载及复网时用原账号和原 ID 补传', async () => {
    const api = process.env.FITBEST_RACE_SYNC_APP === app ? process.env.FITBEST_SYNC_API_URL : undefined
    const token = api ? process.env.FITBEST_SYNC_ACCESS! : alice
    const serial = api ? process.env.FITBEST_SYNC_DEVICE_SERIAL! : 'BAND-FIXTURE'
    const storage = new Map([['fitbest:band-serial', JSON.stringify(serial)]])
    const network = { onLine: false }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    vi.stubGlobal('navigator', network)
    vi.stubGlobal('window', new EventTarget())
    vi.resetModules()
    const { auth, devices, records } = await load()
    const { buildTrainingResult, capturePhaseSegment } = await import('../../race-trainer-shared/trainingResult')
    const calls = new Map<string, Array<{ body: unknown; receipt: { id: string; trainingRecordId?: string } }>>()
    const fetchApi = globalThis.fetch
    const send = vi.fn(async (url: string, init: RequestInit) => {
      expect(network.onLine).toBe(true)
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${token}` })
      const path = new URL(url, 'http://example.test').pathname
      const route = path.slice(path.lastIndexOf('/') + 1)
      const body: unknown = JSON.parse(String(init.body))
      const attempts = calls.get(route) ?? []
      const response = api
        ? await fetchApi(`${api}/me/${route}`, init)
        : Response.json(route === 'training-records' ? { id: 'record' } : { id: 'device', trainingRecordId: 'record' })
      if (!response.ok) throw new Error(`${route} HTTP ${response.status}: ${await response.text()}`)
      const { id, trainingRecordId } = await response.clone().json()
      attempts.push({ body, receipt: { id, trainingRecordId } })
      calls.set(route, attempts)
      if (attempts.length === 1) throw new Error('服务端已处理，连接在返回确认前断开')
      return response
    })
    vi.stubGlobal('fetch', send)

    auth.setTokens(token, 'owner-refresh')
    const userId = auth.currentUserId()!
    const segments: DeviceSegmentInput[] = []
    const totalTime = modules * 420
    const startedMs = Date.now() - totalTime * 1000
    const startedAt = new Date(startedMs).toISOString()
    const elapsedNow = vi.spyOn(Date, 'now')
    let elapsed = 0
    for (let i = 0; i < modules; i++) {
      for (const phase of [{ type: 'treadmill', duration: 300, distance }, ...stations]) {
        elapsed += phase.duration
        elapsedNow.mockReturnValue(startedMs + elapsed * 1000)
        const segment = capturePhaseSegment(
          segments.length + 1,
          phase.type === 'treadmill' ? 'treadmill' : 'station',
          phase.type,
          { connected: true, name: phase.type, metrics: { elapsedTime: phase.duration, distance: phase.distance, calories: 20 } },
          startedMs,
        )
        if (!segment) throw new Error('缺少训练分段')
        segments.push(segment)
      }
    }
    elapsedNow.mockRestore()
    const result = buildTrainingResult(app, {
      planId: `${app}-test-plan`,
      completed,
      totalTime,
      moduleTimes: Array<number>(modules).fill(420),
      runSplit: Array<number>(modules).fill(300),
    }, segments, [20, 140, 170, 251], startedAt)
    const { session, device } = result
    expect(session).toMatchObject({ startedAt, distanceM: modules * distance, avgHr: 155, maxHr: 170 })
    expect(device).toMatchObject({
      app, startedAt, distanceM: modules * distance, clientSessionId: session.id, avgHr: 155, maxHr: 170,
      quality: completed ? 'ok' : 'partial',
      closeReason: completed ? 'finish' : 'abort',
      metrics: { stations: modules * stations.length },
    })
    expect(device.segments.slice(0, segments.length)).toEqual(segments)
    expect(device.segments.at(-1)?.type).toBe(completed ? 'finish' : 'station')

    // 训练页的记录保存与手环入队入口。重复点击保留同一场和同一 ID。
    await records.saveSession(session, userId)
    await devices.syncDeviceSession(device, userId)
    await records.saveSession(session, userId)
    await devices.syncDeviceSession(device, userId)
    expect(devices.pendingDeviceCount(userId)).toBe(1)
    expect(await records.fetchSessions()).toHaveLength(1)
    expect(send).not.toHaveBeenCalled()

    auth.setTokens(bob, 'bob-refresh')
    vi.stubGlobal('window', new EventTarget())
    vi.resetModules()
    const reloaded = await load()
    expect(await reloaded.records.fetchSessions()).toEqual([])
    network.onLine = true
    window.dispatchEvent(new Event('online'))
    await Promise.all([reloaded.records.flushOutbox(), reloaded.devices.flushDeviceOutbox()])
    expect(send).not.toHaveBeenCalled()

    // 首次收到的网络结果失败，两条队列均保留。登录事件和多个 flush 共用同一任务。
    reloaded.auth.setTokens(token, 'owner-refresh')
    await Promise.all([reloaded.records.flushOutbox(), reloaded.devices.flushDeviceOutbox()])
    expect(send).toHaveBeenCalledTimes(2)
    expect(reloaded.devices.pendingDeviceCount(userId)).toBe(1)
    expect(reloaded.devices.getLastDeviceSync(userId)).toBeNull()
    expect(storage.get(`${app}:record-outbox:${userId}`)).toContain(session.id)

    window.dispatchEvent(new Event('online'))
    await Promise.all([reloaded.records.flushOutbox(), reloaded.devices.flushDeviceOutbox()])
    expect(send).toHaveBeenCalledTimes(4)
    expect(reloaded.devices.pendingDeviceCount(userId)).toBe(0)
    expect(reloaded.devices.getLastDeviceSync(userId)).not.toBeNull()
    expect(storage.get(`${app}:record-outbox:${userId}`)).toBe('[]')
    expect(await reloaded.records.fetchSessions()).toMatchObject([session])
    const summary = calls.get('training-records')!
    const telemetry = calls.get('device-sessions')!
    expect(summary[0]).toEqual(summary[1])
    expect(telemetry[0]).toEqual(telemetry[1])
    expect(summary[0].receipt.id).toEqual(expect.any(String))
    expect(summary[0].receipt.id).toBe(telemetry[0].receipt.trainingRecordId)
    expect(summary[0].body).toMatchObject({
      app, completed, startedAt, clientId: session.id, totalTimeSec: totalTime,
      distanceM: modules * distance, moduleTimes: session.moduleTimes, runSplits: session.runSplit,
      avgHr: 155, maxHr: 170,
    })
    expect(telemetry[0].body).toEqual(JSON.parse(JSON.stringify(device)))
  })
})

it('直接补传旧版赛事队列，坏记录不会阻塞后续记录或另一个赛事端', async () => {
  const payload = (app: 'hyrox' | 'btwe', clientId: string) => ({
    app, clientId, startedAt: '2026-11-16',
  })
  const legacyDevice = {
    clientSessionId: 'old-device',
    app: 'btwe',
    device: { serialNo: 'OLD-BAND', kind: 'band' },
    mode: 'training',
    startedAt: '2026-11-16T00:00:00.000Z',
    durationSec: 42,
    distanceM: 100,
    quality: 'partial',
    segments: [{ seq: 1, type: 'treadmill', durationSec: 42, distanceM: 100 }],
  }
  const legacyHyrox = [
    { clientId: 'bad', payload: payload('hyrox', 'bad') },
    { clientId: 'good', payload: payload('hyrox', 'good') },
  ]
  const legacyBtwe = [{ clientId: 'old-record', payload: payload('btwe', 'old-record') }]
  const storage = new Map([
    ['fitbest:access', alice],
    ['hyrox:record-outbox:alice', JSON.stringify(legacyHyrox)],
    ['btwe:record-outbox:alice', JSON.stringify(legacyBtwe)],
    ['btwe:device-outbox:alice', JSON.stringify([legacyDevice])],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('navigator', { onLine: true })
  const sent: unknown[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    sent.push(body)
    return body.clientId === 'bad' ? new Response(null, { status: 400 }) : Response.json({ id: 'persisted' })
  }))
  vi.resetModules()

  const hyrox = await races[0].load()
  await vi.waitFor(() => expect(storage.get('hyrox:record-outbox:alice')).toBe(JSON.stringify([legacyHyrox[0]])))
  expect(sent).toEqual(legacyHyrox.map((entry) => entry.payload))
  expect(storage.get('btwe:record-outbox:alice')).toBe(JSON.stringify(legacyBtwe))
  expect(storage.get('btwe:device-outbox:alice')).toBe(JSON.stringify([legacyDevice]))
  expect(hyrox.devices.pendingDeviceCount('alice')).toBe(0)

  const btwe = await races[1].load()
  await vi.waitFor(() => expect(storage.get('btwe:record-outbox:alice')).toBe('[]'))
  await vi.waitFor(() => expect(btwe.devices.pendingDeviceCount('alice')).toBe(0))
  expect(sent.slice(2)).toEqual(expect.arrayContaining([legacyBtwe[0].payload, legacyDevice]))
  expect(sent).toHaveLength(4)
})

function packet(...bytes: number[]) {
  const data = Uint8Array.of(0xff, 0xff, ...bytes, 0xff)
  return new DataView(data.buffer, 2, bytes.length)
}

it('两个赛事端共用的 BLE 解析器从特征值视图读取设备指标', () => {
  const treadmill = ftmsMeasurement('treadmill')
  const rower = ftmsMeasurement('rower')
  const bike = ftmsMeasurement('bike')
  expect([treadmill.uuid, rower.uuid, bike.uuid]).toEqual([0x2acd, 0x2ad1, 0x2ad2])
  expect(ftmsMeasurement('ski')).toEqual(rower)
  expect(treadmill.parse(packet(0x84, 0x05, 0xb0, 0x04, 0xe8, 0x03, 0, 0x15, 0, 0, 0, 0, 0x95, 0x2c, 0x01)))
    .toEqual({ speed: 12, distance: 1000, calories: 21, heartRate: 149, elapsedTime: 300 })
  expect(rower.parse(packet(0x2c, 0x08, 0x38, 0x10, 0, 0xf4, 0x01, 0, 0x7d, 0, 0xb4, 0, 0x78, 0)))
    .toEqual({ cadence: 28, speed: 4, distance: 500, power: 180, elapsedTime: 120 })
  expect(bike.parse(packet(0x54, 0x0b, 0xc4, 0x09, 0xa0, 0, 0xf4, 0x01, 0, 0xb4, 0, 0x18, 0, 0, 0, 0, 150, 0x46, 0)))
    .toEqual({ speed: 25, cadence: 80, distance: 500, power: 180, calories: 24, heartRate: 150, elapsedTime: 70 })
  expect(bike.parse(packet(0x01, 0x0a, 151, 0x46, 0))).toEqual({ heartRate: 151, elapsedTime: 70 })
  expect(parseHeartRateData(packet(0, 155))).toEqual({ heartRate: 155 })
  expect(parseHeartRateData(packet(1, 4, 1))).toEqual({ heartRate: 260 })
})

it('两个赛事端共用的 BLE 控制点按重置、停止和恢复流程发送指令', async () => {
  const control = new EventTarget() as EventTarget & { value: DataView }
  let resultCode = 0x01
  const writeValueWithResponse = vi.fn(async (data: Uint8Array) => {
    control.value = packet(0x80, data[0], resultCode)
    control.dispatchEvent(new Event('characteristicvaluechanged'))
  })
  const point = Object.assign(control, { writeValueWithResponse })
  await startFtms(point, true)
  await stopFtms(point)
  await startFtms(point, false)
  expect(writeValueWithResponse.mock.calls.map(([bytes]) => [...bytes]))
    .toEqual([[0x00], [0x01], [0x07], [0x08, 0x01], [0x00], [0x07]])
  resultCode = 0x04
  await expect(stopFtms(point)).rejects.toThrow('器械拒绝')
})
