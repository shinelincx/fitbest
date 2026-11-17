import { currentUserId, http } from './client'
import { createOutbox } from './outbox'
import type { SessionRecord } from './sessionRecord'
import { accountStorageKey, removeActivity, type ActivityApp } from './sso'
import { loadJSON, saveJSON } from './storage'

function recordPayload(app: ActivityApp, session: SessionRecord) {
  return {
    clientId: session.id,
    app,
    planId: session.planId,
    completed: session.completed,
    totalTimeSec: session.totalTime,
    distanceM: session.distanceM ?? (session.completed ? 3200 : 0),
    moduleTimes: session.moduleTimes,
    runSplits: session.runSplit,
    avgHr: session.avgHr,
    maxHr: session.maxHr,
    startedAt: session.startedAt ?? session.date,
  }
}

interface RecordEntry {
  clientId: string
  payload: ReturnType<typeof recordPayload>
}

interface CloudRecord {
  id: string
  clientKey: string | null
  planId: string | null
  completed: boolean
  totalTimeSec: number
  distanceM: number
  moduleTimes: number[] | null
  runSplits: number[] | null
  avgHr: number | null
  maxHr: number | null
  startedAt: string | null
  createdAt: string
}

function cloudSession(record: CloudRecord): SessionRecord {
  const startedAt = record.startedAt ?? record.createdAt
  return {
    id: record.clientKey ?? record.id,
    cloudId: record.id,
    date: startedAt.slice(0, 10),
    startedAt,
    planId: record.planId ?? '',
    completed: record.completed,
    totalTime: record.totalTimeSec,
    distanceM: record.distanceM,
    moduleTimes: record.moduleTimes ?? [],
    runSplit: record.runSplits ?? [],
    avgHr: record.avgHr ?? undefined,
    maxHr: record.maxHr ?? undefined,
  }
}

export function createTrainingRecords(
  app: ActivityApp,
  guestSessions: SessionRecord[],
  removeDevice: (userId: string | null, id: string) => void,
) {
  const sessionsKey = `${app}:sessions`
  const cloudKey = `${app}:cloud-history`
  const revisions = new Map<string, number>()
  const deletions = createOutbox<{ id: string; legacy: boolean }>({
    key: `${app}:record-deletions`,
    path: '/me/training-records/deletions',
    id: (entry) => entry.id,
    payload: ({ id, legacy }) => legacy ? { app, id } : { app, clientId: id },
    onAcknowledged: (userId, entry) => dropCopies(userId, entry.id),
  })
  const outbox = createOutbox<RecordEntry>({
    key: `${app}:record-outbox`,
    path: '/me/training-records',
    id: (entry) => entry.clientId,
    payload: (entry) => entry.payload,
    discardGone: true,
    onGone: (userId, entry) => dropCopies(userId, entry.clientId),
    onAcknowledged: (userId, entry, cloudId) => {
      if (deletions.has(userId, entry.clientId)) return
      const sessions = readSessions(userId)
      if (!sessions.some(({ id }) => id === entry.clientId)) return
      writeSessions(sessions.map((row) => row.id === entry.clientId ? { ...row, cloudId } : row), userId)
      revisions.set(userId, (revisions.get(userId) ?? 0) + 1)
    },
  })

  function readSessions(userId = currentUserId()): SessionRecord[] {
    const rows = loadJSON(accountStorageKey(sessionsKey, userId), userId === null ? guestSessions : [])
    return userId ? rows.filter(({ id }) => !deletions.has(userId, id)) : rows
  }

  function writeSessions(list: SessionRecord[], userId: string | null) {
    localStorage.setItem(accountStorageKey(sessionsKey, userId), JSON.stringify(list))
  }

  function dropCopies(userId: string | null, id: string) {
    if (userId) {
      const key = accountStorageKey(cloudKey, userId)
      localStorage.setItem(key, JSON.stringify(loadJSON<SessionRecord[]>(key, []).filter((row) => row.id !== id)))
      outbox.remove(userId, id)
    }
    removeDevice(userId, id)
    writeSessions(readSessions(userId).filter((row) => row.id !== id), userId)
    removeActivity(app, id, userId)
  }

  async function fetchHistory(): Promise<SessionRecord[]> {
    const userId = currentUserId()
    if (!userId) return readSessions(null)
    const key = accountStorageKey(cloudKey, userId)
    let records = loadJSON<SessionRecord[]>(key, [])
    const revision = revisions.get(userId)
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('处于离线状态')
      const fetched: SessionRecord[] = []
      let cursor = ''
      do {
        const query = new URLSearchParams({ app })
        if (cursor) query.set('cursor', cursor)
        const page = await http.getForUser<{ items: CloudRecord[]; nextCursor: string }>(userId,
          `/me/training-records/page?${query}`)
        if (currentUserId() !== userId) return []
        fetched.push(...page.items.map(cloudSession))
        if (page.nextCursor && page.nextCursor === cursor) throw new Error('训练记录分页游标重复')
        cursor = page.nextCursor
      } while (cursor)
      if (revision === revisions.get(userId)) {
        const cloudIds = new Set(fetched.map(({ id }) => id))
        const previouslySynced = new Set(records.map(({ id }) => id))
        const local = readSessions(userId)
        const kept = local.filter(({ id, cloudId }) =>
          cloudIds.has(id) || outbox.has(userId, id) || (!cloudId && !previouslySynced.has(id)))
        if (kept.length !== local.length) writeSessions(kept, userId)
        records = fetched
        saveJSON(key, records)
      } else {
        records = loadJSON(key, [])
      }
    } catch {
      if (currentUserId() !== userId) return []
    }
    const merged = new Map(readSessions(userId).map((row) => [row.id, row]))
    for (const record of records) {
      if (deletions.has(userId, record.id)) continue
      merged.set(record.id, { ...merged.get(record.id), ...record })
    }
    return [...merged.values()].sort((a, b) => (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date))
  }

  async function deleteHistoryRecord(id: string, cloudId?: string) {
    const userId = currentUserId()
    if (userId) {
      const key = accountStorageKey(cloudKey, userId)
      const cached = loadJSON<SessionRecord[]>(key, [])
      const legacy = id === (cloudId ?? cached.find((row) => row.id === id)?.cloudId)
      // 先持久化删除意图，再移除两种上传队列。已在途的请求由服务端同键锁处理。
      deletions.enqueue(userId, { id, legacy })
      revisions.set(userId, (revisions.get(userId) ?? 0) + 1)
    }
    dropCopies(userId, id)
    return userId !== null && deletions.has(userId, id)
  }

  return {
    readSessions,
    writeSessions,
    fetchHistory,
    deleteHistoryRecord,
    enqueueRecord(session: SessionRecord, userId: string) {
      outbox.enqueue(userId, { clientId: session.id, payload: recordPayload(app, session) })
    },
    flushOutbox: outbox.flush,
    flushDeletions: deletions.flush,
    clearOutbox: outbox.clear,
  }
}
