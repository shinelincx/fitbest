import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import Toggle from '../../components/Toggle'
import { getPrefs, updatePrefs, type Prefs } from '../../utils/prefs'

const inputCls =
  'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text'

export default function Notifications() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<Prefs>(getPrefs())

  function patch(p: Partial<Prefs>) {
    setPrefs(updatePrefs(p))
  }

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('通知提醒')} desc={t('按设定时间接收训练提醒')} />

      <Toggle
        on={prefs.reminderEnabled}
        onChange={(v) => patch({ reminderEnabled: v })}
        label={t('训练提醒')}
        desc={t('到设定时间还没训练时，在首页提示你')}
      />

      <section className="mt-4 rounded-md border border-border bg-surface p-4">
        <label className="block">
          <span className="flex items-center gap-1.5 text-[13px] text-text-sub">
            <Bell size={14} /> {t('每天提醒时间')}
          </span>
          <input
            type="time"
            value={prefs.reminderTime}
            onChange={(e) => patch({ reminderTime: e.target.value })}
            disabled={!prefs.reminderEnabled}
            className={`${inputCls} ${prefs.reminderEnabled ? '' : 'opacity-50'}`}
          />
        </label>
        <p className="mt-3 text-[13px] leading-relaxed text-text-sub">
          {t('修改立即生效。提醒会在你打开 FITBEST 时显示。')}
        </p>
      </section>

      <section className="mt-4 rounded-md border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t('提醒规则')}</p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-text-sub">
          <li>· {t('当天已有训练记录时不再提醒')}</li>
          <li>· {t('未到提醒时间不打扰')}</li>
          <li>· {t('关闭开关后立即停止提醒')}</li>
        </ul>
      </section>
    </div>
  )
}
