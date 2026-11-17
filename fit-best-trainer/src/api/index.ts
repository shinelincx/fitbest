import type { MachineSession, PinBinding, StrengthSession, TrainMode } from '../types'
import { MACHINE_MAP, MODE_LABELS } from '../mock/data'
import { loadJSON, removeKey } from '../utils/storage'
import { currentUserId, isCloudAccount, isCloudAuthed } from '../utils/auth'
import { ApiError, request } from './client'

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

const LEGACY_KEY = 'fitbest:sessions'

// 记录按账号隔离：游客与各账号各自一份
function sessionsKey(userId = currentUserId()): string {
  return `fitbest:sessions:${userId ?? 'guest'}`
}

interface LocalMachineSession extends MachineSession {
  restoreFromBackup?: boolean
  cloudSynced?: boolean
}

function readSessions(userId = currentUserId()): LocalMachineSession[] {
  const stored = loadJSON<LocalMachineSession[] | null>(sessionsKey(userId), null)
  // 旧版未分账号的键只用于游客。分账号记录存在时，以其为准。
  return stored ?? (userId === null ? loadJSON<MachineSession[]>(LEGACY_KEY, []) : [])
}

function writeSessions(list: LocalMachineSession[], userId = currentUserId()) {
  // 写入失败应通知调用方，避免用户误以为训练已保存。
  localStorage.setItem(sessionsKey(userId), JSON.stringify(list))
}

/**
 * 云端会话（后端 Session）→ 本地 MachineSession 映射
 */
interface CloudSession {
  id: string
  clientId?: string | null
  machineType: string
  mode?: string | null
  durationSec: number
  distanceM: number
  calories: number
  avgHr?: number | null
  avgSpeed?: number | null
  cadence?: number | null
  power?: number | null
  startedAt: string
  endedAt?: string | null
  target?: number | null
  completed?: boolean | null
}

function fromCloud(s: CloudSession): MachineSession {
  return {
    kind: 'cardio',
    id: s.clientId ?? s.id,
    date: s.startedAt,
    endedAt: s.endedAt ?? undefined,
    machine: s.machineType as MachineSession['machine'],
    mode: (s.mode ?? 'free') as TrainMode,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    avgSpeed: s.avgSpeed ?? 0,
    cadence: s.cadence ?? 0,
    power: s.power ?? 0,
    calories: s.calories,
    avgHr: s.avgHr ?? 0,
    target: s.target ?? undefined,
    completed: s.completed ?? true,
  }
}

function toCloud(s: MachineSession) {
  return {
    machineType: s.machine,
    mode: s.mode,
    durationSec: s.durationSec,
    distanceM: s.distanceM,
    calories: s.calories,
    avgHr: s.avgHr >= 30 && s.avgHr <= 250 ? Math.round(s.avgHr) : undefined,
    avgSpeed: s.avgSpeed > 0 ? s.avgSpeed : undefined,
    cadence: s.cadence > 0 ? Math.round(s.cadence) : undefined,
    power: s.power > 0 ? Math.round(s.power) : undefined,
    startedAt: s.date,
    endedAt: s.endedAt ?? s.date,
    target: s.target,
    completed: s.completed,
    source: 'ble' as const,
  }
}

const SESSION_SYNC_EVENT = 'fitbest:machine-sessions-changed'
const syncJobs = new Map<string, Promise<void>>()
const dataChanges = new Set<string>()

export function getMachineSessionOwner() {
  return { userId: currentUserId(), cloud: isCloudAccount() }
}

export function subscribeToMachineSessions(listener: () => void) {
  window.addEventListener(SESSION_SYNC_EVENT, listener)
  return () => window.removeEventListener(SESSION_SYNC_EVENT, listener)
}

function notifySessionChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_SYNC_EVENT))
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

