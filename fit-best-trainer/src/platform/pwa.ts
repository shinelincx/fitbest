import { useSyncExternalStore } from 'react'
import { isNative } from './runtime'

interface InstallPrompt extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const displayMode = typeof window !== 'undefined' ? window.matchMedia?.('(display-mode: standalone)') : undefined
let state = {
  prompt: null as InstallPrompt | null,
  installed: displayMode?.matches || (typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
  update: null as ServiceWorker | null,
}
const subscribers = new Set<() => void>()

function updateState(patch: Partial<typeof state>) {
  state = { ...state, ...patch }
  subscribers.forEach((callback) => callback())
}

function subscribe(callback: () => void) {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

export function usePwa() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

export function initPwa() {
  if (isNative || import.meta.env.VITE_NATIVE === 'true') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    updateState({ prompt: event as InstallPrompt })
  })
  window.addEventListener('appinstalled', () => updateState({ prompt: null, installed: true }))
  displayMode?.addEventListener?.('change', (event) => updateState({ installed: event.matches }))
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).then((registration) => {
    const checkWaiting = () => {
      if (registration.waiting && navigator.serviceWorker.controller) updateState({ update: registration.waiting })
    }
    checkWaiting()
    const observeInstall = () => {
      registration.installing?.addEventListener('statechange', checkWaiting)
    }
    observeInstall()
    registration.addEventListener('updatefound', observeInstall)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration.update().catch(() => {})
    })
  }).catch(() => {})
}

export async function promptInstall() {
  const event = state.prompt
  if (!event) return undefined
  updateState({ prompt: null })
  // 保持在用户点击产生的激活窗口内调用浏览器安装提示。
  await event.prompt()
  return (await event.userChoice).outcome
}

export function updateFitbest() {
  const worker = state.update
  if (!worker) return
  const route = location.hash
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (location.hash === route) location.reload()
  }, { once: true })
  worker.postMessage({ type: 'SKIP_WAITING' })
  updateState({ update: null })
}
