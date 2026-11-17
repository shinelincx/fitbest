import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as hyrox from '../../hyrox-trainer/src/api'
import * as btwe from '../../btwe-trainer/src/api'
import * as hyroxDevice from '../../hyrox-trainer/src/api/deviceSync'
import * as btweDevice from '../../btwe-trainer/src/api/deviceSync'
import { setTokens } from '../../race-trainer-shared/client'

const apps = [
  { app: 'hyrox', records: hyrox, device: hyroxDevice },
  { app: 'btwe', records: btwe, device: btweDevice },
] as const
const userId = 'alice'
const token = 'test.' + Buffer.from(JSON.stringify({ sub: userId })).toString('base64url') + '.test'
const start = '2026-11-17T03:00:00.000Z'
const session = { id: 'local-first', date: start.slice(0, 10), startedAt: start, completed: false,
  planId: 'plan', totalTime: 90, distanceM: 200, moduleTimes: [90], runSplit: [90], notes: '本机备注' }
const cloudRecord = { id: 'cloud-row', clientKey: session.id, startedAt: start, createdAt: start, completed: false,
  planId: 'plan', totalTimeSec: 90, distanceM: 230, moduleTimes: [90], runSplits: [90] }

const network = { onLine: false }
beforeEach(() => {
  network.onLine = false
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('navigator', network)
  setTokens(token, 'refresh')
})
afterEach(() => vi.unstubAllGlobals())

describe.each(apps)('$app', ({ app, records, device }) => {
  it('历史请求在训练上传确认前发出时，不会用过期列表移除刚同步的本机记录', async () => {
    await records.saveSession(session)
    const historyResponse = Promise.withResolvers<Response>()
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/page?')) return historyResponse.promise
      return Promise.resolve(Response.json({ id: 'cloud-row' }))
    }))
    network.onLine = true
    const loading = records.fetchHistory()
    await records.flushOutbox()
    historyResponse.resolve(Response.json({ items: [], nextCursor: '' }))
    expect(await loading).toContainEqual(expect.objectContaining({ id: session.id, cloudId: 'cloud-row' }))
    expect(await records.fetchSessions()).toContainEqual(expect.objectContaining({ id: session.id }))
  })

  it('离线删除同时移出训练和设备上传队列，删除意图复网后可补传', async () => {
    const send = vi.fn(async () => Response.json({ id: session.id }))
    vi.stubGlobal('fetch', send)
    await records.saveSession(session)
    await device.syncDeviceSession({
      clientSessionId: session.id, app, mode: 'training', startedAt: start, quality: 'partial',
      device: { serialNo: 'band', kind: 'band' }, durationSec: 90, distanceM: 200, segments: [],
    })
    await records.deleteSession(session.id)

    expect(await records.fetchHistory()).toEqual([])
    expect(device.pendingDeviceCount(userId)).toBe(0)
    expect(send).not.toHaveBeenCalled()
    expect(localStorage.getItem(`${app}:record-deletions:${userId}`)).toContain(session.id)

    network.onLine = true
    await Promise.all([records.flushDeletions(), records.flushOutbox(), device.flushDeviceOutbox()])
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('/me/training-records/deletions'),
      expect.objectContaining({ body: JSON.stringify({ app, clientId: session.id }) }),
    )
    expect(localStorage.getItem(`${app}:record-deletions:${userId}`)).toBe('[]')
  })

  it('翻完云端历史后按训练 ID 合并本地副本，离线仍能读取缓存', async () => {
    await records.saveSession(session)
    const send = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [cloudRecord], nextCursor: 'next' }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...cloudRecord, id: 'server-only', clientKey: null }], nextCursor: '' }))
    vi.stubGlobal('fetch', send)
    network.onLine = true

    const history = await records.fetchHistory()
    expect(history).toHaveLength(2)
    expect(history).toContainEqual(expect.objectContaining({ id: session.id, distanceM: 230, notes: '本机备注' }))
    expect(history).toContainEqual(expect.objectContaining({ id: 'server-only', cloudId: 'server-only' }))
    expect(send.mock.calls[1][0]).toContain(`app=${app}&cursor=next`)
    network.onLine = false
    expect(await records.fetchHistory()).toEqual(history)
    await records.deleteSession('server-only', 'server-only')
    expect((await records.fetchHistory()).map(({ id }) => id)).toEqual([session.id])
  })

  it('报名失败保留原状态，收到服务端确认后才变更，同时保留进行中赛事', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: '该赛事暂未开放报名' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ registered: true }))
      .mockResolvedValueOnce(Response.json({ registered: false }))
      .mockResolvedValueOnce(Response.json([
        { id: 'during', title: '进行中', status: 'published', startAt: '2026-11-17T00:00:00Z', endAt: '2026-11-18T00:00:00Z' },
        { id: 'past', title: '已结束', status: 'published', startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-02T00:00:00Z' },
        { id: 'draft', title: '未开放', status: 'draft', startAt: '2026-11-18T00:00:00Z' },
      ]))
    vi.stubGlobal('fetch', send)
    await expect(records.toggleRaceRegistration('event')).rejects.toThrow('该赛事暂未开放报名')
    expect(localStorage.getItem(`${app}:registered-races:${userId}`)).toBeNull()
    expect(await records.toggleRaceRegistration('event')).toBe(true)
    expect(await records.toggleRaceRegistration('event')).toBe(false)
    expect(send.mock.calls.map(([, init]) => init.method)).toEqual(['POST', 'POST', 'DELETE'])
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-17T03:00:00Z'))
    try {
      expect((await records.fetchRaces()).map(({ status }) => status)).toEqual(['in_progress', 'past', 'upcoming'])
    } finally {
      now.mockRestore()
    }
  })
})
