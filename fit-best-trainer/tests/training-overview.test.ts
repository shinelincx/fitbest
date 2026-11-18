import { expect, it, vi } from 'vitest'
import { summarizeTraining } from '../src/utils/trainingOverview'
import type { StrengthSession } from '../src/types'
import type { ActivityEntry } from '../src/utils/activity'
import { loginReturn } from '../src/utils/loginReturn'

vi.mock('../src/i18n', () => ({ default: { t: (text: string) => text } }))

it('统一周界、训练分类、去重与秒数合计', () => {
  const now = new Date(2026, 10, 18, 19)
  const monday = new Date(2026, 10, 16, 0, 0).toISOString()
  const sunday = new Date(2026, 10, 15, 23, 59).toISOString()
  const strength: StrengthSession = {
    kind: 'strength', id: 'weight', date: monday, durationSec: 899, completed: false,
    exerciseId: 'test', exerciseName: '划船', equipment: 'machine', sets: [], volumeKg: 10,
    totalReps: 1, bestSet: null, e1rm: 0,
  }
  const races: ActivityEntry[] = [
    { id: 'race', app: 'hyrox', uid: 'test', date: monday, durationSec: 888, distanceM: 1000 },
    { id: 'race', app: 'hyrox', uid: 'test', date: monday, durationSec: 898, distanceM: 1100 },
    { id: 'race', app: 'btwe', uid: 'test', date: now.toISOString(), durationSec: 902, distanceM: 900 },
    { id: 'previous-week', app: 'btwe', uid: 'test', date: sunday, durationSec: 90, distanceM: 50 },
  ]
  const result = summarizeTraining([], [strength], races, now)
  expect(result.weekly).toMatchObject({ count: 3, durationSec: 2699, distanceM: 2000 })
  expect(Math.round(result.weekly.durationSec / 60)).toBe(45)
  expect(result.dayCounts).toEqual([2, 0, 1, 0, 0, 0, 0])
  expect(result.lifetime.count).toBe(4)
  expect(result.trainedToday).toBe(true)
})

it('登录后只能回到已知的账号页', () => {
  expect(loginReturn('/profile/goals')).toBe('/profile/goals')
  expect(loginReturn('//example.test')).toBe('/profile')
  expect(loginReturn('/s/example')).toBe('/profile')
})
