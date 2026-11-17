import { currentUserId } from './client'
import type { DeviceSessionInput } from './deviceProtocol'
import { createOutbox } from './outbox'
import { accountStorageKey, type ActivityApp } from './sso'
import { loadJSON, saveJSON } from './storage'

const BAND_SERIAL_KEY = 'fitbest:band-serial'
const LAST_SYNC_KEY = 'fitbest:band-last-ack'
const SYNC_EVENT = 'fitbest:device-sync-changed'

export function subscribeToDeviceSync(listener: () => void) {
  window.addEventListener(SYNC_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(SYNC_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function getLastDeviceSync(userId: string | null) {
  return loadJSON<string | null>(accountStorageKey(LAST_SYNC_KEY, userId), null)
}

/** 首次生成后固定在本机，用于把多场数据归到同一只手环。 */
export function bandSerial(): string {
  const stored = loadJSON<string | null>(BAND_SERIAL_KEY, null)
  if (stored) return stored
  const serial = `BAND-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  saveJSON(BAND_SERIAL_KEY, serial)
  return serial
}

export function createDeviceSync(app: ActivityApp) {
  const outbox = createOutbox<DeviceSessionInput>({
    key: `${app}:device-outbox`,
    path: '/me/device-sessions',
    id: (entry) => entry.clientSessionId,
    payload: (entry) => entry,
    discardGone: true,
    onAcknowledged: (userId) => saveJSON(accountStorageKey(LAST_SYNC_KEY, userId), new Date().toISOString()),
    onChanged: () => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT))
    },
  })

  return {
    pendingDeviceCount: outbox.count,
    flushDeviceOutbox: outbox.flush,
    removeDeviceFromOutbox: outbox.remove,
    // 游客数据留在本机，账号数据仅在该账号登录时补传。
    async syncDeviceSession(payload: DeviceSessionInput, userId = currentUserId()): Promise<void> {
      outbox.enqueue(userId, payload)
    },
  }
}
