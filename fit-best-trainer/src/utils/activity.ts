// 三站共享训练摘要 —— 与 HYROX / BTWE 同域共享 localStorage
import { loadJSON, saveJSON } from './storage'
import { hasAccessFor, request } from '../api/client'
import type { SessionRecord } from '../../../race-trainer-shared/sessionRecord'

export type ActivityApp = 'hyrox' | 'btwe'
const apps: ActivityApp[] = ['hyrox', 'btwe']

export interface ActivityEntry {
  id: string
  app: ActivityApp
  uid: string
  date: string
  durationSec: number
  distanceM: number
  calories?: number
}

export const ACTIVITY_KEY = 'fitbest:activity'

export function readActivity(): ActivityEntry[] {
  const list = loadJSON<ActivityEntry[]>(ACTIVITY_KEY, [])
  return Array.isArray(list) ? list.filter((a) => typeof a?.id === 'string' && apps.includes(a.app)) : []
}

interface CloudRace {
  id: string
  clientKey: string | null
  startedAt: string | null
  createdAt: string
  totalTimeSec: number
  distanceM: number
}

function browserList<T>(key: string): T[] {
  const list = loadJSON<T[]>(key, [])
  return Array.isArray(list) ? list : []
}

async function fetchRaces(app: ActivityApp, owner: string, signal: AbortSignal) {
  const records: CloudRace[] = []
  const cursors = new Set<string>()
  let cursor = ''
  do {
    const query = new URLSearchParams({ app })
    if (cursor) query.set('cursor', cursor)
    const page = await request<{ items: CloudRace[]; nextCursor: string }>(`/me/training-records/page?${query}`, {
      userId: owner,
      signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : signal,
    })
    records.push(...page.items)
    cursor = page.nextCursor
    if (cursor && cursors.has(cursor)) throw new Error('赛事记录分页未结束')
    cursors.add(cursor)
  } while (cursor)
  if (signal.aborted || !hasAccessFor(owner)) throw new Error('赛事记录已取消加载')
  return records
}

export async function fetchActivity(owner: string, cloud: boolean, signal: AbortSignal) {
  const all = await Promise.all(apps.map(async (app) => {
    const cacheKey = `fitbest:race-summary:${app}:${owner}`
    const snapshot = loadJSON<{ records: CloudRace[]; removed: string[] } | null>(cacheKey, null)
    const cached = snapshot?.records ?? []
    const removed = new Set(snapshot?.removed ?? [])
    const local = browserList<SessionRecord>(`${app}:sessions:${owner}`)
    let remote = cached
    let complete = false
    let failed = false
    if (cloud && navigator.onLine && hasAccessFor(owner)) {
      try {
        remote = await fetchRaces(app, owner, signal)
        const live = new Set(remote.map((row) => row.clientKey ?? row.id))
        const previouslySynced = new Set(cached.map((row) => row.clientKey ?? row.id))
        for (const row of local) {
          if (!live.has(row.id) && previouslySynced.has(row.id)) removed.add(row.id)
        }
        const stillLocal = new Set(local.map((row) => row.id))
        saveJSON(cacheKey, { records: remote, removed: [...removed].filter((id) => stillLocal.has(id) && !live.has(id)) })
        complete = true
      } catch {
        failed = true
      }
    }

    // 赛事应用本机记录保存了完整开训时间、已同步 ID 和离线删除意图。
    const raceCache = cloud && !complete && !snapshot ? browserList<SessionRecord>(`${app}:cloud-history:${owner}`) : []
    const pending = new Set(browserList<{ clientId: string }>(`${app}:record-outbox:${owner}`).map((row) => row.clientId))
    const deleted = new Set(browserList<{ id: string }>(`${app}:record-deletions:${owner}`).map((row) => row.id))
    const items = new Map<string, ActivityEntry>()

    function add(id: string, date: string, durationSec: number, distanceM: number, cloudId?: string) {
      if (!id || deleted.has(id) || (cloudId && deleted.has(cloudId))) return
      items.set(id, { id, app, uid: owner, date, durationSec, distanceM })
    }
    if (!complete && !snapshot) {
      for (const row of readActivity()) {
        if (row.uid === owner && row.app === app) add(row.id, row.date, row.durationSec, row.distanceM)
      }
    }
    for (const row of [...local, ...raceCache]) {
      if ((complete || snapshot) && !pending.has(row.id) && (row.cloudId || removed.has(row.id))) continue
      add(row.id, row.startedAt ?? row.date, row.totalTime, row.distanceM ?? (row.completed ? 3200 : 0), row.cloudId)
    }
    for (const row of remote) {
      add(row.clientKey ?? row.id, row.startedAt ?? row.createdAt, row.totalTimeSec, row.distanceM, row.id)
    }
    return { items: [...items.values()], failed }
  }))
  return { items: all.flatMap((result) => result.items), failed: all.some((result) => result.failed) }
}
