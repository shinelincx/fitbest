// 成绩卡分享弹层（P0：图片保存 + 复制文案）
import { useEffect, useRef, useState } from 'react'
import { Copy, Download, Share2, X } from 'lucide-react'
import type { SessionRecord } from '../types'
import { useToast } from './Toast'
import {
  BRAND,
  buildShareCard,
  buildShareText,
  copyText,
  downloadBlob,
  renderShareCard,
  shareFileName,
} from '../utils/shareCard'

type Props = {
  open: boolean
  onClose: () => void
  session: SessionRecord | null
  plan: string
  nickname?: string
  avatar?: string
}

export default function ShareSheet({ open, onClose, session, plan, nickname, avatar }: Props) {
  const toast = useToast()
  const [showName, setShowName] = useState(!!nickname)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    if (!open || !session) return
    let active = true
    blobRef.current = null
    const data = buildShareCard(session, {
      plan,
      nickname: showName ? nickname : undefined,
      avatar: showName ? avatar : undefined,
    })
    renderShareCard(data)
      .then((blob) => {
        if (!active) return
        blobRef.current = blob
        setPreview(URL.createObjectURL(blob))
      })
      .catch(() => {
        if (active) toast('成绩卡生成失败')
      })
    return () => {
      active = false
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
    }
  }, [open, session, plan, nickname, avatar, showName, toast])

  if (!open || !session) return null

  function currentData() {
    return buildShareCard(session!, {
      plan,
      nickname: showName ? nickname : undefined,
      avatar: showName ? avatar : undefined,
    })
  }

  async function getBlob(): Promise<Blob> {
    if (blobRef.current) return blobRef.current
    const blob = await renderShareCard(currentData())
    blobRef.current = blob
    return blob
  }

  async function shareImage() {
    setBusy(true)
    try {
      const data = currentData()
      const blob = await getBlob()
      const file = new File([blob], shareFileName(data), { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (payload: { files: File[] }) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `我的 ${BRAND.name} 训练成绩`,
            text: buildShareText(data),
          })
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return
          throw err
        }
      } else {
        downloadBlob(blob, shareFileName(data))
        toast('已保存图片，请到相册/下载中分享')
      }
    } catch {
      toast('分享失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function saveImage() {
    setBusy(true)
    try {
      downloadBlob(await getBlob(), shareFileName(currentData()))
      toast('成绩卡已保存')
    } catch {
      toast('保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  async function copySummary() {
    const ok = await copyText(buildShareText(currentData()))
    toast(ok ? '分享文案已复制' : '复制失败，请手动分享')
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-display text-[20px] font-bold">分享成绩</p>
            <p className="mt-0.5 text-[14px] text-text-sub">生成成绩卡，发给搭子或朋友圈</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-sub"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex justify-center rounded-radius-md bg-surface-2 py-4">
          {preview ? (
            <img
              src={preview}
              alt={`${BRAND.name} 成绩卡预览`}
              className="h-[320px] w-auto rounded-radius-sm border border-border shadow-card"
            />
          ) : (
            <div className="flex h-[320px] w-[228px] items-center justify-center text-[14px] text-text-sub">
              正在生成…
            </div>
          )}
        </div>

        {nickname && (
          <div className="mt-3 flex items-center justify-between rounded-radius-md border border-border px-4 py-3">
            <div>
              <p className="text-[15px] font-medium">显示昵称</p>
              <p className="mt-0.5 text-[13px] text-text-sub">不显示手机号等个人信息</p>
            </div>
            <button
              onClick={() => setShowName((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                showName ? 'bg-primary' : 'bg-border'
              }`}
              aria-pressed={showName}
              aria-label="显示昵称"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${
                  showName ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        )}

        <button
          onClick={shareImage}
          disabled={busy || !preview}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-radius-md bg-primary py-3.5 text-[17px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Share2 size={18} /> 分享图片
        </button>
        <div className="mt-2 flex gap-2">
          <button
            onClick={saveImage}
            disabled={busy || !preview}
            className="flex flex-1 items-center justify-center gap-2 rounded-radius-md border border-border bg-surface py-3 text-[16px] font-medium disabled:opacity-60"
          >
            <Download size={16} /> 保存图片
          </button>
          <button
            onClick={copySummary}
            className="flex flex-1 items-center justify-center gap-2 rounded-radius-md border border-border bg-surface py-3 text-[16px] font-medium"
          >
            <Copy size={16} /> 复制文案
          </button>
        </div>
        <p className="mt-2 text-center text-[13px] text-text-sub">图片仅包含本次训练数据，可关闭昵称显示</p>
      </div>
    </div>
  )
}
