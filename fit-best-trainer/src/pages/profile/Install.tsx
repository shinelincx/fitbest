import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { promptInstall, usePwa } from '../../platform/pwa'

export default function Install() {
  const { t } = useTranslation()
  const { prompt, installed } = usePwa()
  const [status, setStatus] = useState('')
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('安装 Fitbest')} desc={t('从主屏幕或应用列表直接打开训练。')} />
      <section className="space-y-3 rounded-md border border-border bg-surface p-4">
        {installed ? (
          <p role="status" className="text-sm">{t('Fitbest 已安装。')}</p>
        ) : (
          <>
            {prompt && <button type="button" onClick={async () => {
              try {
                const outcome = await promptInstall()
                if (outcome === 'dismissed') setStatus(t('已取消安装，之后也可以从浏览器菜单安装。'))
              } catch {
                setStatus(t('无法打开安装提示，请使用下方步骤。'))
              }
            }} className="min-h-11 w-full rounded-md bg-text px-3 text-sm font-semibold text-bg">{t('安装应用')}</button>}
            <p role="status" className="text-[13px] text-text-sub">{status}</p>
            <h2 className="text-sm font-semibold">{t('通过浏览器安装')}</h2>
            {appleMobile ? (
              <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-text-sub">
                <li>{t('在 Safari 中打开此页，点按「分享」。')}</li>
                <li>{t('选择「添加到主屏幕」，如有「作为网页 App 打开」选项请开启，再点按「添加」。')}</li>
              </ol>
            ) : (
              <p className="text-[13px] text-text-sub">{t('打开浏览器菜单，选择「安装应用」或「添加到主屏幕」。电脑端也可查看地址栏的安装图标。菜单缺少安装项时，仍可在浏览器中使用 Fitbest。')}</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
