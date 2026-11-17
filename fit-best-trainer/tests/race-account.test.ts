import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as hyrox from '../../hyrox-trainer/src/api'
import * as hyroxAuth from '../../hyrox-trainer/src/api/client'
import * as hyroxDevice from '../../hyrox-trainer/src/api/deviceSync'
import * as btwe from '../../btwe-trainer/src/api'
import * as btweAuth from '../../btwe-trainer/src/api/client'
import * as btweDevice from '../../btwe-trainer/src/api/deviceSync'

const accounts = [
  { app: 'hyrox', records: hyrox, auth: hyroxAuth, devices: hyroxDevice },
  { app: 'btwe', records: btwe, auth: btweAuth, devices: btweDevice },
] as const

const alice = '00000000-0000-4000-8000-000000000001'
const bob = '00000000-0000-4000-8000-000000000002'

function clientToken(sub: string, version = 1) {
  return ['test', Buffer.from(JSON.stringify({ sub, version })).toString('base64url'), 'test'].join('.')
}

function session(id: string) {
  return {
    id,
    planId: 'test-plan',
    date: '2026-11-16',
    totalTime: 540,
    completed: true,
    moduleTimes: [540],
    runSplit: [270],
  }
}

function deviceSession(app: 'hyrox' | 'btwe', clientSessionId: string): hyroxDevice.DeviceSessionInput {
  return {
    app,
    clientSessionId,
    device: { serialNo: 'test-band', kind: 'band' },
    mode: 'training',
    startedAt: '2026-11-16T10:00:00Z',
    durationSec: 540,
    distanceM: 1000,
    quality: 'ok',
    segments: [],
  }
}

