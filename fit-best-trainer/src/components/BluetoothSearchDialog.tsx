import { useEffect, useRef, useState } from 'react'
import { Bluetooth, LoaderCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { scanNearbyDevices } from '../platform/ble/native'
import type { BleDeviceRef } from '../platform/ble'

export interface BluetoothSearchRequest {
  matches: (device: BleDeviceRef, services: string[]) => boolean
  finish: (device: BleDeviceRef | null, error?: unknown) => void
}

export default function BluetoothSearchDialog({ request }: { request: BluetoothSearchRequest }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [devices, setDevices] = useState<BleDeviceRef[]>([])
  const finish = useRef<(device: BleDeviceRef | null) => void>(() => undefined)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  useEffect(() => {
    let finished = false
    let scan: ReturnType<typeof scanNearbyDevices> | undefined
    const start = window.setTimeout(() => {
      scan = scanNearbyDevices((device, services) => {
        if (finished || !request.matches(device, services)) return
        setDevices((previous) => previous.some((item) => item.id === device.id) ? previous : [...previous, device])
      })
      void scan.catch(() => complete(null))
    }, 0)

    async function complete(device: BleDeviceRef | null) {
      if (finished) return
      finished = true
      window.clearTimeout(start)
      try {
        const stop = await scan
        await stop?.()
        request.finish(device)
      } catch (error) {
        request.finish(null, error)
      }
    }

    finish.current = (device) => { void complete(device) }
    return () => {
      window.clearTimeout(start)
      if (scan) void complete(null)
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
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
        {devices.map((device) => (
          <button key={device.id} type="button" className="flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-3 text-start text-sm shadow-card active:bg-surface-2" onClick={() => finish.current(device)}>
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-text-sub"><Bluetooth size={17} /></span>
            <span className="min-w-0 flex-1 truncate font-semibold">{device.name || t('未知设备')}</span>
            <span className="shrink-0 rounded-full bg-text px-4 py-1.5 text-xs font-semibold text-bg">{t('连接')}</span>
          </button>
        ))}
      </div>
    </dialog>
  )
}
