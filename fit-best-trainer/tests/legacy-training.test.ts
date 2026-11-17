import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const account = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('../src/utils/auth', () => ({
  currentUserId: () => account.userId,
  isCloudAccount: () => false,
  isCloudAuthed: () => false,
}))

const legacy = [{ id: 'old-guest', date: '2025-06-01', durationSec: 900 }]
const gym = [{ id: 'saved-by-account', date: '2025-06-02', durationSec: 840 }]
const strength = [{ id: 'strength-before-upgrade', date: '2025-06-03' }]

describe('主训练端升级后的旧版记录', () => {
  beforeEach(() => {
    vi.resetModules()
    account.userId = null
    const records = new Map([
      ['fitbest:sessions', JSON.stringify(legacy)],
      ['fitbest:sessions:account-a', JSON.stringify(gym)],
      ['fitbest:strength:account-a', JSON.stringify(strength)],
    ])
    const storage = {
      ...Object.fromEntries(records),
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    }
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('没有旧清理标记时也会保留游客、有氧和力量训练记录', async () => {
    const training = await import('../src/api')

    expect(training.readAllSessions()).toEqual(legacy)
    account.userId = 'account-a'
    expect(training.readAllSessions()).toEqual(gym)
    expect(training.readAllStrengthSessions()).toEqual(strength)
    account.userId = 'account-b'
    expect(training.readAllSessions()).toEqual([])
    expect(localStorage.getItem('fitbest:purged-demo-v1')).toBeNull()
    expect(localStorage.getItem('fitbest:sessions')).toBe(JSON.stringify(legacy))
  })

  it('已有游客桶优先，显式清空后旧记录不会重新出现', async () => {
    const current = [{ id: 'new-guest', date: '2026-01-02', durationSec: 300 }]
    localStorage.setItem('fitbest:sessions:guest', JSON.stringify(current))
    const training = await import('../src/api')

    expect(training.readAllSessions()).toEqual(current)
    expect(localStorage.getItem('fitbest:sessions')).toBe(JSON.stringify(legacy))
    await training.clearSessions()
    expect(training.readAllSessions()).toEqual([])
    expect(localStorage.getItem('fitbest:sessions:account-a')).toBe(JSON.stringify(gym))
  })
})
