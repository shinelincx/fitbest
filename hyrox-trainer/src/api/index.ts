import type {
  Plan,
  SessionRecord,
  User,
} from '../types'
import { PLANS } from '../mock/data'
import { loadJSON, removeKey, saveJSON } from '../utils/storage'
import { accountStorageKey, addActivity, clearActivity } from '../utils/sso'
import { currentUserId, http, isAuthed, setTokens } from './client'
import { createTrainingRecords } from '../../../race-trainer-shared/trainingRecords'
import { createRaceCalendar } from '../../../race-trainer-shared/events'
import { removeDeviceFromOutbox } from './deviceSync'

const USER_KEY = 'hyrox:user'
const RACES_KEY = 'hyrox:registered-races'

const { readSessions, writeSessions, enqueueRecord, flushOutbox, clearOutbox, fetchHistory, deleteHistoryRecord, flushDeletions } =
  createTrainingRecords('hyrox', [], removeDeviceFromOutbox)
export { flushOutbox, fetchHistory, deleteHistoryRecord as deleteSession, flushDeletions }
export const { fetchRaces, toggleRaceRegistration } = createRaceCalendar('hyrox')

function readUser(userId = currentUserId()): User {
  const patch = loadJSON<Partial<User>>(accountStorageKey(USER_KEY, userId), {})
  return {
    id: userId ?? 'guest',
    name: '训练者',
    avatar: '',
    level: 'beginner',
    targetRace: '',
    ...patch,
    stats: { totalSessions: 0, totalKm: 0, streak: 0, bestModuleTime: 0, bestFullTime: 0, ...(patch.stats ?? {}) },
  }
}

// ---------- 后端 DTO 映射 ----------

/** 后端 EventLink → 前端 Race */
interface BackendMe {
  id: string
  nickname: string
  avatar: string | null
  gender: string | null
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  identities: { phone: string | null; email: string | null; wechat: string | null }
  hasPassword: boolean
  goals: { weeklySessions: number; weeklyMinutes: number }
}

function mergeBackendUser(backend: BackendMe): User {
  const local = readUser(backend.id)
  return {
    ...local,
    id: backend.id,
    name: backend.nickname || local.name,
    avatar: backend.avatar ?? local.avatar,
    // stats 来自本地累计（后端 Session 是器械数据，不适合替换）
  }
}

// ---------- 本地训练计划 ----------

export async function fetchPlans(): Promise<Plan[]> {
  return PLANS
}

// ---------- Coach 计划引擎 ----------

export interface PlanAnswersInput {
  goal: 'finish' | 'pb'
  experience: 'none' | 'once' | 'multi'
  days: number
  duration: number
  equipment: string[]
  weak: string
}

export interface RemoteGeneratedPlan {
  engine: 'deterministic'
  app: 'hyrox' | 'btwe'
  name: string
  level: 'beginner' | 'intermediate' | 'elite'
  durationWeeks: number
  sessionsPerWeek: number
  summary: string
  highlights: string[]
  targetFinish: string
  advice: string[]
  weeks: Array<{
    week: number
    phase: string
    focus: string
    volumeFactor: number
    sessions: Array<{
      day: string
      title: string
      detail: string
      intent: string
      guardrail: string
    }>
  }>
  basedOn: {
    recentCount: number
    avgTotalSec: number | null
    avgRunSplitSec: number | null
    weakestStations: string[]
    dataDriven: boolean
  }
}

/** 本地训练摘要：游客也能让计划引擎基于真实数据校准 */
export function localPlanDigest() {
  const completed = readSessions().filter((s) => s.completed)
  if (!completed.length) return undefined
  const avgTotalSec = Math.round(
    completed.reduce((sum, s) => sum + s.totalTime, 0) / completed.length
  )
  const splits = completed.flatMap((s) => s.runSplit).filter((n) => n > 0)
  return {
    recentCount: completed.length,
    avgTotalSec,
    ...(splits.length
      ? { avgRunSplitSec: Math.round(splits.reduce((a, b) => a + b, 0) / splits.length) }
      : {}),
  }
}

/** 后端确定性引擎生成计划；失败返回 null，由调用方回退本地生成器 */
export async function generateRemotePlan(
  answers: PlanAnswersInput
): Promise<RemoteGeneratedPlan | null> {
  try {
    return await http.post<RemoteGeneratedPlan>('/coach/plan/generate', {
      app: 'hyrox',
      goal: answers.goal,
      experience: answers.experience,
      daysPerWeek: answers.days,
      sessionMinutes: answers.duration,
      equipment: answers.equipment,
      weak: answers.weak,
      digest: localPlanDigest(),
    })
  } catch {
    return null
  }
}