async function flushSessionsForUser(userId: string, retryFailed: boolean) {
  let changed = false
  try {
    if (retryFailed) {
      writeSessions(readSessions(userId).map((s) => s.syncState === 'failed' ? { ...s, syncState: 'pending' } : s), userId)
      changed = true
    }
    while (online() && isCloudAuthed() && currentUserId() === userId && !dataChanges.has(userId)) {
      const pending = readSessions(userId).find((s) => s.syncState === 'pending')
      if (!pending) break
      let syncState: MachineSession['syncState']
      try {
        const saved = await request<CloudSession>(pending.restoreFromBackup ? '/sessions/restore' : '/sessions', {
          method: 'POST',
          body: toCloud(pending),
          headers: { 'Idempotency-Key': pending.id },
          userId,
          signal: AbortSignal.timeout?.(10_000),
        })
        if (!saved?.id) break
      } catch (error) {
        if (error instanceof ApiError && error.code === 410) {
          writeSessions(readSessions(userId).filter((s) => s.id !== pending.id), userId)
          changed = true
          continue
        }
        if (!(error instanceof ApiError) || error.code < 400 || error.code >= 500
          || [401, 408, 429].includes(error.code)) break
        syncState = 'failed'
      }
      writeSessions(readSessions(userId).map((s) => s.id !== pending.id ? s : {
        ...s,
        syncState,
        cloudSynced: !syncState,
        restoreFromBackup: syncState ? s.restoreFromBackup : undefined,
      }), userId)
      changed = true
    }
  } catch {
    // 存储不可写时保留原队列，后续可使用同一幂等键重试。
  } finally {
    if (changed) notifySessionChange()
  }
}

export function flushMachineSessions(retryFailed = false): Promise<void> {
  const userId = currentUserId()
  if (!userId || !isCloudAuthed() || !online() || dataChanges.has(userId)) return Promise.resolve()
  const existing = syncJobs.get(userId)
  if (existing) {
    return retryFailed
      ? existing.then(() => currentUserId() === userId ? flushMachineSessions(true) : undefined)
      : existing
  }
  const job = Promise.resolve().then(() => flushSessionsForUser(userId, retryFailed)).finally(() => syncJobs.delete(userId))
  syncJobs.set(userId, job)
  return job
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushMachineSessions())
  window.addEventListener('storage', (event) => {
    if (event.key === 'fitbest:access' || event.key === 'fitbest:session') void flushMachineSessions()
    if (event.key === sessionsKey()) notifySessionChange()
  })
}

function sortSessions(sessions: MachineSession[]) {
  return sessions.sort((a, b) => b.date.localeCompare(a.date))
}

export async function fetchSessions({ requireCloud = false }: { requireCloud?: boolean } = {}): Promise<MachineSession[]> {
  const userId = currentUserId()
  const remote = new Map<string, MachineSession>()
  let complete = false
  if (userId && isCloudAuthed() && online()) {
    try {
      const seen = new Set<string>()
      let cursor: string | null = null
      do {
        const query = new URLSearchParams({ range: 'all', limit: '50' })
        if (cursor) query.set('cursor', cursor)
        const page = await request<{ items: CloudSession[]; nextCursor?: string | null }>(`/sessions?${query}`, {
          userId,
          signal: AbortSignal.timeout?.(8_000),
        })
        for (const s of page.items) {
          if (!Object.hasOwn(MACHINE_MAP, s.machineType)) continue
          const session = fromCloud(s)
          remote.set(session.id, session)
        }
        cursor = page.nextCursor ?? null
        if (cursor && seen.has(cursor)) throw new Error('云端训练记录分页未结束')
        if (cursor) seen.add(cursor)
      } while (cursor)
      complete = true
    } catch (error) {
      if (requireCloud) throw error
    }
  } else if (requireCloud && isCloudAccount()) {
    throw new Error('请登录并联网后导出云端训练记录')
  }
  if (requireCloud && currentUserId() !== userId) throw new Error('登录账号已切换')
  const local = readSessions(userId).filter((s) => !remote.has(s.id) && (!complete || !s.cloudSynced))
  return sortSessions([...remote.values(), ...local])
}

export async function saveSession(session: MachineSession, owner = getMachineSessionOwner()): Promise<MachineSession> {
  const list = readSessions(owner.userId)
  const existing = list.find((s) => s.id === session.id)
  if (existing) return existing
  const stored: MachineSession = { ...session, syncState: owner.cloud ? 'pending' : undefined }
  writeSessions([stored, ...list], owner.userId)
  notifySessionChange()
  if (owner.cloud && owner.userId === currentUserId()) void flushMachineSessions()
  return stored
}

