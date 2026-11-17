import { useTranslation } from 'react-i18next'

export default function Toggle({
  on,
  onChange,
  label,
  desc,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  desc: string
}) {
  const { t } = useTranslation()
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between rounded-md border border-border bg-surface p-4 text-left"
    >
      <div>
        <p className="text-sm font-medium">{t(label)}</p>
        <p className="mt-0.5 text-[14px] text-text-sub">{t(desc)}</p>
      </div>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-text' : 'bg-surface-2'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform ${
            on ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
