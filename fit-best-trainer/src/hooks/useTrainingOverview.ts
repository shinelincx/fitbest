import { useEffect, useState } from 'react'
import { fetchSessions, fetchStrengthSessions, subscribeToMachineSessions } from '../api'
import type { MachineSession, StrengthSession } from '../types'
import { ACTIVITY_KEY, fetchActivity, type ActivityEntry } from '../utils/activity'
import { isCloudAccount } from '../utils/auth'
import { summarizeTraining } from '../utils/trainingOverview'

type Snapshot = {
  owner: string | null
  sessions: MachineSession[]
  strength: StrengthSession[]
  activity: ActivityEntry[]
  failed: boolean
}

export function useTrainingOverview(owner: string | null, sessionExpired = false) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [time, setTime] = useState(() => new Date())
  const [online, setOnline] = useState(() => navigator.onLine)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let generation = 0
    let active = true
    let controller: AbortController | undefined
    async function refresh() {
      const request = ++generation
      controller?.abort()
      controller = new AbortController()
      setTime(new Date())
      setOnline(navigator.onLine)
      let failed = false
      const [cardio, weights, race] = await Promise.allSettled([
        fetchSessions({ onCloudError: () => { failed = true } }),
        fetchStrengthSessions(owner),
        fetchActivity(owner ?? 'guest', isCloudAccount(), controller.signal),
      ])
      if (!active || request !== generation) return
      setSnapshot({
        owner,
        sessions: cardio.status === 'fulfilled' ? cardio.value : [],
        strength: weights.status === 'fulfilled' ? weights.value : [],
        activity: race.status === 'fulfilled' ? race.value.items : [],
        failed: failed || cardio.status === 'rejected' || weights.status === 'rejected' || race.status === 'rejected' || race.value.failed,
      })
      setTime(new Date())
    }

    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ACTIVITY_KEY || /^(fitbest:(sessions|strength)|(hyrox|btwe):(sessions|record-outbox|record-deletions)):/.test(event.key)) void refresh()
    }
    const unsubscribe = subscribeToMachineSessions(() => void refresh())
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(() => setTime(new Date()), 15_000)
    void refresh()
    return () => {
      active = false
      controller?.abort()
      unsubscribe()
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [owner, retry, sessionExpired])

  const current = snapshot?.owner === owner ? snapshot : undefined
  const sessions = current?.sessions ?? []
  const strength = current?.strength ?? []
  return {
    sessions, strength, time,
    ...summarizeTraining(sessions, strength, current?.activity ?? [], time),
    loading: current === undefined,
    failed: current?.failed ?? false,
    online,
    retry: () => setRetry((value) => value + 1),
  }
}