export async function deleteSession(id: string): Promise<void> {
  const { userId, cloud } = getMachineSessionOwner()
  if (cloud) {
    await changeCloudSessions(userId, async (owner) => {
      const result = await request<{ ok: boolean }>(`/sessions?${new URLSearchParams({ ref: id })}`, {
        method: 'DELETE', userId: owner, signal: AbortSignal.timeout?.(10_000),
      })
      if (result?.ok !== true) throw new Error('云端删除失败，请重试')
      writeSessions(readSessions(owner).filter((s) => s.id !== id), owner)
      notifySessionChange()
    })
    return
  }
  writeSessions(readSessions(userId).filter((s) => s.id !== id), userId)
}

async function changeCloudSessions(userId: string | null, change: (id: string) => Promise<void>) {
  if (!userId || !isCloudAuthed() || !online()) throw new Error('请登录并联网后管理云端训练记录')
  if (dataChanges.has(userId)) throw new Error('正在处理云端训练记录，请稍后重试')
  dataChanges.add(userId)
  try {
    await syncJobs.get(userId)
    if (currentUserId() !== userId) throw new Error('登录账号已切换')
    await change(userId)
  } finally {
    dataChanges.delete(userId)
    if (currentUserId() === userId) void flushMachineSessions()
  }
}

export async function clearSessions({ userId, cloud } = getMachineSessionOwner()): Promise<void> {
  if (cloud) {
    await changeCloudSessions(userId, async (owner) => {
      const local = readSessions(owner)
      const result = await request<{ deleted: number }>('/sessions/all', {
        method: 'DELETE', userId: owner, signal: AbortSignal.timeout?.(15_000),
        body: {
          pendingIds: local.filter((s) => s.syncState).map((s) => s.id),
          machineTypes: Object.keys(MACHINE_MAP),
        },
      })
      if (typeof result?.deleted !== 'number') throw new Error('云端清空失败，请重试')
      const clearedIds = new Set(local.map((s) => s.id))
      writeSessions(readSessions(owner).filter((s) => !clearedIds.has(s.id)), owner)
      notifySessionChange()
    })
    return
  }
  if (userId === null) removeKey(LEGACY_KEY)
  writeSessions([], userId)
}

/**
 * 导出/导入：本地无后端，导出为 JSON 备份，导入时整表替换当前账号记录
 */
export function readAllSessions(): MachineSession[] {
  return readSessions()
}

export function parseSessionBackup(list: unknown[]): MachineSession[] {
  const byId = new Map<string, MachineSession>()
  for (const raw of list) {
    const s = raw as Partial<MachineSession> | null
    if (!s || typeof s.id !== 'string' || !s.id.trim() || s.id.length > 200
      || typeof s.date !== 'string' || !Number.isFinite(Date.parse(s.date))
      || !s.machine || !Object.hasOwn(MACHINE_MAP, s.machine)
      || typeof s.durationSec !== 'number' || !Number.isFinite(s.durationSec)
      || typeof s.distanceM !== 'number' || !Number.isFinite(s.distanceM)) {
      throw new Error('备份包含无效的器械训练记录')
    }
    const number = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
    byId.set(s.id, {
      id: s.id, date: new Date(s.date).toISOString(), machine: s.machine,
      endedAt: typeof s.endedAt === 'string' && Number.isFinite(Date.parse(s.endedAt))
        ? new Date(s.endedAt).toISOString() : undefined,
      mode: s.mode && Object.hasOwn(MODE_LABELS, s.mode) ? s.mode : 'free',
      durationSec: Math.round(number(s.durationSec)), distanceM: Math.round(number(s.distanceM)),
      calories: Math.round(number(s.calories)), avgHr: number(s.avgHr), avgSpeed: number(s.avgSpeed),
      cadence: number(s.cadence), power: number(s.power),
      completed: s.completed !== false,
      target: Number.isFinite(s.target) ? Math.round(number(s.target)) : undefined,
    })
  }
  return [...byId.values()]
}

