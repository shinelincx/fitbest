import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Camera } from 'lucide-react'
import Avatar from '../../components/Avatar'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { type Account, type ProfilePatch } from '../../utils/auth'
import { fileToAvatar } from '../../utils/image'
import { isNative } from '../../platform/runtime'

const inputClass =
  'mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-text-sub/70 focus:border-text'

type FieldError = { message: string; field?: string }

function ProfileForm({ title, description, label, dirty, busy, error, onSubmit, children }: {
  title: string
  description: string
  label: string
  dirty: boolean
  busy: boolean
  error: FieldError | null
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!dirty) return
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  useEffect(() => {
    if (error?.field) form.current?.querySelector<HTMLElement>('#' + error.field)?.focus()
  }, [error])

  return (
    <div className="px-5 pt-5">
      <PageHeader title={title} desc={description} onBack={() => {
        if (!busy && (!dirty || window.confirm(t('放弃未保存的修改？')))) navigate('/profile', { replace: true })
      }} />
      <form ref={form} onSubmit={onSubmit} noValidate aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4 pb-4">
          {children}
        </fieldset>
        <div role="alert" id="profile-form-error" className="text-[13px] text-danger">{error?.message}</div>
        <footer className="sticky bottom-0 bg-bg pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="submit" disabled={busy || !dirty} className="w-full rounded-md bg-text py-3.5 text-sm font-semibold text-bg disabled:opacity-60">
            {busy ? t('保存中…') : label}
          </button>
        </footer>
      </form>
    </div>
  )
}

const genderOptions = [
  { value: '', label: '请选择性别' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '保密' },
] as const

const bodyFields = [
  { id: 'birthYear', label: '出生年份', min: 1900, max: 2100, integer: true, example: 1995 },
  { id: 'heightCm', label: '身高（cm）', min: 50, max: 250, integer: false, example: 175.5 },
  { id: 'weightKg', label: '体重（kg）', min: 20, max: 300, integer: false, example: 68.5 },
] as const

const goalFields = [
  { id: 'goalSessions', label: '训练次数', max: 100 },
  { id: 'goalMinutes', label: '训练时长（分钟）', max: 10000 },
] as const

