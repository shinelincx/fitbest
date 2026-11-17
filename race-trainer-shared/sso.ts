// FITBEST 统一账号 —— 同域共享 localStorage 读取
import { loadJSON, saveJSON } from './storage'
import { currentUserId } from './client'

export function accountStorageKey(key: string, userId = currentUserId()): string {
  return `${key}:${userId ?? 'guest'}`
}

export interface SsoUser {
  id: string
  nickname: string
  avatar?: string
}

export function getSsoUser(): SsoUser | null {
  const uid = currentUserId()
  if (!uid) return null
  const users = loadJSON<Array<{ id: string; nickname: string; avatar?: string }>>('fitbest:users', [])
  const cloud = loadJSON<SsoUser | null>('fitbest:cloud-account', null)
  const user = users.find((u) => u.id === uid) ?? (cloud?.id === uid ? cloud : null)
  return user ? { id: user.id, nickname: user.nickname || '训练者', avatar: user.avatar } : null
}

export type ActivityApp = 'btwe' | 'hyrox'

export interface ActivityEntry {
  id: string
  app: ActivityApp
  uid: string
  date: string
  durationSec: number
  distanceM: number
}

const ACTIVITY_KEY = 'fitbest:activity'

function readActivity(): ActivityEntry[] {
  const list = loadJSON<ActivityEntry[]>(ACTIVITY_KEY, [])
  return Array.isArray(list) ? list : []
}

export function addActivity(entry: ActivityEntry) {
  const list = readActivity().filter((a) => a.id !== entry.id || a.uid !== entry.uid || a.app !== entry.app)
  saveJSON(ACTIVITY_KEY, [entry, ...list].slice(0, 300))
}

export function removeActivity(app: ActivityApp, id: string, userId: string | null) {
  saveJSON(ACTIVITY_KEY, readActivity().filter((a) => a.id !== id || a.app !== app || a.uid !== (userId ?? 'guest')))
}

export function clearActivity(app: ActivityApp, userId: string | null) {
  saveJSON(ACTIVITY_KEY, readActivity().filter((a) => a.app !== app || a.uid !== (userId ?? 'guest')))
}
