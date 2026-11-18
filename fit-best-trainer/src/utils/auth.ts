// 账号体系 —— 双轨实现：
//  · 云端登录（短信 / 邮箱 / 密码）：走真实后端 /fit-best/api/v1，token 与 hyrox/btwe 站点同域共享（SSO）
//  · 游客与本地演示：账号与数据保存在 localStorage（fitbest 命名空间）

import { loadJSON, removeKey, saveJSON } from './storage'
import i18n from '../i18n'
import { clearTokens, getAccessUserId, request, setTokens } from '../api/client'

export interface Account {
  id: string
  phone: string
  email?: string
  wechatOpenid?: string
  wechatNickname?: string
  nickname: string
  passwordHash: string
  createdAt: string
  avatar?: string
  gender?: 'male' | 'female' | 'other'
  birthYear?: number
  heightCm?: number
  weightKg?: number
  goalSessions?: number
  goalMinutes?: number
}

export type ClearableProfileField = 'avatar' | 'gender' | 'birthYear' | 'heightCm' | 'weightKg'

export type ProfilePatch = Partial<
  Pick<
    Account,
    'nickname' | 'avatar' | 'gender' | 'birthYear' | 'heightCm' | 'weightKg' | 'goalSessions' | 'goalMinutes'
  >
> & { clear?: ClearableProfileField[] }

export type IdentityKind = 'phone' | 'email' | 'wechat'
export type Verification = { channel: 'phone' | 'email'; code: string }
export type CodeDelivery = { devCode?: string; cooldown?: number; expiresIn?: number }

const USERS_KEY = 'fitbest:users'
const SESSION_KEY = 'fitbest:session'
const CODES_KEY = 'fitbest:demo-codes'
/** 云端账号资料缓存（云端登录后供同步的 getSessionUser 使用） */
const CLOUD_ACCOUNT_KEY = 'fitbest:cloud-account'
/** 云端会话标记前缀（SESSION_KEY = cloud:<userId>） */
const CLOUD_PREFIX = 'cloud:'
const CLOUD_PASSWORD_SET = 'cloud:**'

export const PHONE_RE = /^1[3-9]\d{9}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const DEMO_CODE = '123456'

function readUsers(): Account[] {
  return loadJSON<Account[]>(USERS_KEY, [])
}

function writeUsers(list: Account[]) {
  saveJSON(USERS_KEY, list)
}

async function hashPassword(password: string): Promise<string> {
  const raw = `fitbest:v1:${password}`
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return `plain:${raw}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** 当前是否为云端登录会话 */
export function isCloudAuthed(): boolean {
  const subject = getAccessUserId()
  return subject !== null && isCloudAccount() && subject === currentUserId()
}

/** 凭证失效后仍保留账号归属，重新登录时继续补传。 */
export function isCloudAccount(): boolean {
  const id = loadJSON<string | null>(SESSION_KEY, null)
  return id !== null && id.startsWith(CLOUD_PREFIX)
}

function isCloudUser(id: string): boolean {
  const session = loadJSON<string | null>(SESSION_KEY, null)
  if (session === CLOUD_PREFIX + id) return true
  if (session === id) return false
  throw new Error(i18n.t('登录账号已切换'))
}

function setSession(id: string) {
  saveJSON(SESSION_KEY, id)
}

function readCloudAccount(): Account | null {
  return loadJSON<Account | null>(CLOUD_ACCOUNT_KEY, null)
}

function writeCloudAccount(account: Account) {
  saveJSON(CLOUD_ACCOUNT_KEY, account)
  setSession(CLOUD_PREFIX + account.id)
}

export function getSessionUser(): Account | null {
  const id = loadJSON<string | null>(SESSION_KEY, null)
  const subject = getAccessUserId()
  if (subject && id !== CLOUD_PREFIX + subject) return null
  if (!id) return null
  if (id.startsWith(CLOUD_PREFIX)) {
    const account = readCloudAccount()
    return account && id === CLOUD_PREFIX + account.id ? account : null
  }
  return readUsers().find((u) => u.id === id) ?? null
}

export async function restoreSharedSession(): Promise<Account | null> {
  const id = getAccessUserId()
  if (!id) return getSessionUser()
  const profile = await request<CloudProfile>('/me', { userId: id, signal: AbortSignal.timeout?.(8_000) })
  if (id !== getAccessUserId() || profile.id !== id) return getSessionUser()
  const account = toAccount(profile)
  writeCloudAccount(account)
  return account
}

export function getLocalGuestAccount(): Account {
  const users = readUsers()
  const existing = users.find((user) => user.id === 'guest')
  if (existing) {
    setSession(existing.id)
    return existing
  }
  const account: Account = {
    id: 'guest',
    phone: '',
    nickname: i18n.t('FITBEST 训练者'),
    passwordHash: '',
    createdAt: new Date().toISOString(),
  }
  writeUsers([...users, account])
  setSession(account.id)
  return account
}

export function currentUserId(): string | null {
  return getSessionUser()?.id ?? null
}

export function maskPhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

export function maskEmail(email?: string): string {
  if (!email) return ''
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}***@${domain}`
}