function EditDetails({ user }: { user: Account }) {
  const { t, i18n } = useTranslation()
  const { updateProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatar, setAvatar] = useState(user.avatar ?? '')
  const [nickname, setNickname] = useState(user.nickname)
  const [gender, setGender] = useState<NonNullable<Account['gender']> | ''>(user.gender ?? '')
  const [body, setBody] = useState({
    birthYear: String(user.birthYear ?? ''),
    heightCm: String(user.heightCm ?? ''),
    weightKg: String(user.weightKg ?? ''),
  })
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<FieldError | null>(null)
  const touchInput = isNative || window.matchMedia('(any-pointer: coarse)').matches
  const dirty = nickname !== user.nickname || avatar !== (user.avatar ?? '') || gender !== (user.gender ?? '')
    || bodyFields.some(({ id }) => body[id] !== String(user[id] ?? ''))

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setReading(true)
    try {
      setAvatar(await fileToAvatar(file))
      setError(null)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : t('图片处理失败') })
    } finally {
      event.target.value = ''
      setReading(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || reading || !dirty) return
    const clear: NonNullable<ProfilePatch['clear']> = []
    const patch: ProfilePatch = { clear }
    const name = nickname.trim()
    if (name !== user.nickname) {
      if (!name || name.length > 20) return setError({ field: 'nickname', message: t('昵称长度为 1 至 20 位') })
      patch.nickname = name
    }
    if (avatar !== (user.avatar ?? '')) {
      if (avatar) patch.avatar = avatar
      else clear.push('avatar')
    }
    if (gender !== (user.gender ?? '')) {
      if (gender) patch.gender = gender
      else clear.push('gender')
    }
    for (const { id, label, min, max, integer } of bodyFields) {
      const raw = body[id].trim().normalize('NFKC').replace(',', '.')
      const input = event.currentTarget.elements.namedItem(id) as HTMLInputElement
      const badInput = input.validity.badInput
      if (!badInput && raw === String(user[id] ?? '')) continue
      if (!badInput && !raw) {
        clear.push(id)
        continue
      }
      const value = Number(raw)
      const exact = integer ? Number.isInteger(value) : Number(value.toFixed(1)) === value
      if (badInput || !/^\d+(?:\.\d+)?$/.test(raw) || value < min || value > max || !exact) {
        return setError({ field: id, message: t(integer ? '{{label}}需填写 {{min}}–{{max}} 范围内的整数'
          : '{{label}}需填写 {{min}}–{{max}} 范围内的数值，最多一位小数', { label: t(label), min, max }) })
      }
      patch[id] = value
    }
    setError(null)
    setBusy(true)
    try {
      await updateProfile(patch)
      toast(t('资料已保存'))
      navigate('/profile', { replace: true })
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : t('保存失败，请重试') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProfileForm title={t('编辑资料')} description={t('身体资料选填，用于完善个人档案。')} label={t('保存资料')}
      dirty={dirty} busy={busy || reading} error={error} onSubmit={save}>
      <div className="flex flex-col items-center gap-2">
        <Avatar user={{ ...user, avatar }} size={96} />
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] text-text-sub">
            <Camera size={14} /> {t('更换头像')}
          </button>
          {avatar && <button type="button" onClick={() => setAvatar('')} className="min-h-11 rounded-full border border-border px-3 text-[13px]">{t('移除头像')}</button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
      <label className="block">
        <span className="text-[13px] text-text-sub">{t('昵称')}</span>
        <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20}
          autoComplete="nickname" placeholder={t('如 {{example}}', { example: 'Alex' })}
          aria-invalid={error?.field === 'nickname'} aria-describedby={error?.field === 'nickname' ? 'profile-form-error' : undefined} className={inputClass} />
      </label>
      <label className="block">
        <span className="text-[13px] text-text-sub">{t('性别')}</span>
        <select value={gender} onChange={(event) => setGender(event.target.value as typeof gender)} className={inputClass}>
          {genderOptions.map(({ value, label }) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </label>
      {bodyFields.map(({ id, label, min, max, integer, example }) => (
        <label key={id} className="block">
          <span className="text-[13px] text-text-sub">{t(label)}</span>
          <input id={id} name={id} value={body[id]} onChange={(event) => setBody({ ...body, [id]: event.target.value })}
            type={touchInput ? 'text' : 'number'} inputMode={integer ? 'numeric' : 'decimal'}
            min={touchInput ? undefined : min} max={touchInput ? undefined : max}
            step={touchInput ? undefined : integer ? 1 : 0.1}
            autoComplete={id === 'birthYear' ? 'bday-year' : undefined}
            placeholder={t('如 {{example}}', { example: example.toLocaleString(i18n.language, { useGrouping: false }) })}
            className={inputClass}
            aria-invalid={error?.field === id} aria-describedby={error?.field === id ? 'profile-form-error' : undefined} />
        </label>
      ))}
    </ProfileForm>
  )
}

function EditGoals({ user }: { user: Account }) {
  const { t } = useTranslation()
  const { updateProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [draft, setDraft] = useState({
    goalSessions: String(user.goalSessions || ''),
    goalMinutes: String(user.goalMinutes || ''),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<FieldError | null>(null)
  const dirty = goalFields.some(({ id }) => draft[id] !== String(user[id] || ''))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !dirty) return
    const patch: ProfilePatch = {}
    for (const { id, label, max } of goalFields) {
      const value = Number(draft[id].trim())
      if (value === (user[id] ?? 0)) continue
      if (!Number.isInteger(value) || value < 0 || value > max) {
        return setError({ field: id, message: t('{{label}}需填写 0–{{max}} 范围内的整数', { label: t(label), max }) })
      }
      patch[id] = value
    }
    setError(null)
    setBusy(true)
    try {
      if (Object.keys(patch).length) await updateProfile(patch)
      toast(t('目标已保存'))
      navigate('/profile', { replace: true })
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : t('保存失败，请重试') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProfileForm title={t('每周训练目标')} description={t('留空或填 0 表示暂不设目标')} label={t('保存目标')}
      dirty={dirty} busy={busy} error={error} onSubmit={save}>
      {goalFields.map(({ id, label }) => (
        <label key={id} className="block">
          <span className="text-[13px] text-text-sub">{t(label)}</span>
          <input id={id} value={draft[id]} onChange={(event) => setDraft({ ...draft, [id]: event.target.value })}
            inputMode="numeric" className={inputClass}
            aria-invalid={error?.field === id} aria-describedby={error?.field === id ? 'profile-form-error' : undefined} />
        </label>
      ))}
    </ProfileForm>
  )
}

export default function EditProfile({ goals = false }: { goals?: boolean }) {
  const { user } = useAuth()
  if (!user) return null
  return goals ? <EditGoals user={user} key={user.id} /> : <EditDetails user={user} key={user.id} />
}