export function importSessions(sessions: MachineSession[], owner = getMachineSessionOwner()): number {
  if (!owner.cloud) {
    writeSessions(sessions, owner.userId)
    return sessions.length
  }
  if (!owner.userId) throw new Error('请先登录以恢复云端训练记录')
  const local = readSessions(owner.userId)
  const byId = new Map(local.map((s) => [s.id, s]))
  for (const session of sessions) {
    const existing = byId.get(session.id)
    const record = existing?.syncState ? existing : session
    byId.set(session.id, { ...record, syncState: 'pending', restoreFromBackup: true })
  }
  writeSessions([...byId.values()], owner.userId)
  notifySessionChange()
  if (currentUserId() === owner.userId) void flushMachineSessions()
  return sessions.length
}

/* ===== 力量训练记录 ===== */

function strengthKey(userId = currentUserId()): string {
  return `fitbest:strength:${userId ?? 'guest'}`
}

function readStrength(userId = currentUserId()): StrengthSession[] {
  return loadJSON<StrengthSession[]>(strengthKey(userId), [])
}

/**
 * TODO: GET /api/fitbest/strength-sessions
 */
export async function fetchStrengthSessions(userId = currentUserId()): Promise<StrengthSession[]> {
  await delay()
  return readStrength(userId)
}

/**
 * TODO: POST /api/fitbest/strength-sessions
 */
export async function saveStrengthSession(session: StrengthSession, userId = currentUserId()): Promise<StrengthSession> {
  await delay(300)
  localStorage.setItem(strengthKey(userId), JSON.stringify([session, ...readStrength(userId).filter((s) => s.id !== session.id)]))
  return session
}

/**
 * TODO: DELETE /api/fitbest/strength-sessions/:id
 */
export async function deleteStrengthSession(id: string, userId = currentUserId()): Promise<void> {
  await delay(200)
  localStorage.setItem(
    strengthKey(userId),
    JSON.stringify(readStrength(userId).filter((s) => s.id !== id)),
  )
}

export function readAllStrengthSessions(): StrengthSession[] {
  return readStrength()
}

export function importStrengthSessions(list: StrengthSession[], owner = getMachineSessionOwner()): void {
  const key = strengthKey(owner.userId)
  const byId = new Map(loadJSON<StrengthSession[]>(key, []).map((s) => [s.id, s]))
  for (const session of list) {
    if (!byId.has(session.id)) byId.set(session.id, session)
  }
  localStorage.setItem(key, JSON.stringify([...byId.values()]))
}

// ===== 智能插销与器械绑定 =====
function pinKey(userId = currentUserId()): string {
  return `fitbest:pins:${userId ?? 'guest'}`
}

function readPins(userId = currentUserId()): PinBinding[] {
  return loadJSON<PinBinding[]>(pinKey(userId), [])
}

/**
 * TODO: GET /api/fitbest/pin-bindings
 */
export async function fetchPinBindings(userId = currentUserId()): Promise<PinBinding[]> {
  await delay()
  return readPins(userId)
}

/**
 * TODO: PUT /api/fitbest/pin-bindings/:pinId
 */
export async function savePinBinding(binding: PinBinding, userId = currentUserId()): Promise<PinBinding> {
  await delay(200)
  localStorage.setItem(
    pinKey(userId),
    JSON.stringify([binding, ...readPins(userId).filter((p) => p.pinId !== binding.pinId)]),
  )
  return binding
}

/**
 * TODO: DELETE /api/fitbest/pin-bindings/:pinId
 */
export async function removePinBinding(pinId: string, userId = currentUserId()): Promise<void> {
  await delay(150)
  localStorage.setItem(
    pinKey(userId),
    JSON.stringify(readPins(userId).filter((p) => p.pinId !== pinId)),
  )
}

export function getBindingByPinId(pinId: string, userId = currentUserId()): PinBinding | undefined {
  return readPins(userId).find((p) => p.pinId === pinId)
}

export async function clearStrengthSessions(userId = currentUserId()): Promise<void> {
  localStorage.removeItem(strengthKey(userId))
}
