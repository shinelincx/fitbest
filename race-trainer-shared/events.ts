import { currentUserId, http } from './client'
import { accountStorageKey, type ActivityApp } from './sso'
import { loadJSON, saveJSON } from './storage'

export type RaceStatus = 'upcoming' | 'registration' | 'in_progress' | 'past'

interface EventLink {
  id: string
  title: string
  subtitle?: string | null
  startAt?: string | null
  endAt?: string | null
  status: string
  registered?: boolean
}

function eventStatus(event: EventLink, now: number): RaceStatus {
  const end = event.endAt ? Date.parse(event.endAt) : NaN
  if (event.status === 'archived' || end <= now) return 'past'
  if (event.status !== 'published') return 'upcoming'
  const start = event.startAt ? Date.parse(event.startAt) : NaN
  return start <= now ? 'in_progress' : 'registration'
}

export function createRaceCalendar(app: ActivityApp) {
  const key = `${app}:registered-races`
  const calendar = `${app}:race-calendar`

  return {
    async fetchRaces() {
      const userId = currentUserId()
      const cacheKey = accountStorageKey(calendar, userId)
      const registrationsKey = accountStorageKey(key, userId)
      let entries = loadJSON<EventLink[]>(cacheKey, [])
      try {
        const result = userId
          ? await http.getForUser<EventLink[]>(userId, '/events')
          : await http.get<EventLink[]>('/events', false)
        if (currentUserId() !== userId) return []
        if (!Array.isArray(result)) throw new Error('赛事列表响应无效')
        entries = result
        saveJSON(cacheKey, entries)
        if (userId) saveJSON(registrationsKey, entries.filter((event) => event.registered).map((event) => event.id))
      } catch {
        if (currentUserId() !== userId) return []
      }
      const registered = new Set(loadJSON<string[]>(registrationsKey, []))
      const now = Date.now()
      return entries.map((event) => ({
        id: event.id,
        name: event.title,
        city: event.subtitle ?? '',
        date: event.startAt ?? event.endAt ?? '',
        status: eventStatus(event, now),
        registered: Boolean(userId && registered.has(event.id)),
      }))
    },

    async toggleRaceRegistration(id: string, wasRegistered?: boolean) {
      const userId = currentUserId()
      if (!userId) throw new Error('请先登录再报名')
      const storageKey = accountStorageKey(key, userId)
      const current = loadJSON<string[]>(storageKey, [])
      const path = `/events/${encodeURIComponent(id)}/registration`
      const cancel = wasRegistered ?? current.includes(id)
      const reply = cancel
        ? await http.deleteForUser<{ registered: boolean }>(userId, path)
        : await http.postForUser<{ registered: boolean }>(userId, path, undefined)
      if (currentUserId() !== userId) throw new Error('登录账号已切换')
      if (typeof reply?.registered !== 'boolean') throw new Error('未收到报名确认，请刷新后重试')
      const latest = loadJSON<string[]>(storageKey, []).filter((eventId) => eventId !== id)
      saveJSON(storageKey, reply.registered ? [...latest, id] : latest)
      return reply.registered
    },
  }
}
