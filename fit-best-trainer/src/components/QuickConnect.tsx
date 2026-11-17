import { useTranslation } from 'react-i18next'
import { Bluetooth, X } from 'lucide-react'
import { useDevices, type DeviceType } from '../context/DeviceContext'

export default function QuickConnect({
  type,
  label = '连接',
  full = false,
}: {
  type: DeviceType
  label?: string
  full?: boolean
}) {
  const { t } = useTranslation()
  const { devices, scanDevices, disconnectDevice, supported } = useDevices()
  const d = devices[type]
  const busy = d.status === 'scanning' || d.status === 'connecting'

  if (d.connected) {
    return (
      <button
        type="button"
        onClick={() => disconnectDevice(type)}
        title={t('断开连接')}
        className="flex shrink-0 items-center gap-1 rounded-full bg-connected/10 px-2.5 py-1 text-[12px] font-medium text-connected"
      >
        <Bluetooth size={11} /> {t('已连接')}
        <X size={11} className="opacity-50" />
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={busy || !supported}
      onClick={() => scanDevices(type)}
      className={`border border-border bg-surface font-medium text-text transition-colors active:bg-surface-2 disabled:opacity-60 ${
        full ? 'w-full rounded-md py-2.5 text-[15px]' : 'shrink-0 rounded-full px-3 py-1.5 text-[13px]'
      }`}
    >
      {busy ? (d.status === 'scanning' ? t('搜索中…') : t('连接中…')) : t(label)}
    </button>
  )
}
