import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'

const sections = [
  {
    title: '隐私说明',
    body: [
      '登录后的账号资料和有氧器械训练记录会保存到服务器。恢复网络后，待同步的有氧记录会自动补传。',
      '游客记录、力量训练记录和智能插销绑定保存在本机。力量记录可在「数据管理」导出备份并手动导入，插销绑定需在新设备上重新设置。',
    ],
  },
  {
    title: '用户协议',
    body: [
      '本应用提供的训练数据与建议仅用于日常健身参考，不构成医疗建议。如有伤病或身体不适，请咨询专业医生。',
      '使用器械训练前请确认设备连接正常，并根据自身状况调整强度；因不当使用造成的风险由使用者自行承担。',
      'HYROX 与 BTWE 为独立应用，使用其服务时适用对应站点的条款。',
    ],
  },
]

export default function About() {
  const { t } = useTranslation()

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('关于 FITBEST')} desc={t('智能器械训练 · 聚合入口')} />

      <section className="mb-5 flex items-center gap-4 rounded-md border border-border bg-surface p-5">
        <img src="./logo.png" alt="FITBEST" className="h-[70px] w-[70px] shrink-0 rounded-full object-contain" />
        <div>
          <p className="font-display text-xl font-bold">FITBEST</p>
          <p className="mt-1 text-[13px] text-primary">{t('一起，为了活力')}</p>
          <p className="mt-1 font-mono text-[12px] text-text-sub">{t('版本 1.0.0')}</p>
        </div>
      </section>

      <section className="mb-5 rounded-md border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Info size={15} className="text-primary" /> {t('关于本应用')}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-text-sub">
          {t('FITBEST 把跑步机、划船机、滑雪机、风阻单车的单机训练与 HYROX、BTWE 两个体能赛训练应用聚合在一起，支持蓝牙器械与心率带连接。记录按账号隔离，游客也可以直接开始训练。')}
        </p>
      </section>

      <section className="space-y-2">
        {sections.map((s) => (
          <details key={s.title} className="rounded-md border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t(s.title)}</summary>
            <div className="mt-2 space-y-2">
              {s.body.map((p) => (
                <p key={p} className="text-[13px] leading-relaxed text-text-sub">
                  {t(p)}
                </p>
              ))}
            </div>
          </details>
        ))}
      </section>

      <p className="mt-6 text-center text-[12px] text-text-sub">© {new Date().getFullYear()} FITBEST · thinkfit.cn</p>
    </div>
  )
}
