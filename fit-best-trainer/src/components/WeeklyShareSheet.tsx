import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { Download, Link2, Share2, X } from 'lucide-react'
import type { MachineSession } from '../types'
import { useToast } from './Toast'
import { shareNativeImage } from '../platform/files'
import { useNativeBack } from '../platform/NativeRuntime'
import { isNative } from '../platform/runtime'
import {
  buildShareUrl,
  buildWeeklyData,
  copyText,
  downloadBlob,
  renderWeeklyImage,
} from '../utils/share'

type Props = {
  open: boolean
  onClose: () => void
  sessions: MachineSession[]
  nickname?: string
  avatar?: string
}

export default function WeeklyShareSheet({ open, onClose, sessions, nickname, avatar }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [showName, setShowName] = useState(!!nickname)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  useNativeBack(open, onClose)

  function currentData() {
    return buildWeeklyData(sessions, {
      nickname: showName ? nickname : undefined,
      avatar: showName ? avatar : undefined,
    })
  }

  useEffect(() => {
    if (!open) return
    let active = true
    blobRef.current = null
    renderWeeklyImage(currentData())
      .then((blob) => {
        if (!active) return
        blobRef.current = blob
        setPreview(URL.createObjectURL(blob))
      })
      .catch(() => {
        if (active) toast(t('周报生成失败'))
      })
    return () => {
      active = false
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
    }
  }, [open, sessions, nickname, avatar, showName, toast, t])

  if (!open) return null

  async function getBlob(): Promise<Blob> {
    if (blobRef.current) return blobRef.current
    const blob = await renderWeeklyImage(currentData())
    blobRef.current = blob
    return blob
  }

  async function shareImage() {
    setBusy(true)
    try {
      const data = currentData()
      const blob = await getBlob()
      const file = new File([blob], 'fitbest-weekly.png', { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (payload: { files: File[] }) => boolean }
      if (isNative) {
        await shareNativeImage(
          blob,
          'fitbest-weekly.png',
          t('我的 FITBEST 本周战报'),
          `${t('本周 {{count}} 次训练 · {{range}}', { count: data.count, range: data.range })}\n${buildShareUrl(data)}`,
        )
        return
      }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: t('我的 FITBEST 本周战报'),
            text: t('本周 {{count}} 次训练 · {{range}}', { count: data.count, range: data.range }),
          })
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return
          throw err
        }
      } else {
        downloadBlob(blob, 'fitbest-weekly.png')
        if (await copyText(buildShareUrl(data))) {
          toast(t('已保存图片，链接已复制'))
        } else {
          toast(t('已保存图片，可手动分享'))
        }
      }
    } catch {
      toast(t('分享失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  async function saveImage() {
    setBusy(true)
    try {
      const blob = await getBlob()
      if (isNative) {
        const shared = await shareNativeImage(
          blob,
          'fitbest-weekly.png',
          t('保存 FITBEST 本周战报'),
          t('可选择保存图片或分享给好友'),
        )
        if (shared) toast(t('已打开系统保存与分享面板'))
        return
      }
      downloadBlob(blob, 'fitbest-weekly.png')
      toast(t('周报已保存到相册/下载'))
    } catch {
      toast(t('保存失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      const ok = await copyText(buildShareUrl(currentData()))
      toast(ok ? t('分享链接已复制') : t('复制失败，请手动分享'))
    } catch {
      toast(t('复制失败，请检查公开分享地址配置'))
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="sheet-up max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-display text-[20px] font-bold">{t('本周战报')}</p>
            <p className="mt-0.5 text-[14px] text-text-sub">{t('把这一周的训练发给搭子或朋友圈')}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-sub"
            aria-label={t('关闭')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex justify-center rounded-lg bg-surface-2 py-4">
          {preview ? (
            <img
              src={preview}
              alt={t('FITBEST 周报预览')}
              className="h-[300px] w-auto rounded-md border border-border bg-surface shadow-card"
            />
          ) : (
            <div className="flex h-[300px] w-[240px] items-center justify-center text-[14px] text-text-sub">
              {t('正在生成…')}
            </div>
          )}
        </div>

        {nickname && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-[15px] font-medium">{t('显示昵称')}</p>
              <p className="mt-0.5 text-[13px] text-text-sub">{t('不显示手机号等个人信息')}</p>
            </div>
            <button
              onClick={() => setShowName((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${showName ? 'bg-text' : 'bg-border'}`}
              aria-pressed={showName}
              aria-label={t('显示昵称')}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${showName ? 'left-[22px]' : 'left-0.5'}`}
              />
            </button>
          </div>
        )}

        <button
          onClick={shareImage}
          disabled={busy || !preview}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-text py-3.5 text-[17px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Share2 size={18} /> {t('分享图片')}
        </button>
        <div className="mt-2 flex gap-2">
          <button
            onClick={saveImage}
            disabled={busy || !preview}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface py-3 text-[16px] font-medium disabled:opacity-60"
          >
            <Download size={16} /> {t('保存图片')}
          </button>
          <button
            onClick={copyLink}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface py-3 text-[16px] font-medium"
          >
            <Link2 size={16} /> {t('复制链接')}
          </button>
        </div>
        <p className="mt-2 text-center text-[13px] text-text-sub">{t('按本周（周一至周日）的训练记录生成')}</p>
      </div>
    </div>
  )
}
