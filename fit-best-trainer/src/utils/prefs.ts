// 训练偏好设置 —— 持久化到 localStorage（fitbest 命名空间）

import { loadJSON, saveJSON } from './storage'

export interface Prefs {
  sound: boolean
  vibration: boolean
  reminderEnabled: boolean
  reminderTime: string
}

export const DEFAULT_PREFS: Prefs = {
  sound: true,
  vibration: true,
  reminderEnabled: false,
  reminderTime: '19:00',
}

const KEY = 'fitbest:prefs'

export function getPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...loadJSON<Partial<Prefs>>(KEY, {}) }
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch }
  saveJSON(KEY, next)
  return next
}
