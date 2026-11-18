/**
 * FITBEST 后端 API 客户端 —— fetch 薄封装（参照 hyrox-trainer 实现，token 键一致实现同域 SSO）
 * baseURL 与管理后台一致：/fit-best/api/v1（绝对路径，绕过 Vite base）
 *
 * 响应约定（与后端契约）：
 *   成功 → 直接返回业务数据（无 envelope）
 *   失败 → HTTP 4xx/5xx + { code: number, message: string }
 *
 * 鉴权：
 *   - Access Token 放 Authorization: Bearer <token>
 *   - Access 过期（401）时，自动用 refresh 静默刷新一次再重试
 *   - Refresh 也过期 → 清 token（调用方回落游客/重新登录）
 */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || '/fit-best/api/v1'
const ACCESS_KEY = 'fitbest:access'
const REFRESH_KEY = 'fitbest:refresh'
export const SESSION_TOKEN_EVENT = 'fitbest:session-token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function isAuthed(): boolean {
  return Boolean(getAccessToken())
}

export function setTokens(access: string, refresh: string) {
  try {
    localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(ACCESS_KEY, access)
  } catch {
    // ignore
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    window.dispatchEvent(new Event(SESSION_TOKEN_EVENT))
  } catch {
    // ignore
  }
}

function tokenUserId(token: string | null): string | null {
  try {
    const payload = token?.split('.')[1]
    if (!payload) return null
    const { sub } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof sub === 'string' && sub.length > 0 ? sub : null
  } catch {
    return null
  }
}

export function hasAccessFor(userId: string): boolean {
  return tokenUserId(getAccessToken()) === userId
}

let pendingRefresh: { refresh: string; result: Promise<string | null> } | undefined

async function doRefresh(access: string, refresh: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      signal: AbortSignal.timeout?.(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (res.status === 401 || res.status === 403) return null
    if (!res.ok) throw new ApiError(res.status, '暂时无法刷新登录，请稍后重试')
    const data = await res.json()
    if (!data?.accessToken || tokenUserId(data.accessToken) !== tokenUserId(access)
      || getAccessToken() !== access || localStorage.getItem(REFRESH_KEY) !== refresh) return null
    setTokens(data.accessToken, data.refreshToken)
    return data.accessToken as string
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(0, '网络异常，登录状态已保留，请稍后重试')
  }
}

function refreshOnce(access: string, refresh: string): Promise<string | null> {
  if (pendingRefresh?.refresh === refresh) return pendingRefresh.result
  const result = doRefresh(access, refresh).finally(() => {
    if (pendingRefresh?.result === result) pendingRefresh = undefined
  })
  pendingRefresh = { refresh, result }
  return result
}

export class ApiError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export interface RequestOptions {
  method?: string
  body?: unknown
  /** 额外请求头（如 Idempotency-Key） */
  headers?: Record<string, string>
  /** 跳过 401 自动刷新（登录类接口自身返回 401 时不应触发） */
  noRefresh?: boolean
  /** 队列任务只允许使用记录所属账号的凭证。 */
  userId?: string
  signal?: AbortSignal
}

/** 发起 API 请求；失败抛 ApiError(code, message)，401 时自动刷新重试一次 */
export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<Response> =>
    fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

  const token = getAccessToken()
  if (options.userId !== undefined && tokenUserId(token) !== options.userId) {
    throw new ApiError(401, '登录账号已切换')
  }
  let res = await doFetch(token)

  if (res.status === 401 && !options.noRefresh && token) {
    const userId = tokenUserId(token)
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (refresh && getAccessToken() === token) await refreshOnce(token, refresh)
    const next = getAccessToken()
    if (userId && next !== token && tokenUserId(next) === userId) {
      res = await doFetch(next)
    } else if (next === token && localStorage.getItem(REFRESH_KEY) === refresh) {
      clearTokens()
    }
  }

  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    try {
      const data = (await res.json()) as { message?: string }
      if (data?.message) message = data.message
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
