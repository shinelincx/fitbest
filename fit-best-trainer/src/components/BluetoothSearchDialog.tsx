import { useEffect, useRef, useState } from 'react'
import { Bluetooth, LoaderCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { scanNearbyDevices } from '../platform/ble/native'
import type { BleDeviceRef } from '../platform/ble'

const SEARCH_HINT_DELAY_MS = 30_000

export interface BluetoothSearchRequest {
  allowUnfiltered?: boolean
  autoSelect?: boolean
  matches: (device: BleDeviceRef, services: string[]) => boolean
  finish: (device: BleDeviceRef | null, error?: unknown) => void
}

export default function BluetoothSearchDialog({ request }: { request: BluetoothSearchRequest }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [devices, setDevices] = useState<BleDeviceRef[]>([])
  const [showRetry, setShowRetry] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const showAllRef = useRef(false)
  const finish = useRef<(device: BleDeviceRef | null) => void>(() => undefined)
  const retry = useRef<() => void>(() => undefined)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  useEffect(() => {
    let finished = false
    let restarting = false
    let round = 0
    let scan: ReturnType<typeof scanNearbyDevices> | undefined
    let stopping: Promise<void> | undefined
    let hintTimer: number | undefined
    const start = window.setTimeout(beginScan, 0)

    function beginScan() {
      const currentRound = ++round
      scan = scanNearbyDevices((device, services) => {
        if (finished || currentRound !== round || (!showAllRef.current && !request.matches(device, services))) return
        if (request.autoSelect) {
          void complete(device)
          return
        }
        setDevices((previous) => previous.some((item) => item.id === device.id) ? previous : [...previous, device])
      })
      void scan.then(() => {
        if (!finished && currentRound === round) hintTimer = window.setTimeout(() => setShowRetry(true), SEARCH_HINT_DELAY_MS)
      }, () => complete(null))
    }

    function stopScan() {
      if (stopping) return stopping
      const active = scan
      scan = undefined
      stopping = (async () => {
        const stop = await active
        await stop?.()
      })().finally(() => { stopping = undefined })
      return stopping
    }

    async function complete(device: BleDeviceRef | null) {
      if (finished) return
      finished = true
      window.clearTimeout(start)
      window.clearTimeout(hintTimer)
      try {
        await stopScan()
        request.finish(device)
      } catch (error) {
        request.finish(null, error)
      }
    }

    retry.current = () => {
      if (finished || restarting) return
      restarting = true
      round += 1
      window.clearTimeout(hintTimer)
      setShowRetry(false)
      setDevices([])
      void stopScan().then(() => {
        restarting = false
        if (!finished) beginScan()
      }, (error) => {
        if (finished) return
        finished = true
        request.finish(null, error)
      })
    }
    finish.current = (device) => { if (!device || !restarting) void complete(device) }
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(hintTimer)
      if (scan || stopping) void complete(null)
    }
  }, [request])

  return (
    <dialog
      ref={dialog}
      aria-labelledby="bluetooth-search-title"
      onCancel={(event) => { event.preventDefault(); finish.current(null) }}
      className="fixed inset-x-0 bottom-0 mx-auto mb-0 mt-auto h-[67dvh] w-full max-w-md rounded-t-2xl bg-bg p-5 pb-[max(2rem,env(safe-area-inset-bottom))] text-text backdrop:bg-black/60 open:flex open:flex-col"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h2 id="bluetooth-search-title" className="font-display text-lg font-bold">{t('搜索蓝牙设备')}</h2>
        <button type="button" aria-label={t('关闭')} className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-sub" onClick={() => finish.current(null)}><X size={16} /></button>
      </div>
      <div role="status" className="mb-3 flex shrink-0 items-center justify-center gap-2 rounded-xl bg-surface py-3 text-sm text-text-sub">
        <LoaderCircle size={16} className="animate-spin text-primary motion-reduce:animate-none" />{t('正在搜索附近设备…')}
      </div>
      {request.allowUnfiltered && (
        <button type="button" aria-pressed={showAll}
          className="mb-2 min-h-9 shrink-0 self-end px-2 text-xs font-semibold text-text-sub underline"
          onClick={() => {
            showAllRef.current = !showAllRef.current
            setShowAll(showAllRef.current)
            retry.current()
          }}>
          {t(showAll ? '仅显示器械' : '显示全部设备')}
        </button>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {devices.map((device) => (
          <button key={device.id} type="button" className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-start text-sm shadow-card active:bg-surface-2" onClick={() => finish.current(device)}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-text-sub"><Bluetooth size={17} /></span>
            <span className="min-w-0 flex-1 truncate font-semibold">{device.name || t('未知设备')}</span>
            <span className="shrink-0 rounded-full bg-text px-4 py-1.5 text-xs font-semibold text-bg">{t('连接')}</span>
          </button>
        ))}
      </div>
      {showRetry && (
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p role="status" className="text-xs text-text-sub">{t('没找到你要连接的器械？')}</p>
          <button type="button" className="rounded-full bg-text px-4 py-2 text-xs font-semibold text-bg" onClick={() => retry.current()}>
            {t('重新搜索')}
          </button>
        </div>
      )}
    </dialog>
  )
}
