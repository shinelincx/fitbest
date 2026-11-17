import { ApiError, currentUserId, http, subscribeToAccount } from './client'
import { accountStorageKey } from './sso'
import { loadJSON } from './storage'

interface OutboxOptions<Entry> {
  key: string
  path: string
  id: (entry: Entry) => string
  payload: (entry: Entry) => unknown
  onAcknowledged?: (userId: string, entry: Entry, serverId: string) => void
  onGone?: (userId: string, entry: Entry) => void
  onChanged?: () => void
  discardGone?: boolean
}

export function createOutbox<Entry>(options: OutboxOptions<Entry>) {
  const flushing = new Map<string, Promise<void>>()

  function read(userId: string | null): Entry[] {
    const list = loadJSON<Entry[]>(accountStorageKey(options.key, userId), [])
    return Array.isArray(list) ? list : []
  }

  function write(userId: string | null, list: Entry[]) {
    localStorage.setItem(accountStorageKey(options.key, userId), JSON.stringify(list))
    options.onChanged?.()
  }

  function remove(userId: string | null, id: string) {
    write(userId, read(userId).filter((entry) => options.id(entry) !== id))
  }

  async function flushForUser(userId: string) {
    const rejected = new Set<string>()
    try {
      while (currentUserId() === userId) {
        const entry = read(userId).find((row) => !rejected.has(options.id(row)))
        if (!entry) break
        const id = options.id(entry)
        let serverId: string
        try {
          const reply = await http.postForUser<{ id: string }>(userId, options.path, options.payload(entry))
          if (!reply?.id) break
          serverId = reply.id
        } catch (error) {
          if (options.discardGone && error instanceof ApiError && error.status === 410) {
            options.onGone?.(userId, entry)
            remove(userId, id)
            continue
          }
          // 单条业务拒绝保留在本机，网络或暂时性服务错误留到下次补传。
          if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500
            || [401, 408, 429].includes(error.status)) break
          rejected.add(id)
          continue
        }
        options.onAcknowledged?.(userId, entry, serverId)
        remove(userId, id)
      }
    } catch {
      // 服务端已确认但本机删队失败时，使用原 ID 重放，由服务端去重。
    }
  }

  function flush(): Promise<void> {
    const userId = currentUserId()
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve()
    const current = flushing.get(userId)
    if (current) return current
    const job = Promise.resolve().then(() => flushForUser(userId)).finally(() => flushing.delete(userId))
    flushing.set(userId, job)
    return job
  }

  function enqueue(userId: string | null, entry: Entry) {
    const id = options.id(entry)
    write(userId, [entry, ...read(userId).filter((row) => options.id(row) !== id)])
    if (userId && userId === currentUserId()) void flush()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', flush)
    subscribeToAccount(flush)
    void flush()
  }

  return {
    enqueue,
    flush,
    remove,
    clear: (userId: string) => write(userId, []),
    count: (userId: string | null) => read(userId).length,
    has: (userId: string, id: string) => read(userId).some((entry) => options.id(entry) === id),
  }
}
