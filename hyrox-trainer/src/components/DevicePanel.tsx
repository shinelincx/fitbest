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
  bike: { label: '智能风扇车', icon: Gauge, units: 'rpm' },
  sled: { label: '智能雪橇', icon: Activity, units: 'm/s' },
  rep: { label: '智能计数传感器', icon: Activity, units: '次' },
  heartRate: { label: '智能心率带', icon: Heart, units: 'bpm' },
}

const STATUS_TEXT: Record<ConnectStatus, string> = {
  idle: '未连接',
  connecting: '正在连接…',
  connected: '已连接',
  failed: '连接失败',
}

function MetricRow({ m }: { m: DeviceMetrics }) {
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
            <p className="mt-0.5 font-mono text-[11px] font-semibold text-text">{it.value}</p>
            <p className="text-[9px] text-text-sub">{it.label}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function DevicePanel({ types }: { types: DeviceType[] }) {
  const { devices, connectDevice, disconnectDevice, supported } = useDevices()

  return (
    <div className="space-y-3">
      {!supported && <p className="text-xs text-warning">当前浏览器不支持蓝牙连接</p>}
      {types.map((type) => {
        const meta = TYPE_META[type]
        const Icon = meta.icon
        const d = devices[type]
        const connecting = d.status === 'connecting'
        const busy = connecting
        return (
          <div
            key={type}
            className={`rounded-radius-md border p-4 transition-colors ${
              d.connected ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-radius-md ${
                    d.connected ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-text-sub'
                  }`}
                >
                  {busy ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <p
                    className={`flex items-center gap-1 text-xs ${
                      d.connected ? 'text-primary' : busy ? 'text-warning' : 'text-text-sub'
                    }`}
                  >
                    {d.connected ? (
                      <>
                        <BluetoothConnected size={12} /> {d.name}
                      </>
                    ) : connecting ? (
                      <>
                        <Radio size={12} className="animate-spin" /> 连接中…
                      </>
                    ) : (
                      <>
                        <Bluetooth size={12} /> {STATUS_TEXT[d.status]}
                      </>
                    )}
                  </p>
                </div>
              </div>
              {d.connected ? (
                <button
                  onClick={() => disconnectDevice(type)}
                  className="rounded-full bg-surface-2 p-2 text-text-sub transition-colors active:bg-surface"
                  aria-label="断开连接"
                >
                  <X size={16} />
                </button>
              ) : !busy && supported && (
                <button
                  onClick={() => connectDevice(type)}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-bg transition-transform active:scale-95"
                >
                  连接
                </button>
              )}
            </div>

            {d.connected && type === 'heartRate' ? (
              <div className="mt-3 flex items-center justify-center gap-3 rounded-radius-md bg-danger/5 py-3">
                <Heart size={28} className="text-danger animate-pulse" fill="currentColor" />
                <div className="text-center">
                  <p className="font-mono text-3xl font-bold text-danger tabular-nums">
                    {d.metrics.heartRate ?? '—'}
                  </p>
                  <p className="text-[10px] text-text-sub">实时心率 bpm</p>
                </div>
              </div>
            ) : d.connected ? (
              <MetricRow m={d.metrics} />
            ) : null}

            {d.error && <p role="alert" className="mt-2 text-xs text-danger">{d.error}</p>}
          </div>
        )
      })}
    </div>
  )
}