export function maskContact(account: Pick<Account, 'phone' | 'email'>): string {
  if (account.phone) return maskPhone(account.phone)
  if (account.email) return maskEmail(account.email)
  return 'FITBEST 训练者'
}

// —— 后端用户档案 → 本地 Account 映射 ——

interface CloudProfile {
  id: string
  nickname: string
  avatar?: string | null
  gender?: string | null
  birthYear?: number | null
  heightCm?: number | null
  weightKg?: number | null
  identities: { phone?: string | null; email?: string | null; wechat?: string | null }
  hasPassword: boolean
  goals: { weeklySessions: number; weeklyMinutes: number }
}

function toAccount(p: CloudProfile): Account {
  return {
    id: p.id,
    phone: p.identities.phone ?? '',
    email: p.identities.email ?? undefined,
    wechatOpenid: p.identities.wechat ?? undefined,
    nickname: p.nickname,
    passwordHash: p.hasPassword ? CLOUD_PASSWORD_SET : '',
    createdAt: new Date().toISOString(),
    avatar: p.avatar ?? undefined,
    gender: (p.gender as Account['gender']) ?? undefined,
    birthYear: p.birthYear ?? undefined,
    heightCm: p.heightCm ?? undefined,
    weightKg: p.weightKg ?? undefined,
    goalSessions: p.goals?.weeklySessions ?? 0,
    goalMinutes: p.goals?.weeklyMinutes ?? 0,
  }
}

function saveCloudProfile(id: string, profile: CloudProfile): Account {
  if (!isCloudUser(id) || profile.id !== id) throw new Error(i18n.t('登录账号已切换'))
  const account = toAccount(profile)
  writeCloudAccount(account)
  return account
}

interface LoginResult {
  accessToken: string
  refreshToken: string
  user: CloudProfile
}

async function cloudLogin(result: LoginResult): Promise<Account> {
  setTokens(result.accessToken, result.refreshToken)
  const account = toAccount(result.user)
  writeCloudAccount(account)
  return account
}

// —— 验证码 ——

type CodeEntry = { code: string; expiresAt: number }

function codeKey(purpose: 'sms' | 'email', target: string): string {
  return `${purpose}:${target}`
}

function readCodes(): Record<string, CodeEntry> {
  return loadJSON<Record<string, CodeEntry>>(CODES_KEY, {})
}

function issueCode(purpose: 'sms' | 'email', target: string): string {
  const codes = readCodes()
  codes[codeKey(purpose, target)] = { code: DEMO_CODE, expiresAt: Date.now() + 5 * 60 * 1000 }
  saveJSON(CODES_KEY, codes)
  return DEMO_CODE
}

function consumeCode(purpose: 'sms' | 'email', target: string, code: string) {
  const key = codeKey(purpose, target)
  const codes = readCodes()
  const entry = codes[key]
  if (!entry) throw new Error('请先获取验证码')
  if (Date.now() > entry.expiresAt) {
    delete codes[key]
    saveJSON(CODES_KEY, codes)
    throw new Error('验证码已过期，请重新获取')
  }
  if (code.trim() !== entry.code) throw new Error('验证码不正确')
  delete codes[key]
  saveJSON(CODES_KEY, codes)
}

type CodeScene = 'login' | 'bind'

export function sendSecurityCode(id: string, channel: Verification['channel']): Promise<CodeDelivery> {
  if (!isCloudUser(id)) throw new Error(i18n.t('请先登录'))
  return request('/me/security/code', { method: 'POST', body: { channel }, userId: id })
}

