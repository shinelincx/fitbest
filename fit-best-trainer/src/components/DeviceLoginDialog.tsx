import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, request } from '../api/client'
import { useNativeBack } from '../platform/NativeRuntime'
import { isNative } from '../platform/runtime'

interface Preview {
  deviceName: string | null
  verificationCode: string
}

export function parseDeviceLoginQr(raw: string): { scanId: string | null } | null {
  if (!raw.trimStart().startsWith('{')) return null
  try {
    const payload = JSON.parse(raw)
    if (payload?.type !== 'fitbest.device-login') return null
    const { version, scanId } = payload
    return { scanId: version === 1 && typeof scanId === 'string' && /^[a-f0-9]{32}$/.test(scanId) ? scanId : null }
  } catch {
    return null
  }
}

export default function DeviceLoginDialog({ scanId, userId, onClose, onSignIn, onConfirmed }: {
  scanId: string
  userId: string | null
  onClose: () => void
  onSignIn: () => void
  onConfirmed: () => void
}) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const active = useRef<AbortController | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(Boolean(userId))
  const [error, setError] = useState<number | null>(null)

  useNativeBack(true, onClose)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  const submit = useCallback(async (operation: 'inspect' | 'confirm') => {
    if (!userId || active.current) return
    const controller = new AbortController()
    active.current = controller
    setBusy(true)
    setError(null)
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    try {
      const result = await request<Preview>(`/auth/device-login/${operation}`, {
        method: 'POST', body: { scanId }, userId, signal: controller.signal,
      })
      if (active.current !== controller) return
      if (operation === 'inspect') setPreview(result)
      else onConfirmed()
    } catch (cause) {
      if (active.current === controller) setError(cause instanceof ApiError ? cause.code : 0)
    } finally {
      window.clearTimeout(timeout)
      if (active.current === controller) {
        active.current = null
        setBusy(false)
      }
    }
  }, [onConfirmed, scanId, userId])

  useEffect(() => {
    void submit('inspect')
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [submit])

  const signInRequired = !userId || error === 401
  const unavailable = error === 404 || error === 409 || error === 410

  return (
    <dialog
      ref={dialog}
      aria-labelledby="device-login-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      className="fixed inset-x-0 bottom-0 mx-auto mb-0 mt-auto w-full max-w-md rounded-t-2xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text backdrop:bg-black/60"
    >
      <h2 id="device-login-title" className="font-display text-lg font-bold">{t('设备扫码登录')}</h2>
      {signInRequired ? (
        <p className="mt-3 text-sm text-text-sub">
          {t(isNative ? '请在 Fitbest 手机网页版登录并重新扫码。' : '请先登录 Fitbest，再重新扫码。')}
        </p>
      ) : preview && !unavailable ? (
        <div className="mt-3 rounded-xl bg-surface p-4">
          <p className="break-words text-sm font-semibold">{preview.deviceName || t('设备端应用')}</p>
          <p className="mt-1 text-sm text-text-sub">{t('确认核验码与设备屏幕一致。')}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-widest">{preview.verificationCode}</p>
        </div>
      ) : null}
      {busy && <p role="status" className="mt-3 text-sm text-text-sub">{t('正在处理…')}</p>}
      {!signInRequired && error !== null && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t(unavailable ? '二维码已失效或已使用，请在设备上重新出码。' : '暂时无法完成设备登录，请重试。')}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-md border border-border px-3 text-sm font-semibold">
          {t(unavailable ? '关闭' : '取消')}
        </button>
        {signInRequired ? (
          <button type="button" onClick={onSignIn} className="min-h-11 flex-1 rounded-md bg-text px-3 text-sm font-semibold text-bg">
            {t(isNative ? '打开网页版' : '登录')}
          </button>
        ) : !unavailable && (
          <button type="button" onClick={() => void submit(preview ? 'confirm' : 'inspect')} disabled={busy}
            className="min-h-11 flex-1 rounded-md bg-text px-3 text-sm font-semibold text-bg disabled:opacity-50">
            {t(preview ? '确认登录设备' : '重试')}
          </button>
        )}
      </div>
    </dialog>
  )
}
