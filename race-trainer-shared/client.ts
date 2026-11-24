/**
 * FITBEST 后端 API 客户端 —— fetch 薄封装
 * baseURL 与管理后台一致：/fit-best/api/v1（绝对路径，绕过 Vite base）
 *
 * 响应约定：
 *   成功 → 直接返回 controller data（无 envelope）
 *   失败 → HTTP 4xx/5xx，body 形如 { code: number, message: string }
 *
 * 鉴权：
 *   - Access Token 放 Authorization: Bearer <token>
 *   - Access 过期（401）时，自动用 refresh 静默刷新一次再重试
 *   - Refresh 也过期 → 清 token 并回首页
 */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || '/fit-best/api/v1'
const ACCESS_KEY = 'fitbest:access'
const REFRESH_KEY = 'fitbest:refresh'
const AUTH_CHANGE_EVENT = 'fitbest:auth-change'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function setTokens(access: string, refresh: string) {
  try {
    localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(ACCESS_KEY, access)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  } catch {
    // ignore
  }
}

export function clearTokens() {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  } catch {
    // ignore
  }
}

export function isAuthed(): boolean {
  return Boolean(getAccessToken())
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

export function currentUserId(): string | null {
  return tokenUserId(getAccessToken())
}

export function subscribeToAccount(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACCESS_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(AUTH_CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(AUTH_CHANGE_EVENT, listener)
  }
}

let pendingRefresh: { refresh: string; result: Promise<string | null> } | undefined

async function doRefresh(access: string, refresh: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.accessToken || tokenUserId(data.accessToken) !== tokenUserId(access)
      || getAccessToken() !== access || localStorage.getItem(REFRESH_KEY) !== refresh) return null
    setTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    return null
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { auth?: boolean; userId?: string; headers?: Record<string, string>; signal?: AbortSignal }
): Promise<T> {
  const auth = opts?.auth ?? true
  const url = path.startsWith('http') ? path : `${BASE}${path}`

  const headers: Record<string, string> = { ...opts?.headers }
  let token: string | null = null

  // GET 请求默认不加 Content-Type
  const init: RequestInit = { method, headers, signal: opts?.signal }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  if (auth) {
    token = getAccessToken()
    if (opts?.userId !== undefined && tokenUserId(token) !== opts.userId) {
      throw new AuthExpiredError('登录账号已切换')
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    throw new Error(`网络异常：${(err as Error).message}`)
  }

  // 401 且有 access token —— 尝试静默刷新一次
  if (res.status === 401 && token && auth) {
    const userId = tokenUserId(token)
    const activeToken = getAccessToken()
    if (!userId || tokenUserId(activeToken) !== userId) {
      throw new AuthExpiredError('登录账号已切换')
    }
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (activeToken === token) {
      if (refresh) {
        if (pendingRefresh?.refresh !== refresh) {
          const result = doRefresh(token, refresh).finally(() => {
            if (pendingRefresh?.result === result) pendingRefresh = undefined
          })
          pendingRefresh = { refresh, result }
        }
        await pendingRefresh.result
      }
    }
    const newToken = getAccessToken()
    if (!newToken || newToken === token || tokenUserId(newToken) !== userId) {
      if (newToken === token && localStorage.getItem(REFRESH_KEY) === refresh) clearTokens()
      throw new AuthExpiredError('登录已过期')
    }
    token = newToken
    headers['Authorization'] = `Bearer ${token}`
    res = await fetch(url, init)
  }

  // 失败响应
  if (!res.ok) {
    let message = res.status === 413 ? '上传超过大小限制' : '请求失败'
    try {
      const data = await res.json()
      if (data?.message) message = data.message
    } catch {
      // ignore
    }
    if (res.status === 401) {
      if (token && getAccessToken() === token) clearTokens()
      throw new AuthExpiredError(message)
    }
    throw new ApiError(res.status, message)
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T

  // 200/201 —— 解析 JSON
  try {
    return (await res.json()) as T
  } catch {
    return undefined as unknown as T
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class AuthExpiredError extends ApiError {
  constructor(message = '登录已过期') {
    super(401, message)
    this.name = 'AuthExpiredError'
  }
}

export const http = {
  postForm: <T>(path: string, body: FormData, key: string, signal: AbortSignal) =>
    request<T>('POST', path, body, { headers: { 'Idempotency-Key': key }, signal }),
  get: <T>(path: string, auth?: boolean) => request<T>('GET', path, undefined, { auth }),
  getForUser: <T>(userId: string, path: string) => request<T>('GET', path, undefined, { userId }),
  post: <T>(path: string, body?: unknown, auth?: boolean) => request<T>('POST', path, body, { auth }),
  postForUser: <T>(userId: string, path: string, body: unknown) => request<T>('POST', path, body, { userId }),
  patch: <T>(path: string, body?: unknown, auth?: boolean) => request<T>('PATCH', path, body, { auth }),
  deleteForUser: <T>(userId: string, path: string) => request<T>('DELETE', path, undefined, { userId }),
}
