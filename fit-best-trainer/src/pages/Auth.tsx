import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { EMAIL_RE, PHONE_RE, maskEmail, maskPhone, normalizeEmail, sendEmailCode, sendSmsCode } from '../utils/auth'
import { loginReturn } from '../utils/loginReturn'

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
  const location = useLocation()
  const returnTo = loginReturn(location.state?.returnTo)
  const recovery = location.state?.recovery === true
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
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [sent, setSent] = useState<{ channel: 'phone' | 'email'; target: string; expiresIn?: number }>()

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  function showError(message: string, field = '') {
    setError(message)
    setErrorField(field)
    if (field) document.getElementById(field)?.focus()
  }

  const errorProps = (field: string) => ({
    id: field,
    'aria-invalid': Boolean(error && errorField === field),
    'aria-describedby': error && errorField === field ? 'auth-error' : undefined,
  })

  const inputClass =
    'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition-colors placeholder:text-text-sub/50 focus:border-text'

  async function sendSms(target: string, setLeft: (n: number) => void) {
    if (sending || busy || !online) return
    setSending(true)
    try {
      const { devCode: code, cooldown, expiresIn } = await sendSmsCode(target)
      setLeft(cooldown ?? 60)
      if (tab === 'phone') setSent({ channel: 'phone', target, expiresIn })
      toast(code ? t('验证码已发送：{{code}}', { code }) : t('验证码已发送，请查收短信'))
      setError('')
      if (tab === 'phone') document.getElementById('sms-code')?.focus()
    } catch (err) {
      showError(err instanceof Error ? err.message : t('发送失败，请重试'), tab === 'phone' ? 'phone' : '')
    } finally {
      setSending(false)
    }
  }

  async function sendEmail(target: string) {
    if (sending || busy || !online) return
    setSending(true)
    try {
      const { devCode: code, cooldown, expiresIn } = await sendEmailCode(target)
      setEmailLeft(cooldown ?? 60)
      setSent({ channel: 'email', target: normalizeEmail(target), expiresIn })
      toast(code ? t('验证码已发送：{{code}}', { code }) : t('验证码已发送，请查收邮件'))
      setError('')
      document.getElementById('email-code')?.focus()
    } catch (err) {
      showError(err instanceof Error ? err.message : t('发送失败，请重试'), 'email')
    } finally {
      setSending(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || sending || !online) return
    if (!agreed) {
      showError(t('请先阅读并同意用户协议与隐私政策'), 'auth-agreement')
      return
    }
    setError('')
    setBusy(true)
    let field = ''
    try {
      if (tab === 'phone') {
        field = 'phone'
        if (!PHONE_RE.test(phone.trim())) throw new Error(t('请输入正确的 11 位手机号'))
        if (phoneMode === 'code') {
          field = 'sms-code'
          if (smsCode.length !== 6) throw new Error(t('请输入 6 位验证码'))
          await loginWithSms(phone, smsCode, recovery || undefined)
          toast(t('登录成功'))
        } else {
          field = 'password'
          if (password.length < 6) throw new Error(t('密码至少 6 位'))
          await login(phone, password)
          toast(t('登录成功'))
        }
      } else if (tab === 'email') {
        field = 'email'
        if (!EMAIL_RE.test(email.trim())) throw new Error(t('请输入正确的邮箱地址'))
        field = 'email-code'
        if (emailCode.length !== 6) throw new Error(t('请输入 6 位验证码'))
        await loginWithEmail(email, emailCode, recovery || undefined)
        toast(t('登录成功'))
      } else if (wechatStep === 'new') {
        if (!PHONE_RE.test(wxPhone.trim())) throw new Error(t('请输入正确的 11 位手机号'))
        if (!wxCode.trim()) throw new Error(t('请输入验证码'))
        await loginWithWechatPhone(wxPhone, wxCode)
        toast(t('微信登录成功'))
      }
      navigate(recovery ? '/profile/security' : returnTo, { replace: true, state: recovery ? { recovery: true } : undefined })
    } catch (err) {
      showError(err instanceof Error ? err.message : t('操作失败，请重试'), field)
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
        navigate(returnTo, { replace: true })
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
      : t('继续')
  const sentTo = sent?.channel === tab && (tab === 'phone' ? phone === sent.target && phoneMode === 'code' : normalizeEmail(email) === sent.target)
    ? (tab === 'phone' ? maskPhone(sent.target) : maskEmail(sent.target))
    : ''

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
          <h1 className="font-display text-2xl font-bold">{recovery ? t('找回密码') : mode === 'register' ? t('注册') : t('登录')}</h1>
          <p className="mt-0.5 text-xs text-text-sub">{t('一个账号，手机号、邮箱或微信都能登录')}</p>
        </div>
      </div>

      <div className="reveal reveal-2 mt-6 grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1">
        {tabs.filter((item) => !recovery || item.key !== 'wechat').map((tabItem) => (
          <button
            key={tabItem.key}
            type="button"
            disabled={busy || sending}
            aria-pressed={tab === tabItem.key}
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
        {!online && <p role="status" className="mb-3 rounded-md border border-border bg-surface p-3 text-[13px] text-text-sub">
          {t('登录和发送验证码需要联网。恢复网络后可以继续。')}
        </p>}
        {tab === 'phone' && (
          <>
            {!recovery && <div className="mb-4 flex gap-4 border-b border-border">
              {[
                { key: 'code' as const, label: '验证码登录' },
                { key: 'password' as const, label: '密码登录' },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={busy || sending}
                  aria-pressed={phoneMode === m.key}
                  onClick={() => { setPhoneMode(m.key); setError('') }}
                  className={`-mb-px border-b-2 pb-2 text-[14px] ${
                    phoneMode === m.key ? 'border-text font-medium text-text' : 'border-transparent text-text-sub'
                  }`}
                >
                  {t(m.label)}
                </button>
              ))}
            </div>}

            <label className="mb-4 block">
              <span className="text-[14px] text-text-sub">{t('手机号')}</span>
              <input
                {...errorProps('phone')}
                value={phone}
                readOnly={busy || sending}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setSmsCode('') }}
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
                    {...errorProps('sms-code')}
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
                    disabled={!online || busy || sending || (smsLeft > 0 && sent?.target === phone)}
                    onClick={() => sendSms(phone.trim(), setSmsLeft)}
                    className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                      smsLeft > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                    }`}
                  >
                    {smsLeft > 0 && sent?.target === phone ? t('{{count}} 秒后重发', { count: smsLeft }) : t('获取验证码')}
                  </button>
                </div>
              </label>
            ) : (
              <label className="block">
                <span className="text-[14px] text-text-sub">{t('密码')}</span>
                <div className="relative">
                  <input
                    {...errorProps('password')}
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
                {...errorProps('email')}
                value={email}
                readOnly={busy || sending}
                onChange={(e) => { setEmail(e.target.value); setEmailCode('') }}
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
                  {...errorProps('email-code')}
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
                  disabled={!online || busy || sending || (emailLeft > 0 && sent?.target === normalizeEmail(email))}
                  onClick={() => sendEmail(email)}
                  className={`mt-1.5 shrink-0 rounded-md border border-border px-3 text-[14px] font-medium disabled:opacity-50 ${
                    emailLeft > 0 ? 'text-text-sub' : 'bg-surface-2 text-text'
                  }`}
                >
                  {emailLeft > 0 && sent?.target === normalizeEmail(email) ? t('{{count}} 秒后重发', { count: emailLeft }) : t('获取验证码')}
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

        <div role="status" className="mt-2 text-[13px] text-text-sub">
          {sentTo && (sent?.expiresIn
            ? t('已发送至 {{target}}，{{count}} 秒内有效。可编辑上方联系方式。', { target: sentTo, count: sent.expiresIn })
            : t('已发送至 {{target}}。可编辑上方联系方式。', { target: sentTo }))}
        </div>
        {(tab === 'email' || (tab === 'phone' && phoneMode === 'code')) && (
          <p className="mt-2 text-[13px] text-text-sub">{recovery
            ? t('请使用原账号已绑定的手机号或邮箱验证。找回密码流程仅用于已有账号。')
            : t('首次验证此联系方式会创建账号。游客训练记录会保留在本机的游客空间。')}</p>
        )}
        {!recovery && tab === 'phone' && phoneMode === 'password' && (
          <Link to="/login" state={{ recovery: true }} onClick={() => { setPhoneMode('code'); setPassword(''); setError('') }}
            className="mt-3 inline-flex min-h-9 items-center text-[13px] underline">{t('忘记密码')}</Link>
        )}
        {recovery && <p className="mt-2 text-[13px] text-text-sub">
          {t('无法使用已绑定的手机号和邮箱？')}{' '}
          <a href="/fitbestwebsite/#contact" target="_blank" rel="noopener" className="underline">{t('联系支持')}</a>
        </p>}
        <div id="auth-error" role="alert" className="mt-3 text-[14px] text-danger">{error && t(error)}</div>

        <label className="mt-4 flex items-start gap-2 text-[13px] text-text-sub">
          <input
            {...errorProps('auth-agreement')}
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
            disabled={!online || busy || sending}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-text py-3.5 text-sm font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {submitLabel}
          </button>
        )}
      </form>

      <p className="reveal reveal-3 mt-5 pb-2 text-center">
        <Link to="/" className="text-[14px] text-text-sub underline underline-offset-2">
          {t('先逛逛，稍后登录')}
        </Link>
      </p>
    </div>
  )
}
