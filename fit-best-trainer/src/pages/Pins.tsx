import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bluetooth, Link2, Unlink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchPinBindings, removePinBinding } from '../api'
import type { PinBinding } from '../types'
import { PIN_MACHINE_MAP } from '../mock/pinMachines'
import { useToast } from '../components/Toast'
import { currentUserId } from '../utils/auth'

function timeAgo(ts: number, t: ReturnType<typeof useTranslation>['t']): string {
  const diff = Date.now() - ts
  const d = Math.floor(diff / 86400000)
  if (d > 0) return t('{{count}} 天前', { count: d })
  const h = Math.floor(diff / 3600000)
  if (h > 0) return t('{{count}} 小时前', { count: h })
  const m = Math.floor(diff / 60000)
  return m > 0 ? t('{{count}} 分钟前', { count: m }) : t('刚刚')
}

export default function Pins() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [bindings, setBindings] = useState<PinBinding[]>([])
  const ownerId = useRef(currentUserId())

  useEffect(() => {
    fetchPinBindings(ownerId.current).then(setBindings)
  }, [])

  async function unbind(pinId: string) {
    try {
      await removePinBinding(pinId, ownerId.current)
      setBindings((prev) => prev.filter((b) => b.pinId !== pinId))
      toast(t('已解绑'))
    } catch {
      toast(t('解绑失败，请重试'))
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/92 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('返回')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <p className="text-[15px] font-semibold leading-tight">{t('插销绑定管理')}</p>
          <p className="mt-0.5 text-[12px] text-text-sub">
            {t('已绑定 {{count}} 个智能插销', { count: bindings.length })}
          </p>
        </div>
      </header>

      <div className="flex-1 px-5 py-4 hd:lg:px-8 hd:lg:py-6">
        {bindings.length === 0 ? (
          <div className="mt-20 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-text-sub">
              <Bluetooth size={28} />
            </div>
            <p className="mt-3 text-[14px] text-text-sub">{t('还没有绑定任何插销')}</p>
            <button
              onClick={() => navigate('/pin')}
              className="mt-4 rounded-md bg-text px-4 py-2 text-[14px] font-medium text-bg"
            >
              {t('连接并绑定插销')}
            </button>
          </div>
        ) : (
          <div className="space-y-2 hd:lg:grid hd:lg:grid-cols-2 hd:lg:items-start hd:lg:gap-3 hd:lg:space-y-0">
            {bindings.map((b) => {
              const m = PIN_MACHINE_MAP[b.machineId]
              return (
                <div
                  key={b.pinId}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-connected/10 text-connected">
                      <Link2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{b.pinName}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-text-sub">
                        <span className="font-mono">{b.pinId}</span>
                        <span>{t('· 绑定于 {{time}}', { time: timeAgo(b.boundAt, t) })}</span>
                      </p>
                      {m ? (
                        <button
                          onClick={() => navigate(`/pin/${m.id}`)}
                          className="mt-2 inline-flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-1 text-[12px]"
                        >
                          <span className="font-medium">{t(m.name)}</span>
                          <span className="text-text-sub">
                            {m.plateKg} kg × {m.plates} {t('片')}
                          </span>
                        </button>
                      ) : (
                        <p className="mt-2 text-[12px] text-warning">{t('器械已下架')}</p>
                      )}
                    </div>
                    <button
                      onClick={() => unbind(b.pinId)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-sub active:bg-surface-2"
                      aria-label={t('解绑')}
                    >
                      <Unlink size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-text-sub">
          {t('一个插销同一时间绑定一台器械')}
          <br />
          {t('更换器械时，连接后可重新绑定')}
        </p>
      </div>
    </div>
  )
}