export async function sendSmsCode(phone: string, scene: CodeScene = 'login'): Promise<CodeDelivery> {
  const p = phone.trim()
  if (!PHONE_RE.test(p)) throw new Error('请输入正确的 11 位手机号')
  if (scene === 'bind' && !isCloudAccount()) return { devCode: issueCode('sms', p), cooldown: 60, expiresIn: 300 }
  return request<CodeDelivery>('/auth/sms/send', {
    method: 'POST',
    body: { phone: p, scene },
    noRefresh: true,
  })
}

export async function sendEmailCode(email: string, scene: CodeScene = 'login'): Promise<CodeDelivery> {
  const e = normalizeEmail(email)
  if (!EMAIL_RE.test(e)) throw new Error('请输入正确的邮箱地址')
  if (scene === 'bind' && !isCloudAccount()) return { devCode: issueCode('email', e), cooldown: 60, expiresIn: 300 }
  return request<CodeDelivery>('/auth/email/send', {
    method: 'POST',
    body: { email: e, scene },
    noRefresh: true,
  })
}

// —— 本地账号（游客 / 演示遗留数据）——

// —— 注册 / 登录（云端）——

export async function registerAccount(input: {
  phone: string
  password: string
  nickname: string
}): Promise<Account> {
  const phone = input.phone.trim()
  if (!PHONE_RE.test(phone)) throw new Error('请输入正确的 11 位手机号')
  if (input.password.length < 6) throw new Error('密码至少 6 位')
  const result = await request<LoginResult>('/auth/password/register', {
    method: 'POST',
    body: { phone, password: input.password, device: 'trainer-web' },
    noRefresh: true,
  })
  return cloudLogin(result)
}

export async function loginAccount(phone: string, password: string): Promise<Account> {
  const result = await request<LoginResult>('/auth/password/login', {
    method: 'POST',
    body: { account: phone.trim(), password, device: 'trainer-web' },
    noRefresh: true,
  })
  return cloudLogin(result)
}

export async function loginWithSms(phone: string, code: string, existingOnly?: boolean): Promise<Account> {
  const p = phone.trim()
  if (!PHONE_RE.test(p)) throw new Error('请输入正确的 11 位手机号')
  const result = await request<LoginResult>('/auth/sms/login', {
    method: 'POST',
    body: { phone: p, code: code.trim(), device: 'trainer-web', existingOnly },
    noRefresh: true,
  })
  return cloudLogin(result)
}

export async function loginWithEmail(email: string, code: string, existingOnly?: boolean): Promise<Account> {
  const e = normalizeEmail(email)
  if (!EMAIL_RE.test(e)) throw new Error('请输入正确的邮箱地址')
  const result = await request<LoginResult>('/auth/email/login', {
    method: 'POST',
    body: { email: e, code: code.trim(), device: 'trainer-web', existingOnly },
    noRefresh: true,
  })
  return cloudLogin(result)
}

// —— 微信（Web 端 OAuth 接入前暂不开放云端微信登录）——

export async function loginWithWechat(): Promise<Account | null> {
  throw new Error(i18n.t('微信登录即将开放，请先使用手机号或邮箱登录'))
}

export async function loginWithWechatPhone(_phone: string, _code: string): Promise<Account> {
  throw new Error(i18n.t('微信登录即将开放，请先使用手机号或邮箱登录'))
}

export async function bindEmail(id: string, email: string, code: string, verification?: Verification): Promise<Account> {
  const e = normalizeEmail(email)
  if (!EMAIL_RE.test(e)) throw new Error('请输入正确的邮箱地址')
  if (!isCloudUser(id)) {
    consumeCode('email', e, code)
    const users = readUsers()
    const index = users.findIndex((u) => u.id === id)
    if (index < 0) throw new Error('账号不存在，请重新登录')
    if (users.some((u) => u.id !== id && u.email === e)) throw new Error('该邮箱已绑定其他账号')
    const next = { ...users[index], email: e }
    const list = [...users]
    list[index] = next
    writeUsers(list)
    return next
  }
  const profile = await request<CloudProfile>('/me/identities/email', {
    method: 'POST',
    userId: id,
    body: { email: e, code: code.trim(), verification },
  })
  return saveCloudProfile(id, profile)
}

