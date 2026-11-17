// 训练偏好设置 —— 持久化到 localStorage

import { loadJSON, saveJSON } from './storage'

export interface Prefs {
  reminder: boolean
  reminderTime: string // HH:mm
  sound: boolean
  vibration: boolean
  autoPause: boolean
}

export const DEFAULT_PREFS: Prefs = {
  reminder: true,
  reminderTime: '19:00',
  sound: true,
  vibration: true,
  autoPause: true,
}

const KEY = 'hyrox:prefs'

export function getPrefs(): Prefs {
  return { ...DEFAULT_PREFS, ...loadJSON<Partial<Prefs>>(KEY, {}) }
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch }
  saveJSON(KEY, next)
  return next
}
