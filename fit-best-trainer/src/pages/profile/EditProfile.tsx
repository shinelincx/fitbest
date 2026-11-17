import { useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Navigate } from 'react-router-dom'
import { Camera } from 'lucide-react'
import Avatar from '../../components/Avatar'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { fileToAvatar } from '../../utils/image'

const inputCls =
  'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text'

const GENDERS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '保密' },
] as const

export default function EditProfile() {
  const { t } = useTranslation()
  const { user, updateProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [gender, setGender] = useState<string>(user?.gender ?? '')
  const [birthYear, setBirthYear] = useState(user?.birthYear ? String(user.birthYear) : '')
  const [heightCm, setHeightCm] = useState(user?.heightCm ? String(user.heightCm) : '')
  const [weightKg, setWeightKg] = useState(user?.weightKg ? String(user.weightKg) : '')
  const [goalSessions, setGoalSessions] = useState(user?.goalSessions ? String(user.goalSessions) : '')
  const [goalMinutes, setGoalMinutes] = useState(user?.goalMinutes ? String(user.goalMinutes) : '')
  const [error, setError] = useState('')

  if (!user) return <Navigate to="/login" replace />

  const toNumber = (v: string) => (v.trim() === '' ? undefined : Number(v))

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setAvatar(await fileToAvatar(file))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('图片处理失败'))
    } finally {
      e.target.value = ''
    }
  }

  async function handleSave() {
    const name = nickname.trim()
    if (!name) return setError(t('请填写昵称'))
    if (name.length > 12) return setError(t('昵称最多 12 个字'))
    const year = toNumber(birthYear)
    const currentYear = new Date().getFullYear()
    if (year !== undefined && (year < 1900 || year > currentYear)) return setError(t('请填写正确的出生年份'))
    const height = toNumber(heightCm)
    if (height !== undefined && (height < 100 || height > 250)) return setError(t('身高需在 100–250 cm'))
    const weight = toNumber(weightKg)
    if (weight !== undefined && (weight < 30 || weight > 250)) return setError(t('体重需在 30–250 kg'))
    const sessions = toNumber(goalSessions)
    if (sessions !== undefined && (sessions < 0 || sessions > 21)) return setError(t('周次数需在 0–21'))
    const minutes = toNumber(goalMinutes)
    if (minutes !== undefined && (minutes < 0 || minutes > 900)) return setError(t('周时长需在 0–900 分钟'))

    try {
      await updateProfile({
        nickname: name,
        avatar: avatar || undefined,
        gender: (gender || undefined) as 'male' | 'female' | 'other' | undefined,
        birthYear: year,
        heightCm: height,
        weightKg: weight,
        goalSessions: sessions,
        goalMinutes: minutes,
      })
    } catch (err) {
      return setError(err instanceof Error ? err.message : t('保存失败，请重试'))
    }
    toast(t('资料已保存'))
    navigate('/profile', { replace: true })
  }

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('编辑资料')} desc={t('完善头像与身体资料')} />

      <div className="mb-5 flex flex-col items-center">
        <Avatar user={{ ...user, avatar }} size={96} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-3 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-text-sub"
        >
          <Camera size={14} /> {t('更换头像')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-[13px] text-text-sub">{t('昵称')}</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} className={inputCls} />
        </label>

        <div>
          <span className="text-[13px] text-text-sub">{t('性别')}</span>
          <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1">
            {GENDERS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGender(g.value)}
                className={`rounded-sm py-2 text-sm ${gender === g.value ? 'bg-text font-semibold text-bg' : 'text-text-sub'}`}
              >
                {t(g.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] text-text-sub">{t('出生年份')}</span>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              inputMode="numeric"
              placeholder={t('如 1995')}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-text-sub">{t('身高（cm）')}</span>
            <input
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              inputMode="numeric"
              placeholder={t('如 175')}
              className={inputCls}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[13px] text-text-sub">{t('体重（kg）')}</span>
          <input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            inputMode="numeric"
            placeholder={t('如 70')}
            className={inputCls}
          />
        </label>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">{t('每周目标')}</h2>
        <p className="mt-1 text-[13px] text-text-sub">{t('留空或填 0 表示暂不设目标')}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] text-text-sub">{t('训练次数')}</span>
            <input
              value={goalSessions}
              onChange={(e) => setGoalSessions(e.target.value)}
              inputMode="numeric"
              placeholder={t('如 3')}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[13px] text-text-sub">{t('训练时长（分钟）')}</span>
            <input
              value={goalMinutes}
              onChange={(e) => setGoalMinutes(e.target.value)}
              inputMode="numeric"
              placeholder={t('如 150')}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      {error && <p className="mt-4 text-[13px] text-danger">{t(error)}</p>}

      <button
        onClick={handleSave}
        className="mt-6 w-full rounded-md bg-text py-3.5 text-sm font-semibold text-bg active:scale-[0.99]"
      >
        {t('保存资料')}
      </button>
    </div>
  )
}