/** 游客侧聊天上下文摘要 */
export function localCoachContext(): string | undefined {
  const digest = localPlanDigest()
  if (!digest) return undefined
  const m = Math.floor((digest.avgTotalSec ?? 0) / 60)
  const s = (digest.avgTotalSec ?? 0) % 60
  const split = digest.avgRunSplitSec
    ? `；平均跑段 ${Math.floor(digest.avgRunSplitSec / 60)} 分 ${digest.avgRunSplitSec % 60} 秒/公里`
    : ''
  return `最近 ${digest.recentCount} 次完成训练，平均用时 ${m} 分 ${s} 秒${split}`
}

// ---------- Sessions（HYROX 专项训练记录 → localStorage） ----------

export async function fetchSessions(): Promise<SessionRecord[]> {
  return readSessions()
}

export async function saveSession(session: SessionRecord, userId = currentUserId()): Promise<SessionRecord> {
  const list = readSessions(userId)
  const existing = list.find((s) => s.id === session.id)
  if (existing) {
    if (userId) enqueueRecord(existing, userId)
    return existing
  }
  writeSessions([session, ...list], userId)
  const distanceM = session.distanceM ?? (session.completed ? 3200 : 0)
  addActivity({
    id: session.id,
    app: 'hyrox',
    uid: userId ?? 'guest',
    date: session.date,
    durationSec: session.totalTime,
    distanceM,
  })

  const user = readUser(userId)
  const userKey = accountStorageKey(USER_KEY, userId)
  const previous = loadJSON<Partial<User>>(userKey, {})
  const best = session.completed
    ? Math.min(user.stats.bestFullTime || session.totalTime, session.totalTime)
    : user.stats.bestFullTime
  saveJSON(userKey, {
    ...previous,
    stats: {
      ...user.stats,
      totalSessions: user.stats.totalSessions + (session.completed ? 1 : 0),
      totalKm: Number(
        (user.stats.totalKm + distanceM / 1000).toFixed(1)
      ),
      bestFullTime: best,
    },
  })

  // 游客只写本地。账号记录先入队，恢复网络后由同一账号补传。
  if (userId) enqueueRecord(session, userId)

  return session
}

// ---------- User（后端 /me + 本地补丁合并） ----------

export async function fetchUser(): Promise<User> {
  if (!isAuthed()) return readUser()
  try {
    const backend = await http.get<BackendMe>('/me')
    return mergeBackendUser(backend)
  } catch {
    return readUser()
  }
}

export async function updateUser(
  patch: Partial<Pick<User, 'name' | 'avatar' | 'targetRace'>>
): Promise<User> {
  const userKey = accountStorageKey(USER_KEY)
  const current = loadJSON<Partial<User>>(userKey, {})
  const localPatch: Partial<User> = {}

  if (patch.name) {
    localPatch.name = patch.name
    // 已登录 → 同步到后端
    if (isAuthed()) {
      http.patch('/me', { nickname: patch.name }).catch(() => {})
    }
  }
  if (patch.avatar !== undefined) {
    localPatch.avatar = patch.avatar
    if (isAuthed()) {
      http.patch('/me', { avatar: patch.avatar }).catch(() => {})
    }
  }
  if (patch.targetRace !== undefined) localPatch.targetRace = patch.targetRace

  saveJSON(userKey, { ...current, ...localPatch })
  return readUser()
}

// ---------- Auth（供未来登录页使用） ----------

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: BackendMe
}

export async function sendSmsCode(
  phone: string
): Promise<{ sent: boolean; cooldown?: number; devCode?: string }> {
  return http.post<{ sent: boolean; cooldown?: number; devCode?: string }>(
    '/auth/sms/send',
    { phone, scene: 'login' },
    false
  )
}

export async function loginWithSms(phone: string, code: string): Promise<LoginResult> {
  const res = await http.post<LoginResult>(
    '/auth/sms/login',
    { phone, code },
    false
  )
  setTokens(res.accessToken, res.refreshToken)
  // 同步到 SSO localStorage（便于同域其他 app 识别）
  try {
    saveJSON('fitbest:session', res.user.id)
    const users = loadJSON<Array<{ id: string; nickname: string; avatar?: string }>>('fitbest:users', [])
    const idx = users.findIndex((u) => u.id === res.user.id)
    const record = { id: res.user.id, nickname: res.user.nickname, avatar: res.user.avatar ?? undefined }
    if (idx >= 0) users[idx] = record
    else users.push(record)
    saveJSON('fitbest:users', users)
  } catch {
    // ignore
  }
  return res
}

// ---------- 本地数据清理 ----------

export function clearSessions() {
  const userId = currentUserId()
  for (const { id } of readSessions(userId)) removeDeviceFromOutbox(userId, id)
  writeSessions([], userId)
  if (userId) clearOutbox(userId)
  clearActivity('hyrox', userId)
}

export function resetLocalData() {
  clearSessions()
  removeKey(accountStorageKey(USER_KEY))
  removeKey(accountStorageKey(RACES_KEY))
  removeKey('hyrox:prefs')
  removeKey('hyrox:coach-chat')
  removeKey('hyrox-selected-plan')
}
