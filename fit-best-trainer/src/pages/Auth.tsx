import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { EMAIL_RE, PHONE_RE, sendEmailCode, sendSmsCode } from '../utils/auth'

type Tab = 'phone' | 'email' | 'wechat'

function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const {
    login,
    loginWithSms,
    loginWithEmail,
    loginWithWechat,
    loginWithWechatPhone,
  } = useAuth()

  const [tab, setTab] = useState<Tab>('phone')
  const [phoneMode, setPhoneMode] = useState<'code' | 'password'>('code')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [smsLeft, setSmsLeft] = useCountdown()

  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailLeft, setEmailLeft] = useCountdown()

  const [wechatStep, setWechatStep] = useState<'idle' | 'new'>('idle')
  const [wxPhone, setWxPhone] = useState('')
  const [wxCode, setWxCode] = useState('')
  const [wxLeft, setWxLeft] = useCountdown()

  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const inputClass =
    'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-sub/50 focus:border-text'

  async function sendSms(target: string, setLeft: (n: number) => void) {
    try {
      const code = await sendSmsCode(target)
      setLeft(60)
      toast(code ? t('验证码已发送：{{code}}', { code }) : t('验证码已发送，请查收短信'))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('发送失败，请重试'))
    }
  }

  async function sendEmail(target: string) {
    try {
      const code = await sendEmailCode(target)
      setEmailLeft(60)
      toast(code ? t('验证码已发送：{{code}}', { code }) : t('验证码已发送，请查收邮件'))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('发送失败，请重试'))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!agreed) {
      setError(t('请先阅读并同意用户协议与隐私政策'))
      return
    }
    setError('')
    setBusy(true)
    try {
      if (tab === 'phone') {
        if (!PHONE_RE.test(phone.trim())) throw new Error(t('请输入正确的 11 位手机号'))
        if (phoneMode === 'code') {
          if (!smsCode.trim()) throw new Error(t('请输入验证码'))
          await loginWithSms(phone, smsCode)
          toast(t('登录成功'))
        } else {
          if (password.length < 6) throw new Error(t('密码至少 6 位'))
          await login(phone, password)
          toast(t('登录成功'))
        }
      } else if (tab === 'email') {
        if (!EMAIL_RE.test(email.trim())) throw new Error(t('请输入正确的邮箱地址'))
        if (!emailCode.trim()) throw new Error(t('请输入验证码'))
        await loginWithEmail(email, emailCode)
        toast(t('登录成功'))
      } else if (wechatStep === 'new') {
        if (!PHONE_RE.test(wxPhone.trim())) throw new Error(t('请输入正确的 11 位手机号'))
        if (!wxCode.trim()) throw new Error(t('请输入验证码'))
        await loginWithWechatPhone(wxPhone, wxCode)
        toast(t('微信登录成功'))
      }
      navigate('/profile', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('操作失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  async function handleWechat() {
    setError('')
    setBusy(true)
    try {
      const account = await loginWithWechat()
      if (account) {
        toast(t('微信登录成功'))
        navigate('/profile', { replace: true })
      } else {
        setWechatStep('new')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('微信授权失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'phone', label: '手机号' },
    { key: 'email', label: '邮箱' },
    { key: 'wechat', label: '微信' },
  ]

  const submitLabel =
    tab === 'wechat'
      ? t('完成注册并登录')
      : tab === 'phone' && phoneMode === 'password'
        ? t('登录')
        : mode === 'register'
          ? t('注册 / 登录')
          : t('登录 / 注册')

  return (
    <div className="px-5 pt-4">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-sub"
          aria-label={t('返回')}
        >
          <ArrowLeft size={18} />
        </button>
        <p className="text-[13px] uppercase tracking-[0.28em] text-text-sub">FITBEST</p>
      </header>

      <div className="reveal reveal-1 mt-8 flex items-center gap-3">
        <img src="./logo.png" alt="FITBEST" className="h-[60px] w-[60px] shrink-0 rounded-full object-contain" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{mode === 'register' ? t('注册') : t('登录')}</h1>
          <p className="mt-0.5 text-xs text-text-sub">{t('一个账号，手机号、邮箱或微信都能登录')}</p>
        </div>
      </div>

      <div className="reveal reveal-2 mt-6 grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            onClick={() => {
              setTab(tabItem.key)
              setError('')
            }}
            className={`rounded-sm py-2.5 text-[14px] font-medium transition-colors ${
              tab === tabItem.key ? 'bg-text text-bg' : 'text-text-sub'
            }`}
          >
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      <form className="reveal reveal-2 mt-5" onSubmit={handleSubmit} noValidate>
        {tab === 'phone' && (
          <>
            <div className="mb-4 flex gap-4 border-b border-border">
              {[
                { key: 'code' as const, label: '验证码登录' },
                { key: 'password' as const, label: '密码登录' },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPhoneMode(m.key)}
                  className={`-mb-px border-b-2 pb-2 text-[14px] ${
                    phoneMode === m.key ? 'border-text font-medium text-text' : 'border-transparent text-text-sub'
                  }`}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>

            <label className="mb-4 block">
              <span className="text-[14px] text-text-sub">{t('手机号')}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder={t('11 位手机号')}
                className={inputClass}
              />
            </label>

            {phoneMode === 'code' ? (
              <label className="block">
                <span className="text-[14px] text-text-sub">{t('验证码')}</span>
                <div className="flex gap-2">
                  <input
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={t('6 位验证码')}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={smsLeft > 0}
                    onClick={() => sendSms(phone.trim(), setSmsLeft)}
                    className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                      smsLeft > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                    }`}
                  >
                    {smsLeft > 0 ? `${smsLeft}s` : t('获取验证码')}
                  </button>
                </div>
              </label>
            ) : (
              <label className="block">
                <span className="text-[14px] text-text-sub">{t('密码')}</span>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('至少 6 位')}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 p-1 text-text-sub"
                    aria-label={showPw ? t('隐藏密码') : t('显示密码')}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            )}
          </>
        )}

        {tab === 'email' && (
          <>
            <label className="mb-4 block">
              <span className="text-[14px] text-text-sub">{t('邮箱')}</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-[14px] text-text-sub">{t('验证码')}</span>
              <div className="flex gap-2">
                <input
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={t('6 位验证码')}
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={emailLeft > 0}
                  onClick={() => sendEmail(email)}
                  className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                    emailLeft > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                  }`}
                >
                  {emailLeft > 0 ? `${emailLeft}s` : t('获取验证码')}
                </button>
              </div>
            </label>
          </>
        )}

        {tab === 'wechat' && (
          <>
            {wechatStep === 'idle' ? (
              <div className="rounded-md border border-border bg-surface p-5 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-connected">
                  <MessageCircle size={26} />
                </span>
                <p className="mt-3 text-sm font-medium">{t('使用微信授权登录')}</p>
                <p className="mt-1 text-[13px] text-text-sub">{t('首次登录需验证手机号，完成账号创建')}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleWechat}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 py-3 text-[15px] font-medium disabled:opacity-60"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />} {t('微信授权登录')}
                </button>
              </div>
            ) : (
              <>
                <p className="mb-4 rounded-md bg-surface-2 px-3 py-2.5 text-[13px] text-text-sub">
                  {t('微信授权成功，首次使用请验证手机号')}
                </p>
                <label className="mb-4 block">
                  <span className="text-[14px] text-text-sub">{t('手机号')}</span>
                  <input
                    value={wxPhone}
                    onChange={(e) => setWxPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder={t('11 位手机号')}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-[14px] text-text-sub">{t('验证码')}</span>
                  <div className="flex gap-2">
                    <input
                      value={wxCode}
                      onChange={(e) => setWxCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder={t('6 位验证码')}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      disabled={wxLeft > 0}
                      onClick={() => sendSms(wxPhone.trim(), setWxLeft)}
                      className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                        wxLeft > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                      }`}
                    >
                      {wxLeft > 0 ? `${wxLeft}s` : t('获取验证码')}
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => setWechatStep('idle')}
                  className="mt-3 text-[13px] text-text-sub underline"
                >
                  {t('返回微信登录')}
                </button>
              </>
            )}
          </>
        )}

        {error && <p className="mt-3 text-[14px] text-danger">{t(error)}</p>}

        <label className="mt-4 flex items-start gap-2 text-[13px] text-text-sub">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
          />
          <span>
            {t('我已阅读并同意')}
            <Link to="/profile/about" className="mx-1 underline">
              {t('用户协议')}
            </Link>
            {t('与')}
            <Link to="/profile/about" className="mx-1 underline">
              {t('隐私政策')}
            </Link>
          </span>
        </label>

        {(tab !== 'wechat' || wechatStep === 'new') && (
          <button
            type="submit"
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-text py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        )}
      </form>

      <p className="reveal reveal-3 mt-5 text-center text-[12px] text-text-sub/80">
        {t('演示环境：短信 / 邮箱验证码固定为 123456，获取后 5 分钟内有效')}
      </p>
      <p className="reveal reveal-3 mt-2 pb-2 text-center">
        <Link to="/" className="text-[14px] text-text-sub underline underline-offset-2">
          {t('先逛逛，稍后登录')}
        </Link>
      </p>
    </div>
  )
}
