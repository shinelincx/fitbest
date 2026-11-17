// 三站共享训练摘要 —— 与 HYROX / BTWE 同域共享 localStorage
import { loadJSON } from './storage'

export type ActivityApp = 'fitbest' | 'hyrox' | 'btwe'

export interface ActivityEntry {
  id: string
  app: ActivityApp
  uid: string
  date: string
  durationSec: number
  distanceM: number
}

const ACTIVITY_KEY = 'fitbest:activity'

export function readActivity(): ActivityEntry[] {
  const list = loadJSON<ActivityEntry[]>(ACTIVITY_KEY, [])
  return Array.isArray(list) ? list.filter((a) => typeof a?.id === 'string' && a.app !== 'fitbest') : []
}
