import { useEffect, useState } from 'react'
import {
  Watch,
  Bluetooth,
  BluetoothConnected,
  Loader2,
  Check,
  X,
  Search,
  RefreshCw,
  Battery,
  Radio,
  Nfc,
  Unplug,
} from 'lucide-react'
import { useBand } from '../context/BandContext'
import { useToast } from './Toast'

function timeText(iso: string | null): string {
  if (!iso) return '尚未同步'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

/** 手环状态条 + 底部弹层：搜索 → 发现 → 连接 → 绑定 → 同步 */
export default function BandPanel() {
  const band = useBand()
  const toast = useToast()
  const [open, setOpen] = useState(false)

  const connected = band.connected
  const pendingCount = band.pending.length + band.uploadPendingCount
  const bound = connected ? band.isBound(connected.serialNo) : false

  // 打开面板时自动回连已绑定手环（与华为运动健康的自动回连一致）
  useEffect(() => {
    if (!open) return
    if (band.bindings.length && !band.connected && band.stage !== 'connecting') {
      void band.connect(band.bindings[0].serialNo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const statusText = connected
    ? bound
      ? `${connected.name} · 已连接`
      : `${connected.name} · 待绑定`
    : band.bindings.length
      ? '手环未连接'
      : '智能手环未绑定'

  const syncLabel = !connected
    ? '连接'
    : !bound
      ? '绑定'
      : pendingCount > 0
        ? `同步 ${pendingCount} 场`
        : '管理'

  async function handleSync() {
    if (await band.syncNow()) toast('手环数据已同步')
  }

  return (
    <>
      {/* 状态条 */}
      <div
        className={`reveal reveal-2 mb-3 flex items-center justify-between rounded-radius-md border px-3 py-2 ${
          connected
            ? 'border-primary/40 bg-primary/5'
            : 'border-border bg-surface'
        }`}
      >
        <div className="flex items-center gap-2">
          <Watch size={16} className={connected ? 'text-primary' : 'text-text-sub'} />
          <span
            className={`text-xs font-medium ${connected ? 'text-primary' : 'text-text-sub'}`}
          >
            {statusText}
          </span>
          {connected && (
            <span className="flex items-center gap-0.5 text-[10px] text-text-sub">
              <Battery size={11} /> {connected.battery}%
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-warning">
              {pendingCount} 待同步
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-semibold text-primary active:scale-95"
        >
          {syncLabel}
        </button>
      </div>

      {/* 底部弹层 */}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end" role="dialog" aria-modal="true">
          <button
            aria-label="关闭"
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full rounded-t-radius-lg border-t border-border bg-surface p-4 pb-6 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Watch size={16} className="text-primary" /> 智能手环
              </p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full bg-surface-2 p-1.5 text-text-sub"
                aria-label="关闭手环面板"
              >
                <X size={16} />
              </button>
            </div>

            {band.error && (
              <p className="mb-2 rounded-radius-sm bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {band.error}
              </p>
            )}

            {/* 搜索 */}
            {band.stage === 'scanning' && (
              <div className="flex flex-col items-center py-8">
                <div className="relative">
                  <Radio size={40} className="animate-pulse text-primary" />
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs text-text-sub">
                  <Loader2 size={12} className="animate-spin" /> 正在搜索附近的手环…
                </p>
                <p className="mt-1 text-[10px] text-text-sub">请保持手环靠近手机</p>
              </div>
            )}

            {/* 发现设备 */}
            {band.stage === 'found' && (
              <div className="space-y-2">
                <p className="text-[11px] text-text-sub">发现 {band.devices.length} 台手环</p>
                {band.devices.map((dev) => (
                  <button
                    key={dev.serialNo}
                    onClick={() => void band.connect(dev.serialNo)}
                    className="flex w-full items-center justify-between rounded-radius-md border border-border bg-surface-2 px-3 py-2.5 text-left active:bg-surface"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Watch size={18} />
                      </span>
                      <span>
                        <span className="block text-xs font-medium">{dev.name}</span>
                        <span className="block text-[10px] text-text-sub">
                          {dev.serialNo} · 电量 {dev.battery}% · 信号 {dev.rssi}dBm
                        </span>
                      </span>
                    </span>
                    <span className="text-[11px] text-primary">
                      {band.isBound(dev.serialNo) ? '已绑定' : '连接'}
                    </span>
                  </button>
                ))}
                <button
                  onClick={band.scan}
                  className="flex w-full items-center justify-center gap-1 pt-1 text-[11px] text-text-sub underline"
                >
                  <RefreshCw size={12} /> 重新搜索
                </button>
              </div>
            )}

            {/* 连接中 */}
            {band.stage === 'connecting' && (
              <div className="py-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Bluetooth size={30} className="animate-pulse text-primary" />
                </div>
                <p className="mt-3 text-center text-xs text-text">正在连接手环…</p>
                <div className="mx-auto mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${band.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* 已连接 */}
            {band.stage === 'connected' && connected && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-radius-md border border-primary/30 bg-primary/5 p-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Watch size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-sm font-semibold">
                      {connected.name}
                      {bound ? (
                        <Check size={14} className="text-success" />
                      ) : (
                        <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[9px] font-medium text-warning">
                          未绑定
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-text-sub">
                      {connected.serialNo} · {connected.model}
                    </p>
                  </div>
                  <span className="flex items-center gap-0.5 text-[10px] text-text-sub">
                    <Battery size={12} /> {connected.battery}%
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  {[
                    { label: '连接状态', value: 'BLE 已连接' },
                    { label: '固件版本', value: connected.firmware },
                    { label: '信号强度', value: `${connected.rssi}dBm` },
                  ].map((it) => (
                    <div key={it.label} className="rounded-radius-sm bg-surface-2 py-1.5">
                      <p className="font-mono text-[11px] font-semibold">{it.value}</p>
                      <p className="text-[9px] text-text-sub">{it.label}</p>
                    </div>
                  ))}
                </div>

                {/* 未绑定：绑定入口 */}
                {!bound && (
                  <div className="space-y-2 rounded-radius-md border border-border bg-surface-2 p-3">
                    <p className="text-[11px] text-text-sub">
                      绑定后，这只手环会自动记录训练并同步到账号
                    </p>
                    <button
                      onClick={() => {
                        band.bind(connected.serialNo)
                        toast('手环已绑定')
                      }}
                      className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-bg active:scale-95"
                    >
                      绑定此手环
                    </button>
                    <button
                      onClick={() => void band.bindByNfc()}
                      disabled={band.nfcReading}
                      className="flex w-full items-center justify-center gap-1 rounded-full border border-border py-2 text-[11px] text-text active:bg-surface"
                    >
                      {band.nfcReading ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> 请将手环靠近手机 NFC 区域…
                        </>
                      ) : (
                        <>
                          <Nfc size={12} /> NFC 碰一碰绑定
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 已绑定：同步数据 */}
                {bound && (
                  <div className="space-y-2 rounded-radius-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-text">
                        待同步 <span className="font-semibold text-primary">{pendingCount}</span> 场训练
                      </p>
                      <p className="text-[10px] text-text-sub">
                        最近同步 {timeText(band.lastSyncAt)}
                      </p>
                    </div>
                    {band.syncing ? (
                      <div>
                        <p className="mb-1 text-center text-[10px] text-text-sub">
                          正在同步训练数据 {band.progress}%
                        </p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${band.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => void handleSync()}
                        disabled={pendingCount === 0}
                        className="w-full rounded-full bg-primary py-2 text-xs font-semibold text-bg active:scale-95 disabled:opacity-40"
                      >
                        {pendingCount > 0 ? `同步 ${pendingCount} 场训练数据` : '数据已是最新'}
                      </button>
                    )}
                    <p className="text-center text-[9px] text-text-sub">
                      数据先存手环，连接手机后同步；离线时自动排队补传
                    </p>
                    {pendingCount === 0 && !band.syncing && (
                      <button
                        onClick={band.stageDemoSession}
                        className="w-full rounded-full border border-border py-1.5 text-[10px] text-text-sub active:bg-surface"
                      >
                        演示：生成一场手环待同步训练
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      band.disconnect()
                      band.scan()
                    }}
                    className="text-[11px] text-text-sub underline"
                  >
                    搜索新手环
                  </button>
                  {bound ? (
                    <button
                      onClick={() => {
                        band.unbind(connected.serialNo)
                        toast('已解除绑定')
                      }}
                      className="flex items-center gap-1 text-[11px] text-text-sub underline"
                    >
                      <Unplug size={11} /> 解除绑定
                    </button>
                  ) : (
                    <button
                      onClick={band.disconnect}
                      className="flex items-center gap-1 text-[11px] text-text-sub underline"
                    >
                      <BluetoothConnected size={11} /> 断开连接
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 未连接但有绑定记录：可直接连接 */}
            {band.stage !== 'scanning' &&
              band.stage !== 'connecting' &&
              band.stage !== 'connected' &&
              band.bindings.length > 0 && (
                <div className="space-y-2">
                  {band.bindings.map((b) => (
                    <button
                      key={b.serialNo}
                      onClick={() => void band.connect(b.serialNo)}
                      className="flex w-full items-center justify-between rounded-radius-md border border-border bg-surface-2 px-3 py-2.5 text-left active:bg-surface"
                    >
                      <span className="flex items-center gap-2">
                        <Watch size={16} className="text-primary" />
                        <span>
                          <span className="block text-xs font-medium">{b.name}</span>
                          <span className="block text-[10px] text-text-sub">{b.serialNo}</span>
                        </span>
                      </span>
                      <span className="text-[11px] text-primary">连接</span>
                    </button>
                  ))}
                  <button
                    onClick={band.scan}
                    className="flex w-full items-center justify-center gap-1 text-[11px] text-text-sub underline"
                  >
                    <Search size={12} /> 搜索新手环
                  </button>
                </div>
              )}

            {/* 首次进入 */}
            {band.stage === 'idle' && band.bindings.length === 0 && (
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-text-sub">
                  搜索附近的手环，连接并绑定后，训练记录会保存在手环里，回到手机旁一键同步。
                </p>
                <button
                  onClick={band.scan}
                  className="flex w-full items-center justify-center gap-1 rounded-full bg-primary py-2.5 text-xs font-semibold text-bg active:scale-95"
                >
                  <Search size={13} /> 搜索附近的手环
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-[9px] text-text-sub">
              演示模式：搜索、连接、绑定、同步均为本机模拟，后续接入真实 BLE 协议
            </p>
          </div>
        </div>
      )}
    </>
  )
}
