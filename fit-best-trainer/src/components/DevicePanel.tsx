import { useTranslation } from 'react-i18next'
import {
  Bluetooth,
  BluetoothConnected,
  Loader2,
  Zap,
  Activity,
  Gauge,
  Flame,
  Heart,
  X,
  Radio,
} from 'lucide-react'
import { useDevices, type DeviceType, type DeviceMetrics, type ConnectStatus } from '../context/DeviceContext'

const TYPE_META: Record<DeviceType, { label: string; icon: typeof Gauge; units: string }> = {
  treadmill: { label: '智能跑步机', icon: Activity, units: 'km/h' },
  rower: { label: '智能划船机', icon: Activity, units: 'spm' },
  ski: { label: '智能滑雪机', icon: Activity, units: 'spm' },
  bike: { label: '智能风阻单车', icon: Gauge, units: 'rpm' },
  spin: { label: '智能动感单车', icon: Gauge, units: 'rpm' },
  elliptical: { label: '智能椭圆机', icon: Activity, units: 'spm' },
  upright: { label: '智能健身车', icon: Gauge, units: 'rpm' },
  stair: { label: '智能楼梯机', icon: Activity, units: 'spm' },
  sled: { label: '智能雪橇', icon: Activity, units: 'm/s' },
  rep: { label: '智能计数传感器', icon: Activity, units: '次' },
  heartRate: { label: '智能心率带', icon: Heart, units: 'bpm' },
}

const STATUS_TEXT: Record<ConnectStatus, string> = {
  idle: '未连接',
  scanning: '扫描器械中…',
  connecting: '正在连接…',
  connected: '已连接',
  failed: '连接失败',
}

function MetricRow({ m }: { m: DeviceMetrics }) {
  const { t } = useTranslation()
  const items = [
    { icon: Gauge, label: '速度', value: m.speed != null ? `${m.speed}` : '—' },
    { icon: Activity, label: '距离', value: m.distance != null ? `${m.distance}` : '—' },
    { icon: Zap, label: '功率', value: m.power != null ? `${m.power}` : '—' },
    { icon: Flame, label: '消耗', value: m.calories != null ? `${m.calories}` : '—' },
    { icon: Heart, label: '心率', value: m.heartRate != null ? `${m.heartRate}` : '—' },
  ]
  return (
    <div className="mt-3 grid grid-cols-5 gap-1.5">
      {items.map((it) => {
        const Icon = it.icon
        return (
          <div key={it.label} className="rounded bg-surface-2 p-1.5 text-center">
            <Icon size={12} className="mx-auto text-text-sub" />
            <p className="mt-0.5 font-mono text-[14px] font-semibold text-text">{it.value}</p>
            <p className="text-[11px] text-text-sub">{t(it.label)}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function DevicePanel({ types }: { types: DeviceType[] }) {
  const { t } = useTranslation()
  const { devices, scanDevices, disconnectDevice, supported } = useDevices()

  return (
    <div className="space-y-3">
      {types.map((type) => {
        const meta = TYPE_META[type]
        const Icon = meta.icon
        const d = devices[type]
        const scanning = d.status === 'scanning'
        const connecting = d.status === 'connecting'
        const busy = scanning || connecting
        return (
          <div
            key={type}
            className={`rounded-md border p-4 transition-colors ${
              d.connected ? 'border-connected/30 bg-connected/5' : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-md ${
                    d.connected ? 'bg-connected/10 text-connected' : 'bg-surface-2 text-text-sub'
                  }`}
                >
                  {busy ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t(meta.label)}</p>
                  <p
                    className={`flex items-center gap-1 text-xs ${
                      d.connected ? 'text-connected' : busy ? 'text-warning' : 'text-text-sub'
                    }`}
                  >
                    {d.connected ? (
                      <>
                        <BluetoothConnected size={12} /> {t(d.name)}
                      </>
                    ) : scanning ? (
                      <>
                        <Radio size={12} className="animate-pulse" /> {t('搜索中…')}
                      </>
                    ) : connecting ? (
                      <>
                        <Radio size={12} className="animate-spin" /> {t('连接中…')}
                      </>
                    ) : (
                      <>
                        <Bluetooth size={12} /> {t(STATUS_TEXT[d.status])}
                      </>
                    )}
                  </p>
                </div>
              </div>
              {d.connected ? (
                <button
                  onClick={() => disconnectDevice(type)}
                  className="rounded-full bg-surface-2 p-2 text-text-sub transition-colors active:bg-surface"
                  aria-label={t('断开连接')}
                >
                  <X size={16} />
                </button>
              ) : busy ? null : (
                <button
                  onClick={() => scanDevices(type)}
                  disabled={!supported}
                  className="rounded-full bg-text px-4 py-1.5 text-xs font-semibold text-bg transition-transform active:scale-95 disabled:opacity-40"
                >
                  {t('连接')}
                </button>
              )}
            </div>

            {d.connected && type === 'heartRate' ? (
              <div className="mt-3 flex items-center justify-center gap-3 rounded-md bg-primary/5 py-3">
                <Heart size={28} className="text-primary animate-pulse" fill="currentColor" />
                <div className="text-center">
                  <p className="font-mono text-3xl font-bold text-primary tabular-nums">
                    {d.metrics.heartRate ?? '—'}
                  </p>
                  <p className="text-[13px] text-text-sub">{t('实时心率 bpm')}</p>
                </div>
              </div>
            ) : d.connected ? (
              <MetricRow m={d.metrics} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
