import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { useLocation, useNavigate } from 'react-router-dom'
import { bleAdapter } from './ble'
import {
  NATIVE_BACKGROUND_EVENT,
  NATIVE_FOREGROUND_EVENT,
  handleNativeBack,
  isAndroid,
  isNative,
  registerNativeBackHandler,
} from './runtime'

export function useNativeBack(active: boolean, onBack: () => void): void {
  const callbackRef = useRef(onBack)
  useEffect(() => {
    callbackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!isNative || !active) return
    return registerNativeBackHandler(() => callbackRef.current())
  }, [active])
}

export default function NativeRuntime() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!isNative) return

    let disposed = false
    const handles: PluginListenerHandle[] = []
    const listen = (pending: Promise<PluginListenerHandle>) => {
      void pending.then((handle) => {
        if (disposed) void handle.remove()
        else handles.push(handle)
      })
    }

    void Promise.allSettled([
      StatusBar.setOverlaysWebView({ overlay: true }),
      StatusBar.setStyle({ style: Style.Light }),
      StatusBar.setBackgroundColor({ color: '#f5f6f7' }),
      StatusBar.show(),
    ])
    const splashTimer = window.setTimeout(() => {
      void SplashScreen.hide().catch(() => undefined)
    }, 0)

    listen(
      App.addListener('appStateChange', ({ isActive }) => {
        window.dispatchEvent(new Event(isActive ? NATIVE_FOREGROUND_EVENT : NATIVE_BACKGROUND_EVENT))
        if (!isActive) {
          void KeepAwake.allowSleep().catch(() => undefined)
          void bleAdapter.cancelScan().catch(() => undefined)
        }
      }),
    )

    if (isAndroid) {
      listen(
        App.addListener('backButton', ({ canGoBack }) => {
          if (handleNativeBack()) return
          if (pathnameRef.current !== '/' && canGoBack) navigate(-1)
          else void App.minimizeApp().catch(() => undefined)
        }),
      )
    }

    return () => {
      disposed = true
      window.clearTimeout(splashTimer)
      handles.forEach((handle) => void handle.remove())
    }
  }, [navigate])

  return null
}
