import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { maskEmail, maskPhone, sendSecurityCode, type Account, type Verification } from '../utils/auth'

export default function ContactVerification({ user, value, onChange, disabled = false }: {
  user: Account
  value?: Verification
  onChange: (value: Verification | undefined) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [sending, setSending] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [left, setLeft] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const channel = value?.channel ?? (user.phone ? 'phone' : 'email')
  const contact = channel === 'phone' ? maskPhone(user.phone) : maskEmail(user.email)

  useEffect(() => {
    if (!retryAt) return
    const tick = () => setLeft(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)))
    const timer = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(timer)
  }, [retryAt])

  async function send() {
    setSending(true)
    setError('')
    try {
      const result = await sendSecurityCode(user.id, channel)
      const cooldown = result.cooldown ?? 60
      setLeft(cooldown)
      setRetryAt(Date.now() + cooldown * 1000)
      setStatus(result.devCode
        ? t('验证码已发送：{{code}}', { code: result.devCode })
        : t('已向 {{contact}} 发送身份验证码', { contact }))
    } catch (err) {
      setError(t(err instanceof Error ? err.message : '发送失败，请重试'))
    } finally {
      setSending(false)
    }
  }

  if (!contact) return <p className="mt-3 text-sm text-text-sub">{t('该账号没有可验证的联系方式')}</p>

  return (
    <fieldset disabled={disabled} className="mt-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{t('验证已有登录方式')}</legend>
      <label className="block text-[13px] text-text-sub">
        {t('接收身份验证码')}
        <select
          value={channel}
          disabled={sending}
          onChange={(event) => {
            onChange({ channel: event.target.value as Verification['channel'], code: '' })
            setStatus('')
            setError('')
          }}
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
        >
          {user.phone && <option value="phone">{t('手机号')} · {maskPhone(user.phone)}</option>}
          {user.email && <option value="email">{t('邮箱')} · {maskEmail(user.email)}</option>}
        </select>
      </label>
      <div className="mt-3 flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[13px] text-text-sub">
          {t('身份验证码')}
          <input
            value={value?.code ?? ''}
            onChange={(event) => onChange({ channel, code: event.target.value.replace(/\D/g, '').slice(0, 6) })}
            autoComplete="one-time-code"
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          />
        </label>
        <button type="button" onClick={send} disabled={sending || left > 0}
          className="shrink-0 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60">
          {sending ? t('正在发送…') : left > 0 ? `${left}s` : t('发送身份验证码')}
        </button>
      </div>
      {status && <p role="status" className="mt-2 text-[13px] text-text-sub">{status}</p>}
      {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
    </fieldset>
  )
}
