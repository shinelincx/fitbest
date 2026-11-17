import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { saveStrengthSession, savePinBinding, fetchStrengthSessions, fetchPinBindings, deleteStrengthSession, removePinBinding } from '../src/api'
import type { StrengthSession } from '../src/types'

const auth = vi.hoisted(() => ({ userId: 'alice' as string | null }))
vi.mock('../src/utils/auth', () => ({
  currentUserId: () => auth.userId,
  isCloudAccount: () => false,
  isCloudAuthed: () => false,
}))

const pin = { pinId: 'P1', pinName: '训练插销', machineId: 'M1', boundAt: 100 }
const strength: StrengthSession = {
  id: 'strength-1', kind: 'strength', date: '2026-11-17T03:00:00.000Z',
  exerciseId: 'press', exerciseName: '推胸', equipment: 'machine', source: 'pin',
  sets: [{ weight: 20, reps: 10, at: 100 }], durationSec: 90,
  totalReps: 10, volumeKg: 200, e1rm: 26, completed: true,
}

let writeError: Error | null
beforeEach(() => {
  auth.userId = 'alice'
  writeError = null
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (writeError) throw writeError
      storage.set(key, value)
    },
    removeItem: (key: string) => storage.delete(key),
  })
})
afterEach(() => vi.unstubAllGlobals())

it('力量保存和插销绑定使用调用时的账号，切换账号不改变写入归属', async () => {
  const saved = Promise.all([saveStrengthSession(strength), savePinBinding(pin)])
  auth.userId = 'bob'
  await saved
  expect(await fetchStrengthSessions()).toEqual([])
  expect(await fetchPinBindings()).toEqual([])
  auth.userId = 'alice'
  expect(await fetchStrengthSessions()).toEqual([strength])
  expect(await fetchPinBindings()).toEqual([pin])
})

it('存储拒绝写入时保存与删除都失败，并可用同一结果重试', async () => {
  writeError = new Error('存储空间不足')
  await Promise.all([
    expect(saveStrengthSession(strength)).rejects.toThrow(writeError),
    expect(savePinBinding(pin)).rejects.toThrow(writeError),
  ])
  writeError = null
  await Promise.all([saveStrengthSession(strength), savePinBinding(pin)])
  writeError = new Error('存储不可写')
  await Promise.all([
    expect(deleteStrengthSession(strength.id)).rejects.toThrow(writeError),
    expect(removePinBinding(pin.pinId)).rejects.toThrow(writeError),
  ])
  expect(await fetchStrengthSessions()).toEqual([strength])
  expect(await fetchPinBindings()).toEqual([pin])
})
