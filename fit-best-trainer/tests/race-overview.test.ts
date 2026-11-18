import { afterEach, expect, it, vi } from 'vitest'
import { fetchActivity } from '../src/utils/activity'

const transport = vi.hoisted(() => ({ hasAccessFor: vi.fn(), request: vi.fn() }))
vi.mock('../src/api/client', () => transport)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('合并赛训补传和跨设备记录，删除后离线也不复现，其他账号不可见', async () => {
  const data = new Map<string, string>()
  const network = { onLine: true }
  vi.stubGlobal('navigator', network)
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  })
  let owner = 'owner-a'
  let exists = true
  const date = '2026-11-18T10:12:00Z'
  transport.hasAccessFor.mockImplementation((expected) => expected === owner)
  transport.request.mockImplementation(async (path: string, options) => {
    const query = new URLSearchParams(path.split('?')[1])
    if (query.get('app') === 'btwe' || options.userId !== 'owner-a') return { items: [], nextCursor: '' }
    if (query.get('cursor')) {
      return { items: [{ id: 'from-other-device', clientKey: null, startedAt: date, totalTimeSec: 600, distanceM: 1200 }], nextCursor: '' }
    }
    return {
      items: exists ? [{ id: 'cloud-id', clientKey: 'same-id', startedAt: date, totalTimeSec: 900, distanceM: 1500 }] : [],
      nextCursor: 'next-page',
    }
  })
  data.set('hyrox:sessions:owner-a', JSON.stringify([{ id: 'same-id', date, totalTime: 899, distanceM: 1500 }]))
  data.set('hyrox:record-outbox:owner-a', JSON.stringify([{ clientId: 'same-id' }]))

  const read = () => fetchActivity(owner, true, new AbortController().signal)
  const initial = await read()
  expect(initial.failed).toBe(false)
  expect(initial.items.map((entry) => [entry.id, entry.durationSec])).toEqual([['same-id', 900], ['from-other-device', 600]])

  data.delete('hyrox:record-outbox:owner-a')
  exists = false
  expect((await read()).items.map((entry) => entry.id)).toEqual(['from-other-device'])
  network.onLine = false
  expect((await read()).items.map((entry) => entry.id)).toEqual(['from-other-device'])
  data.set('hyrox:record-deletions:owner-a', JSON.stringify([{ id: 'from-other-device' }]))
  expect((await read()).items).toEqual([])
  owner = 'owner-b'
  expect((await read()).items).toEqual([])
})
