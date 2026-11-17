import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell, Volume2, Smartphone, PauseCircle, Database, RotateCcw } from 'lucide-react'
import { getPrefs, updatePrefs, type Prefs } from '../utils/prefs'
import { clearSessions, resetLocalData } from '../api'
import { useToast } from '../components/Toast'

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-surface-2 border border-border'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-text transition-transform ${
          on ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function Row({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Bell
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
      <Icon size={18} className="shrink-0 text-text-sub" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="mt-0.5 text-xs text-text-sub">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const toast = useToast()
  const [prefs, setPrefs] = useState<Prefs>(getPrefs())

  function patch(p: Partial<Prefs>) {
    setPrefs(updatePrefs(p))
  }

  return (
    <div className="px-5 pt-5 hd:lg:mx-auto hd:lg:w-full hd:lg:max-w-[720px] hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-sub"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-display text-base font-bold">偏好设置</h1>
        <div className="h-9 w-9" />
      </header>

      {/* 训练提醒 */}
      <section className="reveal reveal-2 mb-5">
        <h3 className="mb-2 px-1 text-xs font-semibold text-text-sub">训练提醒</h3>
        <div className="overflow-hidden rounded-radius-lg border border-border bg-surface">
          <Row icon={Bell} title="每日训练提醒" desc={prefs.reminder ? '已开启' : '已关闭'}>
            <Switch on={prefs.reminder} onToggle={() => patch({ reminder: !prefs.reminder })} />
          </Row>
          {prefs.reminder && (
            <Row icon={Bell} title="提醒时间">
              <input
                type="time"
                value={prefs.reminderTime}
                onChange={(e) => patch({ reminderTime: e.target.value })}
                className="rounded-radius-sm border border-border bg-surface-2 px-2 py-1 font-mono text-sm text-text"
              />
            </Row>
          )}
        </div>
      </section>

      {/* 训练反馈 */}
      <section className="reveal reveal-3 mb-5">
        <h3 className="mb-2 px-1 text-xs font-semibold text-text-sub">训练反馈</h3>
        <div className="overflow-hidden rounded-radius-lg border border-border bg-surface">
          <Row icon={Volume2} title="训练音效" desc="阶段完成时播放提示音">
            <Switch on={prefs.sound} onToggle={() => patch({ sound: !prefs.sound })} />
          </Row>
          <Row icon={Smartphone} title="震动反馈" desc="目标达成时震动提示">
            <Switch on={prefs.vibration} onToggle={() => patch({ vibration: !prefs.vibration })} />
          </Row>
          <Row icon={PauseCircle} title="连接设备时自动暂停" desc="连接心率带/器械时暂停计时">
            <Switch on={prefs.autoPause} onToggle={() => patch({ autoPause: !prefs.autoPause })} />
          </Row>
        </div>
      </section>

      {/* 数据管理 */}
      <section className="reveal reveal-4 mb-5">
        <h3 className="mb-2 px-1 text-xs font-semibold text-text-sub">数据管理</h3>
        <div className="overflow-hidden rounded-radius-lg border border-border bg-surface">
          <Row icon={Database} title="清除本机训练副本" desc="云端历史可在记录页查看和删除">
            <button
              onClick={() => {
                if (!window.confirm('确定清除本机记录和待上传数据吗？')) return
                try {
                  clearSessions()
                  toast('本机记录已清除')
                } catch {
                  toast('清除失败，请重试')
                }
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-text-sub"
            >
              清除
            </button>
          </Row>
          <Row icon={RotateCcw} title="恢复默认数据" desc="清除所有本地设置与记录">
            <button
              onClick={() => {
                if (!window.confirm('将清除全部本地数据，确定继续吗？')) return
                resetLocalData()
                setPrefs(getPrefs())
                toast('已恢复默认数据')
              }}
              className="rounded-full border border-danger/40 px-3 py-1 text-xs text-danger"
            >
              重置
            </button>
          </Row>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-text-sub">
        HYROX 训练 v1.0.0
      </p>
    </div>
  )
}
