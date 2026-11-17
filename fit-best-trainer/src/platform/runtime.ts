import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const isAndroid = Capacitor.getPlatform() === 'android'
export const NATIVE_BACKGROUND_EVENT = 'fitbest:native-background'
export const NATIVE_FOREGROUND_EVENT = 'fitbest:native-foreground'

const backHandlers: Array<() => void> = []

export function registerNativeBackHandler(handler: () => void): () => void {
  backHandlers.push(handler)
  let registered = true
  return () => {
    if (!registered) return
    registered = false
    const index = backHandlers.indexOf(handler)
    if (index >= 0) backHandlers.splice(index, 1)
  }
}

export function handleNativeBack(): boolean {
  const handler = backHandlers[backHandlers.length - 1]
  if (!handler) return false
  handler()
  return true
}

export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    await Browser.open({ url, toolbarColor: '#f5f6f7' })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function isCancellation(error: unknown): boolean {
  if (!error) return false
  const value = error as { name?: string; code?: string; message?: string }
  const code = `${value.code ?? ''} ${value.message ?? ''}`
  return value.name === 'AbortError' || /cancel|dismiss|取消/i.test(code)
}
