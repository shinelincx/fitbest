import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Target,
  Trophy,
  Calendar,
  MapPin,
  ChevronRight,
  Bell,
  Settings,
  HelpCircle,
  Share2,
  Cpu,
  Heart,
  Sparkles,
  Pencil,
  X,
} from 'lucide-react'
import { fetchUser, fetchRaces, toggleRaceRegistration, updateUser } from '../api'
import { clearTokens } from '../api/client'
import type { User, Race } from '../types'
import { levelLabel } from '../utils/format'
import DevicePanel from '../components/DevicePanel'
import { useToast } from '../components/Toast'
import { getSsoUser } from '../utils/sso'

export default function Profile() {
  const [user, setUser] = useState<User | null>(null)
  const [races, setRaces] = useState<Race[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formName, setFormName] = useState('')
  const [formRace, setFormRace] = useState('')
  const [saving, setSaving] = useState(false)
  const [authed, setAuthed] = useState(() => Boolean(localStorage.getItem('fitbest:access')))
  const [racePending, setRacePending] = useState(false)
  const toast = useToast()

  useEffect(() => {
    Promise.all([fetchUser(), fetchRaces()]).then(([u, r]) => {
      setUser(u)
      setRaces(r)
      setLoading(false)
    })
  }, [])

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    )
  }

  const statusMap: Record<string, { label: string; cls: string }> = {
    upcoming: { label: '即将到来', cls: 'bg-accent/10 text-accent' },
    registration: { label: '报名中', cls: 'bg-primary/10 text-primary' },
    in_progress: { label: '进行中', cls: 'bg-warning/10 text-warning' },
    past: { label: '已结束', cls: 'bg-surface-2 text-text-sub' },
  }

  const sso = getSsoUser()
  const displayName = sso?.nickname ?? user.name
  const avatarSrc = sso?.avatar

  const menu: {
    icon: typeof Bell
    label: string
    desc: string
    to?: string
    accent?: boolean
  }[] = [
    { icon: Sparkles, label: 'AI 教练', desc: '数字人教练，随时解答训练问题', to: '/ai-coach', accent: true },
    { icon: Bell, label: '训练提醒', desc: '每日提醒时间与开关', to: '/settings' },
    { icon: Settings, label: '偏好设置', desc: '音效、震动、数据管理', to: '/settings' },
    { icon: HelpCircle, label: '帮助与反馈', desc: '常见问题与意见反馈', to: '/help' },
    { icon: Share2, label: '分享 App', desc: '邀请搭子一起练' },
  ]

  async function shareApp() {
    const data = {
      title: 'HYROX 训练',
      text: '一起来 HYROX 体能赛训练！',
      url: window.location.href,
    }
    if (navigator.share) {
      try {
        await navigator.share(data)
        return
      } catch {
        // 用户取消分享，降级为复制链接
      }
    }
    try {
      await navigator.clipboard.writeText(data.url)
      toast('链接已复制，去分享给搭子吧')
    } catch {
      toast('复制失败，请手动分享浏览器地址')
    }
  }

  async function handleRace(race: Race) {
    if (racePending) return
    setRacePending(true)
    try {
      const registered = await toggleRaceRegistration(race.id, race.registered)
      setRaces((prev) => prev.map((r) => r.id === race.id ? { ...r, registered } : r))
      toast(registered ? '报名成功' : '已取消报名')
    } catch (error) {
      toast(error instanceof Error ? error.message : '报名操作失败，请重试')
    } finally {
      setRacePending(false)
    }
  }

  function handleLogout() {
    clearTokens()
    try {
      localStorage.removeItem('fitbest:session')
    } catch {
      // ignore
    }
    setAuthed(false)
    toast('已退出登录，训练记录仍保留在本机')
  }

  function openEdit() {
    setFormName(user!.name)
    setFormRace(user!.targetRace)
    setEditing(true)
  }

  async function saveProfile() {
    const name = formName.trim()
    if (!name) {
      toast('姓名不能为空')
      return
    }
    setSaving(true)
    const next = await updateUser({
      name,
      avatar: name.slice(0, 2).toUpperCase(),
      targetRace: formRace.trim(),
    })
    setUser(next)
    setSaving(false)
    setEditing(false)
    toast('资料已更新')
  }

  return (
    <div className="px-5 pt-5 hd:lg:grid hd:lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] hd:lg:items-start hd:lg:gap-x-6 hd:lg:px-8 hd:lg:pt-7">
      {/* 个人卡片 */}
      <header className="reveal reveal-1 mb-6 hd:lg:col-start-1 hd:lg:row-start-1">
        <button
          onClick={() => (sso ? toast('资料由 FITBEST 账号管理，请到 FITBEST 修改') : openEdit())}
          className="flex w-full items-center gap-4 rounded-radius-lg border border-border bg-surface p-5 text-left transition-colors active:bg-surface-2 hd:lg:gap-5 hd:lg:p-6"
        >
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-primary/10 font-display text-2xl font-bold text-primary hd:lg:h-20 hd:lg:w-20">
            {avatarSrc ? (
              <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              user.avatar
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold hd:lg:text-2xl">{displayName}</h1>
            <p className="text-sm text-text-sub">
              {levelLabel(user.level)}选手 · 连续 {user.stats.streak} 天
            </p>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-primary">
              <Target size={12} /> {user.targetRace || '未设置目标赛事'}
            </p>
          </div>
          {sso ? <span className="shrink-0 text-[11px] text-text-sub">FITBEST 账号</span> : <Pencil size={16} className="shrink-0 text-text-sub" />}
        </button>
      </header>

      {/* 账号状态 */}
      <section className="reveal reveal-2 mb-6 hd:lg:col-start-1 hd:lg:row-start-2">
        <div className="flex items-center justify-between gap-3 rounded-radius-lg border border-border bg-surface p-4 hd:lg:p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">{authed ? '已登录' : '未登录'}</p>
            <p className="text-xs text-text-sub">
              {authed ? '训练记录会同步到云端，换设备可恢复' : '训练记录仅保存在本机'}
            </p>
          </div>
          {authed ? (
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] text-text-sub"
            >
              退出登录
            </button>
          ) : (
            <Link
              to="/login"
              className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-bg"
            >
              去登录
            </Link>
          )}
        </div>
      </section>

      {/* 返回 FITBEST 聚合入口 */}
      <section className="reveal reveal-2 mb-6 hd:lg:col-start-2 hd:lg:row-start-1">
        <a
          href={import.meta.env.VITE_BUILD === 'hd' ? '/fit-best/HD/' : '/fit-best/'}
          className="flex items-center gap-3 rounded-radius-lg border border-border bg-surface p-4 transition-colors active:bg-surface-2 hd:lg:p-5"
        >
          <img
            src="/fit-best/logo.png"
            alt="FITBEST"
            className="h-10 w-10 shrink-0 rounded-full object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">返回 FITBEST</p>
            <p className="text-xs text-text-sub">单机训练 · 三站训练汇总</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-text-sub" />
        </a>
      </section>

      {/* 成就数据 */}
      <section className="reveal reveal-2 mb-6 grid grid-cols-2 gap-3 hd:lg:col-start-1 hd:lg:row-start-3 hd:lg:gap-4">
        <div className="rounded-radius-md border border-border bg-surface p-4 hd:lg:p-5">
          <Trophy size={20} className="text-warning" />
          <p className="mt-2 font-display text-2xl font-bold hd:lg:whitespace-nowrap hd:lg:text-3xl">{user.stats.totalSessions}</p>
          <p className="text-xs text-text-sub">累计训练次数</p>
        </div>
        <div className="rounded-radius-md border border-border bg-surface p-4 hd:lg:p-5">
          <MapPin size={20} className="text-accent" />
          <p className="mt-2 font-display text-2xl font-bold hd:lg:whitespace-nowrap hd:lg:text-3xl">{user.stats.totalKm}</p>
          <p className="text-xs text-text-sub">累计公里数</p>
        </div>
      </section>

      {/* 心率设备 */}
      <section className="reveal reveal-3 mb-6 hd:lg:col-start-2 hd:lg:row-start-2">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold hd:lg:text-lg">
          <Heart size={18} className="text-danger" /> 我的心率设备
        </h3>
        <p className="mb-3 text-xs text-text-sub">
          所有训练心率数据均来自心率带，请在训练前连接
        </p>
        <DevicePanel types={['heartRate']} />
      </section>

      {/* 智能器械管理 */}
      <section className="reveal reveal-4 mb-6 hd:lg:col-start-2 hd:lg:row-start-3">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold hd:lg:text-lg">
          <Cpu size={18} className="text-primary" /> 我的智能器械
        </h3>
        <DevicePanel types={['treadmill', 'rower', 'ski', 'bike', 'sled', 'rep']} />
      </section>

      {/* 赛事日历 */}
      <section className="reveal reveal-4 mb-6 hd:lg:col-start-2 hd:lg:row-start-4">
        <h3 className="mb-3 flex items-center gap-1.5 font-display text-base font-bold hd:lg:text-lg">
          <Calendar size={18} className="text-primary" /> HYROX 赛事日历
        </h3>
        <div className="space-y-2">
          {races.length === 0 && <p className="text-sm text-text-sub">暂无可用赛事</p>}
          {races.map((race) => {
            const st = statusMap[race.status]
            return (
              <div
                key={race.id}
                className="flex items-center justify-between rounded-radius-md border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{race.name}</p>
                  <p className="text-xs text-text-sub">
                    {race.city} · {race.date}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>
                    {st.label}
                  </span>
                  {race.status === 'registration' && (
                    <button
                      onClick={() => handleRace(race)}
                      disabled={racePending}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        race.registered
                          ? 'border border-primary text-primary'
                          : 'bg-primary text-bg'
                      }`}
                    >
                      {race.registered ? '已报名' : '报名'}
                    </button>
                  )}
                 </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 菜单 */}
      <section className="reveal reveal-4 hd:lg:col-start-2 hd:lg:row-start-5">
        <div className="overflow-hidden rounded-radius-lg border border-border bg-surface">
          {menu.map((m, i) => {
            const Icon = m.icon
            const inner = (
              <>
                <Icon size={20} className={m.accent ? 'text-primary' : 'text-text-sub'} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${m.accent ? 'text-primary' : ''}`}>
                    {m.label}
                  </p>
                  <p className="text-xs text-text-sub">{m.desc}</p>
                </div>
                <ChevronRight size={16} className={m.accent ? 'text-primary' : 'text-text-sub'} />
              </>
            )
            return (
              <div
                key={m.label}
                className={`${i !== menu.length - 1 ? 'border-b border-border' : ''} ${
                  m.accent ? 'bg-primary/5' : ''
                }`}
              >
                {m.to ? (
                  <Link
                    to={m.to}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-surface-2 hd:lg:p-5"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    onClick={shareApp}
                    className="flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-surface-2 hd:lg:p-5"
                  >
                    {inner}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-center text-xs text-text-sub">
          HYROX 训练 v1.0.0 · HYROX 室内体能赛
        </p>
      </section>

      {/* 编辑资料弹层 */}
      {editing && (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/60"
          onClick={() => setEditing(false)}
        >
          <div
            className="sheet-up w-full rounded-t-[24px] border-t border-border bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">编辑个人资料</h3>
              <button
                onClick={() => setEditing(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-sub"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <label className="mb-1 block text-xs text-text-sub">姓名</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="mb-4 w-full rounded-radius-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
              placeholder="输入姓名"
            />

            <label className="mb-1 block text-xs text-text-sub">目标赛事</label>
            <input
              value={formRace}
              onChange={(e) => setFormRace(e.target.value)}
              className="mb-5 w-full rounded-radius-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
              placeholder="例如：2027 HYROX 上海站"
            />

            <button
              onClick={saveProfile}
              disabled={saving}
              className="w-full rounded-radius-md bg-primary py-3 font-semibold text-bg disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
