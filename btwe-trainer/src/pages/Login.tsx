import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, ShieldCheck, Loader2, Sparkles } from 'lucide-react'
import { sendSmsCode, loginWithSms } from '../api'
import { useToast } from '../components/Toast'

export default function Login() {
  const navigate = useNavigate()
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [logging, setLogging] = useState(false)

  const phoneOk = /^1[3-9]\d{9}$/.test(phone)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function handleSend() {
    if (!phoneOk) {
      toast('请输入正确的手机号')
      return
    }
    setSending(true)
    try {
      const res = await sendSmsCode(phone)
      setCooldown(res.cooldown ?? 60)
      if (res.devCode) {
        setDevCode(res.devCode)
        setCode(res.devCode)
        toast(`演示环境验证码：${res.devCode}`)
      } else {
        toast('验证码已发送')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '发送失败，请稍后重试')
    } finally {
      setSending(false)
    }
  }

  async function handleLogin() {
    if (!phoneOk) {
      toast('请输入正确的手机号')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      toast('请输入 6 位验证码')
      return
    }
    setLogging(true)
    try {
      await loginWithSms(phone, code)
      toast('登录成功')
      navigate('/profile')
    } catch (error) {
      toast(error instanceof Error ? error.message : '登录失败，请检查验证码')
    } finally {
      setLogging(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-5 pt-5 hd:lg:mx-auto hd:lg:w-full hd:lg:max-w-[720px] hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 mb-8 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-display text-lg font-bold">登录 FITBEST</h1>
          <p className="text-[11px] text-text-sub">登录后训练数据可跨设备同步</p>
        </div>
      </header>

      <div className="reveal reveal-2 rounded-radius-lg border border-border bg-surface p-5">
        <div className="mb-5 flex items-center gap-2 text-primary">
          <ShieldCheck size={18} />
          <span className="text-xs">手机号验证码登录 / 自动注册</span>
        </div>

        <label className="mb-2 block text-xs text-text-sub">手机号</label>
        <div className="mb-4 flex items-center gap-2 rounded-radius-md border border-border bg-surface-2 px-3 py-2.5">
          <Phone size={16} className="shrink-0 text-text-sub" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            placeholder="请输入 11 位手机号"
            className="w-full bg-transparent text-sm outline-none placeholder:text-text-sub/60"
          />
        </div>

        <label className="mb-2 block text-xs text-text-sub">验证码</label>
        <div className="flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="6 位验证码"
            className="min-w-0 flex-1 rounded-radius-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none placeholder:text-text-sub/60"
          />
          <button
            onClick={handleSend}
            disabled={sending || cooldown > 0 || !phoneOk}
            className="shrink-0 rounded-radius-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary disabled:opacity-40"
          >
            {sending ? '发送中' : cooldown > 0 ? `${cooldown}s 后重发` : '获取验证码'}
          </button>
        </div>

        {devCode && (
          <p className="mt-2 text-[11px] text-text-sub">
            演示环境验证码已自动填入：<span className="text-primary">{devCode}</span>
          </p>
        )}

        <button
          onClick={handleLogin}
          disabled={logging}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-radius-md bg-primary py-3 font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {logging && <Loader2 size={16} className="animate-spin" />}
          {logging ? '登录中' : '登录 / 注册'}
        </button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-text-sub">
          未登录也可以训练，记录会保存在本机；
          <br />
          登录后自动补传并参与 AI 教练的计划校准。
        </p>
      </div>

      <section className="reveal reveal-3 mt-6 rounded-radius-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles size={16} />
          <p className="text-xs font-semibold">登录后解锁</p>
        </div>
        <ul className="mt-2 space-y-1.5 text-[11px] text-text-sub">
          <li>· 训练记录云端备份，换设备不丢</li>
          <li>· AI 教练基于你的历史数据生成计划</li>
          <li>· 报名赛事、查看训练排名</li>
        </ul>
      </section>
    </div>
  )
}
