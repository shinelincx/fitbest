import { useEffect } from 'react'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { isNative } from './runtime'

export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!isNative || !active) return

    let disposed = false
    let listener: PluginListenerHandle | undefined
    const acquire = () => {
      if (!disposed) void KeepAwake.keepAwake().catch(() => undefined)
    }
    acquire()

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) acquire()
      else void KeepAwake.allowSleep().catch(() => undefined)
    }).then((handle) => {
      if (disposed) void handle.remove()
      else listener = handle
    })

    return () => {
      disposed = true
      if (listener) void listener.remove()
      void KeepAwake.allowSleep().catch(() => undefined)
    }
  }, [active])
}
