import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PageHeader({ title, desc, onBack }: { title: string; desc?: string; onBack?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <header className="mb-5 flex items-center gap-3">
      <button
        type="button"
        aria-label={t('返回')}
        onClick={onBack ?? (() => navigate(-1))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text"
      >
        <ArrowLeft size={17} />
      </button>
      <div className="min-w-0">
        <h1 className="font-display text-xl font-bold leading-tight">{t(title)}</h1>
        {desc && <p className="mt-0.5 text-[13px] text-text-sub">{t(desc)}</p>}
      </div>
    </header>
  )
}
