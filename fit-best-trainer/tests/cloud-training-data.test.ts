import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  ApiError: class extends Error { code = 500 },
}))
vi.mock('../src/api/client', () => transport)
vi.mock('../src/utils/auth', () => ({
  currentUserId: () => 'account-a',
  isCloudAccount: () => true,
  isCloudAuthed: () => true,
}))

const workout = {
  id: 'machine-record',
  date: '2026-11-17T00:00:00.000Z',
  machine: 'rower',
  mode: 'distance',
  durationSec: 150,
  distanceM: 790,
  avgSpeed: 15,
  avgHr: 142,
  calories: 32,
  cadence: 28,
  power: 128,
  target: 1000,
  completed: false,
} as const

beforeEach(() => {
  const records = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  })
  vi.stubGlobal('navigator', { onLine: true })
  vi.resetModules()
  transport.request.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

it('导出走完云端分页，同一记录只保留一份', async () => {
  const cursor = '2026-11-17T00:00:00.000Z~ffffffff-ffff-4fff-8fff-ffffffffffff'
  const row = { id: 'server-id', clientId: workout.id, machineType: workout.machine, mode: workout.mode,
    startedAt: workout.date, durationSec: 150, distanceM: 790, calories: 32, completed: false }
  localStorage.setItem('fitbest:sessions:account-a', JSON.stringify([workout]))
  transport.request.mockResolvedValueOnce({ items: [row], nextCursor: cursor })
    .mockResolvedValueOnce({ items: [{ ...row, id: 'earlier', clientId: null }], nextCursor: null })
  const api = await import('../src/api')

  expect((await api.fetchSessions({ requireCloud: true })).map((s) => s.id))
    .toEqual([workout.id, 'earlier'])
  const nextUrl = new URL(transport.request.mock.calls[1][0], 'https://local.test')
  expect(nextUrl.searchParams.get('cursor')).toBe(cursor)
})

it('部分页请求失败时，普通历史可显示已读数据，完整备份会报错', async () => {
  const api = await import('../src/api')
  transport.request.mockResolvedValueOnce({ items: [], nextCursor: 'next' }).mockRejectedValueOnce(new Error('offline'))
  await expect(api.fetchSessions({ requireCloud: true })).rejects.toThrow('offline')
  transport.request.mockRejectedValueOnce(new Error('offline'))
  expect(await api.fetchSessions()).toEqual([])
})

it('云端拒绝删除或清空时保留记录，确认后才清空本机副本', async () => {
  const api = await import('../src/api')
  localStorage.setItem('fitbest:sessions:account-a', JSON.stringify([workout]))
  localStorage.setItem('fitbest:sessions:account-b', JSON.stringify([{ ...workout, id: 'other-account' }]))
  transport.request.mockRejectedValueOnce(new Error('offline'))
  await expect(api.deleteSession(workout.id)).rejects.toThrow('offline')
  expect(api.readAllSessions()).toEqual([workout])

  transport.request.mockResolvedValueOnce({ ok: true })
  await api.deleteSession(workout.id)
  expect(api.readAllSessions()).toEqual([])

  const offline = { ...workout, syncState: 'pending' }
  localStorage.setItem('fitbest:sessions:account-a', JSON.stringify([offline]))
  transport.request.mockResolvedValueOnce({ deleted: 2 })
  await api.clearSessions()
  expect(transport.request).toHaveBeenLastCalledWith('/sessions/all', expect.objectContaining({
    method: 'DELETE', userId: 'account-a',
    body: { pendingIds: [workout.id], machineTypes: expect.arrayContaining(['rower', 'treadmill']) },
  }))
  expect(api.readAllSessions()).toEqual([])
  expect(localStorage.getItem('fitbest:sessions:account-b')).toContain('other-account')
})

it('导入验证备份记录，同一份备份重试使用同一恢复键', async () => {
  const api = await import('../src/api')
  expect(() => api.parseSessionBackup([{ ...workout, machine: 'unknown' }])).toThrow()
  const sanitized = api.parseSessionBackup([{ ...workout, syncState: 'failed' }, workout])
  expect(sanitized).toHaveLength(1)
  expect(sanitized[0].syncState).toBeUndefined()
  transport.request.mockResolvedValue({ id: 'server-id' })
  api.importSessions(sanitized)
  await api.flushMachineSessions()
  api.importSessions(sanitized)
  await api.flushMachineSessions()
  expect(transport.request).toHaveBeenCalledTimes(2)
  for (const call of transport.request.mock.calls) {
    expect(call[0]).toBe('/sessions/restore')
    expect(call[1].headers['Idempotency-Key']).toBe(workout.id)
  }
  expect(api.readAllSessions()).toHaveLength(1)
})