export async function bindPhone(id: string, phone: string, code: string, verification?: Verification, replace = false): Promise<Account> {
  const p = phone.trim()
  if (!PHONE_RE.test(p)) throw new Error('请输入正确的 11 位手机号')
  if (!isCloudUser(id)) {
    consumeCode('sms', p, code)
    const users = readUsers()
    const index = users.findIndex((u) => u.id === id)
    if (index < 0) throw new Error('账号不存在，请重新登录')
    if (users.some((u) => u.id !== id && u.phone === p)) throw new Error('该手机号已绑定其他账号')
    const current = users[index]
    if (current.phone && current.phone !== p) throw new Error('手机号绑定后暂不支持自助换绑')
    const next = { ...current, phone: p }
    const list = [...users]
    list[index] = next
    writeUsers(list)
    return next
  }
  const profile = await request<CloudProfile>('/me/identities/phone', {
    method: replace ? 'PUT' : 'POST',
    userId: id,
    body: { phone: p, code: code.trim(), verification },
  })
  return saveCloudProfile(id, profile)
}

export async function recoverPassword(id: string, password: string, verification: Verification): Promise<void> {
  if (!isCloudUser(id)) throw new Error(i18n.t('请使用已绑定的手机号或邮箱登录'))
  const result = await request<{ ok: boolean }>('/me/password/recovery', {
    method: 'PUT',
    userId: id,
    body: { password, verification },
  })
  if (result?.ok !== true) throw new Error(i18n.t('修改失败，请重试'))
  if (currentUserId() === id) clearTokens()
}

export async function bindWechat(_id: string): Promise<Account> {
  throw new Error(i18n.t('微信绑定即将开放，敬请期待'))
}

function methodCount(account: Account): number {
  return [account.phone, account.email, account.wechatOpenid].filter(Boolean).length
}

export async function unbindEmail(id: string, verification?: Verification): Promise<Account> {
  if (!isCloudUser(id)) {
    const users = readUsers()
    const index = users.findIndex((u) => u.id === id)
    if (index < 0) throw new Error('账号不存在，请重新登录')
    if (!users[index].email) return users[index]
    if (methodCount(users[index]) <= 1) throw new Error('至少保留一种登录方式')
    const next = { ...users[index], email: undefined }
    const list = [...users]
    list[index] = next
    writeUsers(list)
    return next
  }
  const profile = await request<CloudProfile>('/me/identities/email', { method: 'DELETE', userId: id, body: verification })
  return saveCloudProfile(id, profile)
}

export async function unbindWechat(id: string): Promise<Account> {
  if (!isCloudUser(id)) {
    const users = readUsers()
    const index = users.findIndex((u) => u.id === id)
    if (index < 0) throw new Error('账号不存在，请重新登录')
    if (!users[index].wechatOpenid) return users[index]
    if (methodCount(users[index]) <= 1) throw new Error('至少保留一种登录方式')
    const next = { ...users[index], wechatOpenid: undefined, wechatNickname: undefined }
    const list = [...users]
    list[index] = next
    writeUsers(list)
    return next
  }
  const profile = await request<CloudProfile>('/me/identities/wechat', { method: 'DELETE', userId: id })
  return saveCloudProfile(id, profile)
}

export async function logoutAccount(): Promise<void> {
  const id = loadJSON<string | null>(SESSION_KEY, null)
  if (id?.startsWith(CLOUD_PREFIX)) {
    const refresh = localStorage.getItem('fitbest:refresh')
    try {
      await request('/auth/logout', { method: 'POST', body: refresh ? { refreshToken: refresh } : {} })
    } catch {
      // 令牌已失效时忽略
    }
    clearTokens()
    removeKey(CLOUD_ACCOUNT_KEY)
  }
  removeKey(SESSION_KEY)
}

