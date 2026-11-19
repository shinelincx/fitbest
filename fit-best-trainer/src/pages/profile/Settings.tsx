import FeedbackForm, { type FeedbackReceipt } from '../../../../race-trainer-shared/FeedbackForm'
import { getAccessUserId, request } from '../../api/client'
import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Check, ChevronRight, Database, Download, Fingerprint, Info, Languages, MessageSquare, Shield, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import Toggle from '../../components/Toggle'
import { getPrefs, updatePrefs, type Prefs } from '../../utils/prefs'
import { LANGS, currentLangLabel, getLangSetting, setLanguage, type LangSetting } from '../../i18n'
import { pickNativeFeedbackImages } from '../../platform/files'
import { isNative } from '../../platform/runtime'
import { usePwa } from '../../platform/pwa'

function Row(props: { to: string; icon: ReactNode; label: string; desc: string }) {
  return (
    <Link to={props.to} state={{ fromSettings: true }} className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{props.label}</span>
        <span className="mt-0.5 block truncate text-[13px] text-text-sub">{props.desc}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-text-sub" />
    </Link>
  )
}

export default function Settings() {
  const { t } = useTranslation()
  const prefs = getPrefs()
  const { installed } = usePwa()

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('设置')} desc={t('首页提醒、账号安全、数据与偏好')} />

      <section className="mb-5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {!isNative && (
          <Row
            to="/profile/identities"
            icon={<Fingerprint size={16} />}
            label={t('登录方式')}
            desc={t('手机号 · 邮箱 · 微信')}
          />
        )}
        <Row
          to="/profile/notifications"
          icon={<Bell size={16} />}
          label={t('首页训练提醒')}
          desc={prefs.reminderEnabled ? t('本设备 · 每天 {{time}}', { time: prefs.reminderTime }) : t('本设备 · 已关闭')}
        />
        {!isNative && (
          <Row to="/profile/security" icon={<Shield size={16} />} label={t('账号与安全')} desc={t('修改密码 · 退出登录 · 注销账号')} />
        )}
        <Row to="/profile/settings/training" icon={<Volume2 size={16} />} label={t('训练偏好')} desc={`${t('提示音')} · ${t('震动反馈')}`} />
        <Row to="/profile/settings/language" icon={<Languages size={16} />} label={t('语言')} desc={t(currentLangLabel())} />
        <Row to="/profile/data" icon={<Database size={16} />} label={t('数据管理')} desc={t('导出备份 · 导入记录 · 清空')} />
        {!isNative && <Row to="/profile/install" icon={<Download size={16} />} label={t('安装 Fitbest')} desc={installed ? t('已安装') : t('添加到主屏幕或应用列表')} />}
        <Row to="/profile/settings/feedback" icon={<MessageSquare size={16} />} label={t('意见反馈')} desc={t('报告问题或提出建议')} />
        <Row to="/profile/about" icon={<Info size={16} />} label={t('关于 FITBEST')} desc={t('版本 1.0.0 · 隐私与协议')} />
      </section>
    </div>
  )
}

function SettingsSubpageHeader({ title }: { title: string }) {
  const { state } = useLocation()
  const navigate = useNavigate()
  return <PageHeader title={title} desc="设置保存在此设备。" onBack={() => {
    if (state?.fromSettings) navigate(-1)
    else navigate('/profile/settings', { replace: true })
  }} />
}

export function TrainingPreferences() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState(getPrefs)

  function patchPrefs(patch: Partial<Prefs>) {
    setPrefs(updatePrefs(patch))
  }

  return (
    <div className="px-5 pt-5">
      <SettingsSubpageHeader title="训练偏好" />
      <section className="space-y-2">
        <Toggle on={prefs.sound} onChange={(v) => patchPrefs({ sound: v })} label={t('提示音')} desc={t('间歇切换与目标达成时播放提示音')} />
        <Toggle on={prefs.vibration} onChange={(v) => patchPrefs({ vibration: v })} label={t('震动反馈')} desc={isNative || 'vibrate' in navigator ? t('间歇阶段切换时震动提醒（需系统支持）') : t('此浏览器不支持震动反馈')} />
      </section>
    </div>
  )
}

export function LanguageSettings() {
  const { t } = useTranslation()
  const [lang, setLang] = useState(getLangSetting)
  const langOptions = [{ code: 'system', label: t('跟随系统') } as const, ...LANGS]

  async function chooseLang(code: LangSetting) {
    setLang(code)
    await setLanguage(code)
  }

  return (
    <div className="px-5 pt-5">
      <SettingsSubpageHeader title="语言" />
      <section className="grid grid-cols-2 gap-2 hd:lg:grid-cols-4">
        {langOptions.map((opt) => (
          <button
            key={opt.code}
            type="button"
            aria-pressed={lang === opt.code}
            onClick={() => void chooseLang(opt.code)}
            className={`flex min-h-11 items-center justify-between rounded-md border px-3.5 py-3 text-left text-sm transition-colors ${
              lang === opt.code
                ? 'border-primary bg-primary/5 font-medium text-primary'
                : 'border-border bg-surface text-text'
            }`}
          >
            <span>{opt.label}</span>
            {lang === opt.code && <Check size={15} className="shrink-0" aria-hidden="true" />}
          </button>
        ))}
      </section>
    </div>
  )
}


export function FeedbackSettings() {
  const navigate = useNavigate()
  const apiBase = import.meta.env.VITE_API_BASE?.trim()
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pt-5">
      <PageHeader title="意见反馈" onBack={() => navigate('/profile/settings')} />
      <FeedbackForm source="fitbest" accountId={getAccessUserId}
        pickImages={isNative ? pickNativeFeedbackImages : undefined} send={(body, key, signal) => {
        if (isNative && !apiBase?.startsWith('https://')) {
          return Promise.reject(new Error('此原生版本尚未配置反馈服务'))
        }
        return request<FeedbackReceipt>('/feedback', {
          method: 'POST', body, headers: { 'Idempotency-Key': key }, signal,
        })
      }} />
    </div>
  )
}
