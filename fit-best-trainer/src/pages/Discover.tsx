import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bluetooth, Loader2, Radar, RefreshCw } from 'lucide-react'
import { useDevices } from '../context/DeviceContext'

export default function Discover() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { allScanning, allError, scanAllDevices, supported } = useDevices()

  const startScan = async (acceptAll = false) => {
    const type = await scanAllDevices(acceptAll)
    if (type) navigate(`/train/${type}`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/92 px-4 py-3 backdrop-blur-xl hd:lg:px-8 hd:lg:py-4">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('返回')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{t('搜索智能器械')}</p>
          <p className="mt-0.5 text-[12px] text-text-sub">{t('自动识别设备类型，无需预选')}</p>
        </div>
        <button
          onClick={() => startScan()}
          disabled={allScanning || !supported}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface disabled:opacity-40"
          aria-label={t('重新搜索')}
        >
          <RefreshCw size={15} className={allScanning ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 px-5 py-4 hd:lg:px-8 hd:lg:py-6">
        {allScanning ? (
          <div className="mt-24 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Radar size={28} className="animate-pulse" />
            </div>
            <p className="mt-4 text-[14px] font-medium">{t('正在搜索附近器械…')}</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-text-sub">
              <Loader2 size={12} className="animate-spin" /> {t('解析广播报文，识别设备类型')}
            </p>
          </div>
        ) : (
          <div className="mt-24 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-text-sub">
              <Bluetooth size={28} />
            </div>
            {supported ? (
              <>
                <p className="mt-4 text-[14px] font-medium">{t('点击下方按钮搜索附近的智能器械')}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-text-sub">
                  {t('选中设备后自动识别类型并进入训练')}
                </p>
                {allError && <p role="alert" className="mt-3 text-[13px] text-danger">{allError}</p>}
                <button
                  onClick={() => startScan()}
                  className="mt-5 rounded-md bg-text px-6 py-2.5 text-[14px] font-medium text-bg"
                >
                  {t('开始搜索')}
                </button>
                <button
                  onClick={() => startScan(true)}
                  className="mt-3 block w-full text-[13px] text-text-sub underline underline-offset-2"
                >
                  {t('找不到设备？显示附近全部蓝牙设备')}
                </button>
              </>
            ) : (
              <>
                <p className="mt-4 text-[14px] font-medium">{t('当前浏览器不支持蓝牙')}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-text-sub">
                  {t('请使用 Chrome / Edge 等支持 Web Bluetooth 的浏览器，并通过 HTTPS 访问')}
                </p>
              </>
            )}
          </div>
        )}
        <Link to="/machines" className="mx-auto mt-4 flex min-h-11 w-max items-center rounded-md border border-border px-4 text-sm font-medium">
          {t('浏览器械')}
        </Link>
      </div>
    </div>
  )
}