export async function updateAccount(id: string, patch: ProfilePatch): Promise<Account> {
  if (!isCloudUser(id)) {
    const users = readUsers()
    const index = users.findIndex((u) => u.id === id)
    if (index < 0) throw new Error('账号不存在，请重新登录')
    const { clear, ...fields } = patch
    const next = { ...users[index], ...fields }
    for (const field of clear ?? []) delete next[field]
    const list = [...users]
    list[index] = next
    writeUsers(list)
    return next
  }

  const profileBody: Record<string, unknown> = {}
  if (patch.clear?.length) profileBody.clear = patch.clear
  if (patch.nickname !== undefined) profileBody.nickname = patch.nickname
  if (patch.avatar !== undefined) profileBody.avatar = patch.avatar
  if (patch.gender !== undefined) profileBody.gender = patch.gender
  if (patch.birthYear !== undefined) profileBody.birthYear = patch.birthYear
  if (patch.heightCm !== undefined) profileBody.heightCm = patch.heightCm
  if (patch.weightKg !== undefined) profileBody.weightKg = patch.weightKg
  let saved: Account | undefined
  if (Object.keys(profileBody).length > 0) {
    const profile = await request<CloudProfile>('/me', { method: 'PATCH', body: profileBody, userId: id })
    saved = saveCloudProfile(id, profile)
  }
  if (patch.goalSessions !== undefined || patch.goalMinutes !== undefined) {
    const profile = await request<CloudProfile>('/me/goals', {
      method: 'PATCH',
      userId: id,
      body: {
        weeklySessions: patch.goalSessions,
        weeklyMinutes: patch.goalMinutes,
      },
    })
    return saveCloudProfile(id, profile)
  }
  return saved ?? saveCloudProfile(id, await request<CloudProfile>('/me', { userId: id }))
}

async function saveCloudPassword(id: string, password: string, oldPassword?: string, verification?: Verification): Promise<Account> {
  const result = await request<{ ok: boolean }>('/me/password', {
    method: 'PUT',
    userId: id,
    body: { password, oldPassword, verification },
  })
  if (result?.ok !== true) throw new Error(i18n.t('修改失败，请重试'))
  const current = getSessionUser()
  if (!isCloudUser(id) || current?.id !== id) throw new Error(i18n.t('登录账号已切换'))
  const account = { ...current, passwordHash: CLOUD_PASSWORD_SET }
  writeCloudAccount(account)
  return account
}

export async function changePassword(id: string, oldPassword: string, newPassword: string): Promise<Account> {
  if (newPassword.length < 6) throw new Error('新密码至少 6 位')
  if (isCloudUser(id)) return saveCloudPassword(id, newPassword, oldPassword)
  const users = readUsers()
  const index = users.findIndex((u) => u.id === id)
  if (index < 0) throw new Error('账号不存在，请重新登录')
  if (!users[index].passwordHash) throw new Error('当前账号未设置密码')
  if (users[index].passwordHash !== (await hashPassword(oldPassword))) throw new Error('原密码不正确')
  const list = [...users]
  list[index] = { ...users[index], passwordHash: await hashPassword(newPassword) }
  writeUsers(list)
  return list[index]
}

export async function setPassword(id: string, newPassword: string, verification?: Verification): Promise<Account> {
  if (newPassword.length < 6) throw new Error('密码至少 6 位')
  if (isCloudUser(id)) return saveCloudPassword(id, newPassword, undefined, verification)
  const users = readUsers()
  const index = users.findIndex((u) => u.id === id)
  if (index < 0) throw new Error('账号不存在，请重新登录')
  const list = [...users]
  list[index] = { ...users[index], passwordHash: await hashPassword(newPassword) }
  writeUsers(list)
  return list[index]
}

export async function deleteAccount(id: string, password?: string, verification?: Verification): Promise<void> {
  if (isCloudUser(id)) {
    const result = await request<{ ok: boolean }>('/me', {
      method: 'DELETE',
      userId: id,
      body: password || verification ? { password, verification } : undefined,
    })
    if (result?.ok !== true) throw new Error(i18n.t('注销失败，请重试'))
    if (!isCloudUser(id)) throw new Error(i18n.t('登录账号已切换'))
    clearTokens()
    removeKey(CLOUD_ACCOUNT_KEY)
    removeKey(SESSION_KEY)
    return
  }
  const user = readUsers().find((u) => u.id === id)
  if (!user) throw new Error('账号不存在，请重新登录')
  if (user.passwordHash && (!password || user.passwordHash !== await hashPassword(password))) {
    throw new Error(i18n.t('密码不正确，无法注销'))
  }
  if (isCloudUser(id)) throw new Error(i18n.t('登录账号已切换'))
  writeUsers(readUsers().filter((u) => u.id !== id))
  removeKey(`fitbest:sessions:${id}`)
  removeKey(`fitbest:strength:${id}`)
  if (loadJSON<string | null>(SESSION_KEY, null) === id) removeKey(SESSION_KEY)
}
