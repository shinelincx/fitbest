import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Bluetooth, CalendarDays, Share2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { decodeShare, renderShareImage, renderStrengthImage, renderWeeklyImage } from '../utils/share'

export default function SharePage() {
  const { t } = useTranslation()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const data = useMemo(
    () => decodeShare(new URLSearchParams(location.search).get('d')),
    [location.search],
  )
  const [preview, setPreview] = useState('')
  const weekly = data?.v === 2
  const strength = data?.v === 3

  useEffect(() => {
    if (!data) return
    let active = true
    let renderP: Promise<Blob>
    if (weekly) renderP = renderWeeklyImage(data)
    else if (strength) renderP = renderStrengthImage(data as import('../utils/share').StrengthShareData)
    else renderP = renderShareImage(data as import('../utils/share').ShareData)
    renderP
      .then((blob) => {
        if (active) setPreview(URL.createObjectURL(blob))
      })
      .catch(() => toast(t('成绩卡加载失败')))
    return () => {
      active = false
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
    }
  }, [data, t, toast, weekly, strength])

  if (!data) {
    return (
      <div className="px-5 pt-8 text-center">
        <p className="text-[17px] font-semibold">{t('分享内容已失效')}</p>
        <p className="mt-2 text-[15px] text-text-sub">{t('链接不完整或数据已损坏')}</p>
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-text px-5 py-3 text-[16px] font-semibold text-bg"
        >
          {t('打开 FITBEST')} <ArrowRight size={16} />
        </Link>
      </div>
    )
  }

  return (
    <div className="px-5 pt-5 pb-8">
      <header className="reveal reveal-1">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 bg-primary" />
          <p className="font-display text-[22px] font-bold">FITBEST</p>
        </div>
        <p className="mt-1 text-[15px] text-text-sub">{t('一起，为了活力')}</p>
      </header>

      <div className="reveal reveal-2 mt-4 overflow-hidden rounded-lg border border-border bg-surface">
        {preview ? (
          <img
            src={preview}
            alt={weekly ? t('FITBEST 训练周报') : t('FITBEST 训练成绩卡')}
            className="block w-full"
          />
        ) : (
          <div
            className={`flex ${weekly ? 'aspect-[4/5]' : 'aspect-[3/4]'} items-center justify-center text-[15px] text-text-sub`}
          >
            {t('正在加载{{type}}…', { type: weekly ? t('周报') : t('成绩卡') })}
          </div>
        )}
      </div>

      <div className="reveal reveal-3 mt-4 flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
        <span className="flex items-center gap-2 text-[15px] text-text-sub">
          {weekly ? (
            <CalendarDays size={16} className="text-text-sub" />
          ) : strength ? (
            <span className="text-[16px]">💪</span>
          ) : (
            <Bluetooth size={16} className="text-connected" />
          )}
          {weekly
            ? t(data.range)
            : strength
              ? t((data as import('../utils/share').StrengthShareData).exercise)
              : t((data as import('../utils/share').ShareData).machine)}
        </span>
        <span className="flex items-center gap-1.5 text-[14px] text-text-sub">
          <Share2 size={14} /> {weekly ? t('本周战报') : t('来自训练者分享')}
        </span>
      </div>

      <Link
        to={user ? '/machines' : '/register'}
        className="reveal reveal-4 mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-text py-3.5 text-[17px] font-bold text-bg transition-transform active:scale-[0.98]"
      >
        {user ? t('去开始一组训练') : t('我也要练')} <ArrowRight size={18} />
      </Link>
      <Link
        to="/"
        className="mt-2 block w-full rounded-md border border-border bg-surface py-3 text-center text-[16px] font-medium"
      >
        {t('查看 FITBEST')}
      </Link>
      <p className="mt-3 text-center text-[13px] text-text-sub">{t('成绩来自分享者的训练记录，仅用于展示')}</p>
    </div>
  )
}
