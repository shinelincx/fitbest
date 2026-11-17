import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MachineSession } from '../src/types'

vi.mock('../src/utils/auth', () => ({
  currentUserId: () => 'account-a',
  isCloudAccount: () => true,
  isCloudAuthed: () => true,
}))

const transport = vi.hoisted(() => ({
  request: vi.fn(),
  ApiError: class extends Error { code = 500 },
}))
vi.mock('../src/api/client', () => transport)

const finished: MachineSession = {
  id: process.env.FITBEST_SYNC_CLIENT_ID ?? 'test-offline-machine',
  date: '2026-11-17T03:10:00.000Z',
  endedAt: '2026-11-17T03:16:30.000Z',
  machine: 'rower',
  mode: 'distance',
  durationSec: 390,
  distanceM: 1600,
  calories: 97,
  avgSpeed: 14.8,
  cadence: 25,
  power: 176,
  avgHr: 142,
  target: 2000,
  completed: false,
}

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  transport.request.mockReset().mockRejectedValue(new TypeError('offline'))
  vi.resetModules()
})

afterEach(() => vi.unstubAllGlobals())

it('断网结束训练后可以立即读取完整的本地记录', async () => {
  const api = await import('../src/api')

  await expect(api.saveSession(finished)).resolves.toBeDefined()
  expect(await api.fetchSessions()).toContainEqual(expect.objectContaining(finished))
})

it('复网后用同一幂等键重放，响应遗失也只保存一条完整记录', async () => {
  const connectivity = { onLine: false }
  vi.stubGlobal('navigator', connectivity)
  vi.stubGlobal('window', new EventTarget())
  const beforeReload = await import('../src/api')
  await beforeReload.saveSession(finished)
  await beforeReload.saveSession(finished)
  expect(transport.request).not.toHaveBeenCalled()
  expect(await beforeReload.fetchSessions()).toEqual([{ ...finished, syncState: 'pending' }])

  const baseUrl = process.env.FITBEST_SYNC_API_URL
  const persisted = new Map<string, Record<string, unknown>>()
  const sentKeys: string[] = []
  transport.request.mockImplementation(async (path: string, init: {
    method?: string
    headers?: Record<string, string>
    body?: Record<string, unknown>
  }) => {
    const isPost = init?.method === 'POST'
    const key = init?.headers?.['Idempotency-Key']
    if (isPost && key) sentKeys.push(key)
    let result
    if (baseUrl) {
      const response = await fetch(baseUrl + path, {
        method: init?.method,
        headers: {
          ...init?.headers,
          Authorization: `Bearer ${process.env.FITBEST_SYNC_ACCESS}`,
          ...(isPost ? { 'Content-Type': 'application/json' } : {}),
        },
        body: isPost ? JSON.stringify(init.body) : undefined,
      })
      if (!response.ok) throw new Error(`本地集成接口返回 ${response.status}: ${await response.text()}`)
      result = await response.json()
    } else if (key) {
      if (!persisted.has(key)) persisted.set(key, { ...init.body, clientId: key, id: 'server-record' })
      result = persisted.get(key)
    } else {
      result = { items: [...persisted.values()] }
    }
    if (isPost && sentKeys.length === 1) throw new TypeError('服务端已提交，连接在返回响应前断开')
    return result
  })

  // 模拟关闭页面后重新打开，补传队列应从持久化存储恢复。
  vi.resetModules()
  vi.stubGlobal('window', new EventTarget())
  const afterReload = await import('../src/api')
  connectivity.onLine = true
  window.dispatchEvent(new Event('online'))
  await afterReload.flushMachineSessions()
  expect(sentKeys).toEqual([finished.id])
  expect(afterReload.readAllSessions()[0].syncState).toBe('pending')
  window.dispatchEvent(new Event('online'))
  await afterReload.flushMachineSessions()
  expect(sentKeys).toEqual([finished.id, finished.id])
  expect(afterReload.readAllSessions()[0].syncState).toBeUndefined()

  const result = (await afterReload.fetchSessions()).filter((s) => s.id === finished.id)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject(finished)
})
