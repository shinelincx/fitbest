import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bluetooth, Cog, Loader2, MonitorSmartphone, RefreshCw, RotateCcw, RotateCw, Save, Zap } from 'lucide-react'
import { useDevices, type DeviceType } from '../context/DeviceContext'
import { useToast } from './Toast'
import type { TfDeviceInfo } from '../ble/thinkfit'

const FIELD_LABELS: { key: keyof TfDeviceInfo; label: string; format?: (v: number) => string }[] = [
  { key: 'brandId', label: '品牌 ID' },
  { key: 'typeId', label: '类型 ID' },
  { key: 'model', label: '机型号' },
  { key: 'radius', label: '半径', format: (v) => `${v} cm` },
  { key: 'wheelRatio', label: '轮径比', format: (v) => `${(v / 10).toFixed(1)}×` },
  { key: 'hallCount', label: '霍尔数' },
  { key: 'maxFriction', label: '最大摩擦力', format: (v) => `${v} g` },
  { key: 'unitType', label: '单位' , format: (v) => (v === 1 ? '英制' : '公制') },
  { key: 'vrMax', label: 'VR 最大值' },
  { key: 'vrMin', label: 'VR 最小值' },
  { key: 'vrDirection', label: 'VR 方向', format: (v) => (v === 1 ? '阻力最大时阻值最大' : '阻力最大时阻值最小') },
]

export default function ConsolePanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const {
    consoles,
    devices,
    consoleRead,
    consoleRename,
    consoleLcdTest,
    consoleDisableSleep,
    consoleNudgeMotor,
    consoleReadCache,
  } = useDevices()
  const [name, setName] = useState('')

  const types = Object.keys(consoles) as DeviceType[]
  const type = types.find((k) => consoles[k]?.ready) ?? types[0]

  if (!type) {
    return (
      <section className="mt-6 rounded-md border border-border bg-surface p-4">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <MonitorSmartphone size={15} className="text-primary" /> {t('ThinkFit 车表')}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-sub">
          {t('连接 TF- 开头的车表后，可在这里读取设备配置、做屏幕检测、调整马达位置。')}
        </p>
      </section>
    )
  }

  const state = consoles[type]!
  const deviceName = devices[type]?.name ?? ''
  const busy = state.busy

  const doRename = async () => {
    const next = name.trim()
    if (!next) return
    const ok = await consoleRename(type, next)
    toast(ok ? t('蓝牙名称已写入') : t('蓝牙名称写入失败'))
    if (ok) setName('')
  }

  return (
    <section className="mt-6 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
            <MonitorSmartphone size={15} className="text-primary" /> {t('ThinkFit 车表')}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-text-sub">
            {t(deviceName)} · {state.bleName || t('读取中…')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => consoleRead(type)}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[13px] text-text-sub disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {t('刷新')}
        </button>
      </div>

      {state.info ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FIELD_LABELS.map((f) => {
            const raw = state.info?.[f.key]
            return (
              <div key={f.key} className="rounded bg-surface-2 px-3 py-2">
                <p className="text-[11px] text-text-sub">{t(f.label)}</p>
                <p className="mt-0.5 truncate font-mono text-[13px] font-semibold">
                  {raw == null ? '—' : f.format ? t(f.format(raw)) : raw}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-text-sub">
          {busy ? t('正在读取车表配置…') : t('尚未读取到配置，点击刷新重试。')}
        </p>
      )}

      {/* 蓝牙名称 */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-border bg-bg px-3">
          <Bluetooth size={14} className="shrink-0 text-primary" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={state.bleName || t('蓝牙名称（最多 15 字节）')}
            maxLength={15}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-sub"
          />
        </div>
        <button
          type="button"
          onClick={doRename}
          disabled={busy || !name.trim()}
          className="flex shrink-0 items-center gap-1 rounded-md bg-text px-3 py-2 text-[13px] font-semibold text-bg disabled:opacity-50"
        >
          <Save size={13} /> {t('写入')}
        </button>
      </div>

      {/* 车表指令 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => consoleLcdTest(type, 'all')}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <MonitorSmartphone size={14} /> {t('屏幕全显')}
        </button>
        <button
          type="button"
          onClick={() => consoleLcdTest(type, 'leak')}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <Zap size={14} /> {t('漏光检测')}
        </button>
        <button
          type="button"
          onClick={() => consoleDisableSleep(type)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <Cog size={14} /> {t('禁用息屏')}
        </button>
        <button
          type="button"
          onClick={() => consoleReadCache(type)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <RefreshCw size={14} /> {t('读取历史缓存')}
        </button>
        <button
          type="button"
          onClick={() => consoleNudgeMotor(type, 'left')}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <RotateCcw size={14} /> {t('马达左旋')}
        </button>
        <button
          type="button"
          onClick={() => consoleNudgeMotor(type, 'right')}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[13px] disabled:opacity-50"
        >
          <RotateCw size={14} /> {t('马达右旋')}
        </button>
      </div>

      {state.cache && state.cache.length > 0 && (
        <p className="mt-3 break-all rounded bg-surface-2 px-3 py-2 font-mono text-[12px] text-text-sub">
          {t('历史缓存')}: {state.cache.join(', ')}
        </p>
      )}

      {state.error && <p className="mt-3 text-[13px] text-danger">{state.error}</p>}
    </section>
  )
}