describe.each(accounts)('$app 账号隔离', ({ app, auth, records, devices }) => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('首次使用展示空的游客历史和真实初始统计', async () => {
    expect(await records.fetchSessions()).toEqual([])
    const user = await records.fetchUser()
    expect(user.name).toBe('训练者')
    expect(user.stats).toMatchObject({ totalSessions: 0, totalKm: 0, streak: 0 })
  })

  it('切换账号只读取并补传该账号的记录，游客和未分账号旧数据继续留在本机', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', send)
    localStorage.setItem(`${app}:sessions`, JSON.stringify([session('unowned-legacy')]))
    localStorage.setItem('fitbest:record-outbox', JSON.stringify([{ clientId: 'old-queue', userId: null }]))
    await records.saveSession(session('guest-record'))

    auth.setTokens(clientToken(alice), 'alice-refresh')
    await records.saveSession(session('alice-record'))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect((await records.fetchSessions()).map(({ id }) => id)).toEqual(['alice-record'])

    auth.setTokens(clientToken(bob), 'bob-refresh')
    localStorage.setItem('fitbest:session', JSON.stringify(alice))
    expect(await records.fetchSessions()).toEqual([])
    send.mockClear().mockImplementation(async () => Response.json({ id: 'persisted-training' }))
    await records.flushOutbox()
    expect(send).not.toHaveBeenCalled()

    const startedAt = '2026-11-16T08:42:11.000Z'
    await records.saveSession({ ...session('bob-record'), startedAt, distanceM: 1180 })
    await vi.waitFor(() => expect(localStorage.getItem(`${app}:record-outbox:${bob}`)).toBe('[]'))
    expect(send).toHaveBeenCalledTimes(1)
    const bobRequest = send.mock.calls[0][1] as RequestInit
    expect(bobRequest.headers).toMatchObject({ Authorization: `Bearer ${clientToken(bob)}` })
    expect(JSON.parse(String(bobRequest.body))).toMatchObject({ clientId: 'bob-record', startedAt, distanceM: 1180 })

    auth.setTokens(clientToken(alice), 'alice-refresh')
    await records.flushOutbox()
    expect(send).toHaveBeenCalledTimes(2)
    const aliceRequest = send.mock.calls[1][1] as RequestInit
    expect(aliceRequest.headers).toMatchObject({ Authorization: `Bearer ${clientToken(alice)}` })
    expect(JSON.parse(String(aliceRequest.body))).toMatchObject({ clientId: 'alice-record' })
    expect((await records.fetchSessions()).map(({ id }) => id)).toEqual(['alice-record'])

    auth.clearTokens()
    expect((await records.fetchSessions()).some(({ id }) => id === 'guest-record')).toBe(true)
    expect(localStorage.getItem(`${app}:sessions`)).toContain('unowned-legacy')
    expect(localStorage.getItem('fitbest:record-outbox')).toContain('old-queue')
  })

  it('手环延迟同步仍使用暂存时的账号', async () => {
    const send = vi.fn(async () => Response.json({ id: 'saved-device' }))
    vi.stubGlobal('fetch', send)
    auth.setTokens(clientToken(bob), 'bob-refresh')

    await devices.syncDeviceSession(deviceSession(app, 'alice-device'), alice)
    await devices.syncDeviceSession(deviceSession(app, 'guest-device'), null)
    await devices.flushDeviceOutbox()
    expect(send).not.toHaveBeenCalled()

    auth.setTokens(clientToken(alice), 'alice-refresh')
    await devices.flushDeviceOutbox()

    expect(send).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('/me/device-sessions'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${clientToken(alice)}` }),
        body: expect.stringContaining('alice-device'),
      }))
    expect(localStorage.getItem(`${app}:device-outbox:guest`)).toContain('guest-device')
  })

  it('延迟保存时保留训练页原账号', async () => {
    const send = vi.fn(async () => Response.json({ id: 'persisted-training' }))
    vi.stubGlobal('fetch', send)
    auth.setTokens(clientToken(bob), 'bob-refresh')

    await records.saveSession(session('alice-delayed'), alice)
    expect(await records.fetchSessions()).toEqual([])
    expect(send).not.toHaveBeenCalled()

    auth.setTokens(clientToken(alice), 'alice-refresh')
    expect((await records.fetchSessions()).map(({ id }) => id)).toEqual(['alice-delayed'])
    await records.flushOutbox()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('离线的设备会话保留完整分段，收到服务端确认才计为已同步', async () => {
    const network = { onLine: false }
    vi.stubGlobal('navigator', network)
    const send = vi.fn(async () => Response.json({ id: 'persisted-device' }))
    vi.stubGlobal('fetch', send)
    auth.setTokens(clientToken(alice), 'alice-refresh')
    const payload = {
      ...deviceSession(app, 'offline-device'),
      segments: [{ seq: 1, type: 'treadmill' as const, durationSec: 540, distanceM: 1000 }],
    }
    await devices.syncDeviceSession(payload)
    await devices.syncDeviceSession(payload)
    expect(devices.pendingDeviceCount(alice)).toBe(1)
    expect(devices.getLastDeviceSync(alice)).toBeNull()
    expect(send).not.toHaveBeenCalled()

    network.onLine = true
    await Promise.all([devices.flushDeviceOutbox(), devices.flushDeviceOutbox()])
    expect(send).toHaveBeenCalledTimes(1)
    const [, request] = send.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(request.body))).toEqual(payload)
    expect(devices.pendingDeviceCount(alice)).toBe(0)
    expect(devices.getLastDeviceSync(alice)).not.toBeNull()
  })

  it('旧账号的刷新响应不会覆盖新账号或以新账号重发请求', async () => {
    const refresh = Promise.withResolvers<Response>()
    const send = vi.fn((path: string) => path.endsWith('/auth/refresh')
      ? refresh.promise
      : Promise.resolve(new Response(null, { status: 401 })))
    vi.stubGlobal('fetch', send)
    auth.setTokens(clientToken(alice), 'alice-refresh')

    const pending = auth.http.postForUser(alice, '/me/training-records', { clientId: 'alice-record' })
    const result = expect(pending).rejects.toBeInstanceOf(auth.AuthExpiredError)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    auth.setTokens(clientToken(bob), 'bob-refresh')
    refresh.resolve(Response.json({ accessToken: clientToken(alice, 2), refreshToken: 'alice-renewed' }))

    await result
    expect(auth.currentUserId()).toBe(bob)
    expect(localStorage.getItem('fitbest:refresh')).toBe('bob-refresh')
    expect(send).toHaveBeenCalledTimes(2)
  })
})
