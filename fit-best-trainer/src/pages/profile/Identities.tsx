import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { Mail, MessageCircle, Smartphone } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import ContactVerification from '../../components/ContactVerification'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import {
  EMAIL_RE,
  PHONE_RE,
  isCloudAccount,
  maskEmail,
  maskPhone,
  sendEmailCode,
  sendSmsCode,
  type IdentityKind,
  type Verification,
} from '../../utils/auth'

const inputCls =
  'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text'

function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

export default function Identities() {
  const { t } = useTranslation()
  const { user, bindEmail, bindPhone, bindWechat, unbindEmail, unbindWechat } = useAuth()
  const toast = useToast()

  const [binding, setBinding] = useState<'email' | 'phone' | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [left, setLeft] = useCountdown()
  const [confirm, setConfirm] = useState<IdentityKind | null>(null)
  const [error, setError] = useState('')
  const [verification, setVerification] = useState<Verification>()
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  const boundCount = [user.phone, user.email, user.wechatOpenid].filter(Boolean).length
  const cloud = isCloudAccount()

  async function sendCode() {
    if (sending) return
    setSending(true)
    try {
      const delivery = binding === 'email' ? await sendEmailCode(email, 'bind') : await sendSmsCode(phone, 'bind')
      toast(delivery.devCode
        ? t('验证码已发送：{{code}}', { code: delivery.devCode })
        : t(binding === 'email' ? '验证码已发送，请查收邮件' : '验证码已发送，请查收短信'))
      setLeft(delivery.cooldown ?? 60)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('发送失败，请重试'))
    } finally {
      setSending(false)
    }
  }

  async function submitBind() {
    if (saving) return
    setSaving(true)
    try {
      if (cloud && verification?.code.length !== 6) throw new Error(t('请先验证已有登录方式'))
      if (binding === 'email') {
        if (!EMAIL_RE.test(email.trim())) throw new Error(t('请输入正确的邮箱地址'))
        await bindEmail(email, code, verification)
        toast(t('邮箱已绑定'))
      } else {
        if (!PHONE_RE.test(phone.trim())) throw new Error(t('请输入正确的 11 位手机号'))
        await bindPhone(phone, code, verification)
        toast(t('手机号已绑定'))
      }
      setBinding(null)
      setEmail('')
      setPhone('')
      setCode('')
      setLeft(0)
      setError('')
      setVerification(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('绑定失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  async function handleBindWechat() {
    try {
      await bindWechat()
      toast(t('微信已绑定'))
    } catch (err) {
      toast(err instanceof Error ? t(err.message) : t('绑定失败，请重试'))
    }
  }

  async function handleUnbind(kind: IdentityKind) {
    if (saving) return
    setSaving(true)
    try {
      if (kind === 'email') {
        if (boundCount <= 1) throw new Error(t('至少保留一种登录方式'))
        if (cloud && verification?.code.length !== 6) throw new Error(t('请先验证已有登录方式'))
        await unbindEmail(verification)
      }
      else await unbindWechat()
      toast(t('已解绑'))
      setConfirm(null)
      setVerification(undefined)
    } catch (err) {
      if (kind === 'email' && cloud) setError(err instanceof Error ? err.message : t('解绑失败，请重试'))
      else toast(err instanceof Error ? t(err.message) : t('解绑失败，请重试'))
    } finally {
      setSaving(false)
    }
  }

  function action(kind: IdentityKind, bound: boolean) {
    if (kind === 'phone') {
      return bound ? (
        <span className="shrink-0 text-[13px] text-text-sub">{t('不可解绑')}</span>
      ) : (
        <button
          onClick={() => {
            setBinding('phone')
            setConfirm(null)
            setVerification(undefined)
            setCode('')
            setError('')
          }}
          className="shrink-0 rounded-full border border-border px-3 py-1 text-[13px] font-medium"
        >
          {t('绑定')}
        </button>
      )
    }
    if (confirm === kind) {
      if (kind === 'email' && cloud) return null
      return (
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setConfirm(null)} className="rounded-full border border-border px-2.5 py-1 text-[13px]">
            {t('取消')}
          </button>
          <button
            onClick={() => handleUnbind(kind)}
            className="rounded-full bg-danger/10 px-2.5 py-1 text-[13px] font-medium text-danger"
          >
            {t('确认解绑')}
          </button>
        </div>
      )
    }
    if (kind === 'wechat') {
      return bound ? (
        <button onClick={() => setConfirm(kind)} className="shrink-0 text-[13px] text-text-sub">
          {t('解绑')}
        </button>
      ) : (
        <button
          onClick={handleBindWechat}
          className="shrink-0 rounded-full border border-border px-3 py-1 text-[13px] font-medium"
        >
          {t('绑定')}
        </button>
      )
    }
    return bound ? (
      <button onClick={() => { setConfirm(kind); setBinding(null); setVerification(undefined); setError('') }} className="shrink-0 text-[13px] text-text-sub">
        {t('解绑')}
      </button>
    ) : (
      <button
        onClick={() => {
          setBinding(kind === 'email' ? 'email' : 'phone')
          setConfirm(null)
          setVerification(undefined)
          setCode('')
          setError('')
        }}
        className="shrink-0 rounded-full border border-border px-3 py-1 text-[13px] font-medium"
      >
        {t('绑定')}
      </button>
    )
  }

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('登录方式')} desc={t('已绑定 {{count}} 种，至少保留 1 种', { count: boundCount })} />

      <div className="mb-5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
            <Smartphone size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('手机号')}</p>
            <p className="mt-0.5 text-[13px] text-text-sub">
              {user.phone ? maskPhone(user.phone) : t('未绑定')}
            </p>
          </div>
          {action('phone', !!user.phone)}
        </div>

        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
            <Mail size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('邮箱')}</p>
            <p className="mt-0.5 truncate text-[13px] text-text-sub">
              {user.email ? maskEmail(user.email) : t('未绑定')}
            </p>
          </div>
          {action('email', !!user.email)}
        </div>

        <div className="flex items-center gap-3 px-4 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
            <MessageCircle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('微信')}</p>
            <p className="mt-0.5 text-[13px] text-text-sub">
              {user.wechatOpenid ? t('已绑定') : t('未绑定')}
            </p>
          </div>
          {action('wechat', !!user.wechatOpenid)}
        </div>
      </div>

      {binding && (
        <section className="mb-5 rounded-md border border-border bg-surface p-4">
          <p className="text-sm font-semibold">{binding === 'email' ? t('绑定邮箱') : t('绑定手机号')}</p>
          <label className="mt-3 block">
            <span className="text-[13px] text-text-sub">{binding === 'email' ? t('邮箱') : t('手机号')}</span>
            <input
              value={binding === 'email' ? email : phone}
              onChange={(e) =>
                binding === 'email'
                  ? setEmail(e.target.value)
                  : setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
              }
              type={binding === 'email' ? 'email' : 'tel'}
              inputMode={binding === 'email' ? 'email' : 'numeric'}
              placeholder={binding === 'email' ? 'name@example.com' : t('11 位手机号')}
              className={inputCls}
            />
          </label>
          <label className="mt-3 block">
            <span className="text-[13px] text-text-sub">{t('验证码')}</span>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                type="tel"
                inputMode="numeric"
                placeholder={t('6 位验证码')}
                className={inputCls}
              />
              <button
                type="button"
                disabled={left > 0 || sending}
                onClick={sendCode}
                className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                  left > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                }`}
              >
                {left > 0 ? `${left}s` : t('获取验证码')}
              </button>
            </div>
          </label>
          {cloud && <ContactVerification user={user} value={verification} onChange={setVerification} disabled={saving} />}
          {error && <p role="alert" className="mt-2 text-[13px] text-danger">{t(error)}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setBinding(null)
                setError('')
                setVerification(undefined)
              }}
              disabled={saving}
              className="flex-1 rounded-md border border-border py-2.5 text-sm"
            >
              {t('取消')}
            </button>
            <button onClick={submitBind} disabled={saving} className="flex-1 rounded-md bg-text py-2.5 text-sm font-semibold text-bg disabled:opacity-60">
              {t('确认绑定')}
            </button>
          </div>
        </section>
      )}

      {cloud && confirm === 'email' && (
        <section className="mb-5 rounded-md border border-border bg-surface p-4">
          <p className="text-sm font-semibold">{t('解绑邮箱')}</p>
          {boundCount > 1
            ? <ContactVerification user={user} value={verification} onChange={setVerification} disabled={saving} />
            : <p className="mt-2 text-sm text-text-sub">{t('至少保留一种登录方式')}</p>}
          {error && <p role="alert" className="mt-2 text-[13px] text-danger">{t(error)}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={saving} onClick={() => setConfirm(null)} className="flex-1 rounded-md border border-border py-2.5 text-sm">{t('取消')}</button>
            <button type="button" disabled={saving || boundCount <= 1} onClick={() => handleUnbind('email')}
              className="flex-1 rounded-md bg-danger py-2.5 text-sm font-semibold text-bg disabled:opacity-60">{t('确认解绑')}</button>
          </div>
        </section>
      )}

      <p className="text-[13px] leading-relaxed text-text-sub">
        {t('解绑前请确认还有其他登录方式，避免无法登录。手机号暂不支持自助换绑。')}
      </p>

      <Link to="/profile/settings" className="mt-5 inline-block text-[14px] text-text-sub underline">
        {t('返回设置')}
      </Link>
    </div>
  )
}
