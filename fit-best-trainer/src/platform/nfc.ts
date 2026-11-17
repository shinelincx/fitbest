import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { CapacitorNfc, type NdefRecord } from '@capgo/capacitor-nfc'
import { isNative } from './runtime'

type WebNdefRecord = { recordType: string; data?: DataView; encoding?: string }
type WebNdefReadingEvent = { message?: { records?: WebNdefRecord[] } }
type WebNdefReader = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>
  addEventListener: (type: 'reading', callback: (event: WebNdefReadingEvent) => void) => void
  removeEventListener: (type: 'reading', callback: (event: WebNdefReadingEvent) => void) => void
}

function abortError(): DOMException {
  return new DOMException('NFC session cancelled', 'AbortError')
}

function decodeNativeText(record: NdefRecord): string | null {
  const type = new TextDecoder().decode(new Uint8Array(record.type))
  if (type !== 'T' || record.payload.length === 0) return null
  const payload = new Uint8Array(record.payload)
  const status = payload[0]
  const languageLength = status & 0x3f
  const start = 1 + languageLength
  if (start > payload.length) return null
  const encoding = status & 0x80 ? 'utf-16be' : 'utf-8'
  return new TextDecoder(encoding).decode(payload.slice(start)).trim()
}

async function readNativeText(): Promise<string> {
  const { supported } = await CapacitorNfc.isSupported()
  if (!supported) throw new Error('当前设备不支持 NFC，请使用搜索或扫码')
  const { status } = await CapacitorNfc.getStatus()
  if (status === 'NFC_DISABLED') throw new Error('NFC 未开启，请在系统设置中开启后重试')
  if (status !== 'NFC_OK') throw new Error('当前设备不支持 NFC，请使用搜索或扫码')

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const handles: PluginListenerHandle[] = []
    const cleanup = () => {
      handles.forEach((handle) => void handle.remove())
      void CapacitorNfc.stopScanning().catch(() => undefined)
    }
    const finish = (text?: string, error?: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else if (text) resolve(text)
      else reject(new Error('无法识别的器械标签'))
    }

    void (async () => {
      handles.push(
        await CapacitorNfc.addListener('nfcEvent', (event) => {
          for (const record of event.tag.ndefMessage ?? []) {
            const text = decodeNativeText(record)
            if (text) {
              finish(text)
              return
            }
          }
          finish(undefined, new Error('无法识别的器械标签'))
        }),
      )
      handles.push(
        await CapacitorNfc.addListener('nfcSessionEnd', () => finish(undefined, abortError())),
      )
      handles.push(
        await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) finish(undefined, abortError())
        }),
      )
      if (settled) return
      await CapacitorNfc.startScanning({
        invalidateAfterFirstRead: true,
        alertMessage: '请靠近器械 NFC 标签',
      })
    })().catch((error) => finish(undefined, error))
  })
}

async function readWebText(): Promise<string> {
  const NDEF = (window as unknown as { NDEFReader?: new () => WebNdefReader }).NDEFReader
  if (!NDEF) throw new Error('当前设备不支持 NFC，请使用搜索或扫码')

  return new Promise<string>((resolve, reject) => {
    const reader = new NDEF()
    const controller = new AbortController()
    let settled = false
    const cleanup = () => {
      reader.removeEventListener('reading', onReading)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    const finish = (text?: string, error?: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      controller.abort()
      if (error) reject(error)
      else if (text) resolve(text)
      else reject(new Error('无法识别的器械标签'))
    }
    const onReading = (event: WebNdefReadingEvent) => {
      const record = event.message?.records?.find((item) => item.recordType === 'text')
      if (!record?.data) return
      const text = new TextDecoder(record.encoding || 'utf-8').decode(record.data).trim()
      finish(text || undefined)
    }
    const onVisibility = () => {
      if (document.hidden) finish(undefined, abortError())
    }

    reader.addEventListener('reading', onReading)
    document.addEventListener('visibilitychange', onVisibility)
    controller.signal.addEventListener('abort', () => finish(undefined, abortError()), { once: true })
    reader.scan({ signal: controller.signal }).catch((error) => finish(undefined, error))
  })
}

export function readTextOnce(): Promise<string> {
  return isNative ? readNativeText() : readWebText()
}
