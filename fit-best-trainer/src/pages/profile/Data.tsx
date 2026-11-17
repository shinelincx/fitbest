import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Trash2, Upload } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import {
  clearSessions, clearStrengthSessions, fetchSessions, getMachineSessionOwner, importSessions, importStrengthSessions,
  parseSessionBackup, readAllSessions, readAllStrengthSessions,
} from '../../api'
import { exportNativeBackup, pickNativeBackup } from '../../platform/files'
import { isNative } from '../../platform/runtime'
import { isCloudAccount, maskContact, maskEmail, maskPhone } from '../../utils/auth'
import { EQUIPMENT_LABELS } from '../../mock/strength'
import type { StrengthSession, StrengthSet } from '../../types'

function isStrengthSet(value: unknown): value is StrengthSet {
  if (!value || typeof value !== 'object') return false
  const set = value as Partial<StrengthSet>
  return [set.weight, set.reps, set.at].every((n) => typeof n === 'number' && Number.isFinite(n))
}

function parseStrengthBackup(value: unknown): StrengthSession[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('备份包含无效的力量训练记录')
  for (const entry of value) {
    const s = entry as Partial<StrengthSession> | null
    if (!s || s.kind !== 'strength' || typeof s.id !== 'string' || !s.id
      || typeof s.date !== 'string' || !Number.isFinite(Date.parse(s.date))
      || typeof s.exerciseId !== 'string' || typeof s.exerciseName !== 'string'
      || !s.equipment || !Object.hasOwn(EQUIPMENT_LABELS, s.equipment)
      || !Array.isArray(s.sets) || !s.sets.every(isStrengthSet)
      || (s.bestSet != null && !isStrengthSet(s.bestSet))
      || ![s.durationSec, s.volumeKg, s.totalReps, s.e1rm].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('备份包含无效的力量训练记录')
    }
  }
  return value
}

export default function Data() {
  const { t } = useTranslation()
  const { user, updateProfile } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [count, setCount] = useState(() => readAllSessions().length + readAllStrengthSessions().length)
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const cloud = isCloudAccount()

  useEffect(() => {
    let active = true
    const strengthCount = readAllStrengthSessions().length
    void fetchSessions().then((sessions) => {
      if (active) setCount(sessions.length + strengthCount)
    })
    return () => { active = false }
  }, [user?.id, cloud])

  async function handleExport() {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const sessions = parseSessionBackup(await fetchSessions({ requireCloud: true }))
      const strengthSessions = readAllStrengthSessions()
      const payload = {
        app: 'fit-best',
        version: 2,
        exportedAt: new Date().toISOString(),
        profile: user
          ? {
              nickname: user.nickname,
              phone: maskPhone(user.phone),
              email: maskEmail(user.email),
              gender: user.gender,
              birthYear: user.birthYear,
              heightCm: user.heightCm,
              weightKg: user.weightKg,
              goalSessions: user.goalSessions,
              goalMinutes: user.goalMinutes,
            }
          : null,
        sessions,
        strengthSessions,
      }
      const json = JSON.stringify(payload, null, 2)
      const filename = `fitbest-backup-${new Date().toISOString().slice(0, 10)}.json`
      if (isNative) {
        const exported = await exportNativeBackup(json, filename)
        if (!exported) return
      } else {
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }
      toast(t('备份已导出'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('导出失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  async function importBackup(text: string, owner: ReturnType<typeof getMachineSessionOwner>) {
    const parsed = JSON.parse(text) as
      | { sessions?: unknown; strengthSessions?: unknown; profile?: Record<string, unknown> | null }
      | unknown[]
    const list = Array.isArray(parsed) ? parsed : parsed?.sessions
    if (!Array.isArray(list)) throw new Error(t('文件格式不正确，缺少 sessions 数据'))
    const sessions = parseSessionBackup(list)
    const strength = !Array.isArray(parsed) ? parseStrengthBackup(parsed.strengthSessions) : undefined
    if (getMachineSessionOwner().userId !== owner.userId) throw new Error('登录账号已切换')
    const imported = importSessions(sessions, owner)
    if (strength) importStrengthSessions(strength, owner)
    let restoredProfile = false
    if (!Array.isArray(parsed) && parsed.profile && user && getMachineSessionOwner().userId === owner.userId) {
      const p = parsed.profile
      try {
        await updateProfile({
          nickname: typeof p.nickname === 'string' ? p.nickname : user.nickname,
          gender: p.gender === 'male' || p.gender === 'female' || p.gender === 'other' ? p.gender : undefined,
          birthYear: typeof p.birthYear === 'number' ? p.birthYear : undefined,
          heightCm: typeof p.heightCm === 'number' ? p.heightCm : undefined,
          weightKg: typeof p.weightKg === 'number' ? p.weightKg : undefined,
          goalSessions: typeof p.goalSessions === 'number' ? p.goalSessions : undefined,
          goalMinutes: typeof p.goalMinutes === 'number' ? p.goalMinutes : undefined,
        })
        restoredProfile = true
      } catch {
        setError(t('训练记录已导入，个人资料恢复失败'))
      }
    }
    const allSessions = await fetchSessions()
    if (getMachineSessionOwner().userId === owner.userId) setCount(allSessions.length + readAllStrengthSessions().length)
    setMessage(
      owner.cloud
        ? t('器械记录已加入同步队列，力量记录已保存在本机')
        : restoredProfile
        ? t('已导入 {{count}} 条训练记录，并恢复资料', { count: imported })
        : t('已导入 {{count}} 条训练记录', { count: imported }),
    )
    toast(t('数据导入成功'))
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setMessage('')
    setBusy(true)
    const owner = getMachineSessionOwner()
    try {
      await importBackup(await file.text(), owner)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('导入失败，请检查文件'))
    } finally {
      e.target.value = ''
      setBusy(false)
    }
  }

  async function handleNativeImport() {
    setError('')
    setMessage('')
    setBusy(true)
    const owner = getMachineSessionOwner()
    try {
      const text = await pickNativeBackup()
      if (text !== null) await importBackup(text, owner)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('导入失败，请检查文件'))
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    setError('')
    setMessage('')
    setBusy(true)
    const owner = getMachineSessionOwner()
    try {
      await clearSessions(owner)
      await clearStrengthSessions(owner.userId)
      if (getMachineSessionOwner().userId === owner.userId) setCount(0)
      setConfirmClear(false)
      toast(t('训练记录已清空'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('清空失败，请重试'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-5 pt-5">
      <PageHeader
        title={t('数据管理')}
        desc={
          isNative
            ? t('当前为本机游客数据')
            : user
              ? t('当前账号：{{contact}}', { contact: maskContact(user) })
              : t('当前为游客数据')
        }
      />

      <section className="mb-5 rounded-md border border-border bg-surface p-4">
        <p className="text-sm font-semibold">{t('训练数据')}</p>
        <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
          {count} <span className="font-body text-[13px] font-normal text-text-sub">{t('条训练记录')}</span>
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-text-sub">
          {cloud
            ? t('备份包含当前账号的云端器械记录、待同步记录和本机力量记录。导出和清空云端记录需要联网。')
            : t('备份包含本机器械记录和力量记录。清理应用数据或卸载应用前，请先导出备份。')}
        </p>
      </section>

      <div className="space-y-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface p-4"
        >
          <span className="flex items-center gap-2 text-sm">
            <Download size={15} className="text-primary" /> {t('导出备份（JSON）')}
          </span>
          <span className="text-[13px] text-text-sub">{isNative ? t('分享') : t('下载')}</span>
        </button>
        <button
          onClick={() => (isNative ? void handleNativeImport() : fileRef.current?.click())}
          disabled={busy}
          className="flex w-full items-center justify-between rounded-md border border-border bg-surface p-4"
        >
          <span className="flex items-center gap-2 text-sm">
            <Upload size={15} className="text-primary" /> {t('导入备份')}
          </span>
          <span className="text-[13px] text-text-sub">{cloud ? t('合并备份记录') : t('覆盖本机器械记录')}</span>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
      </div>

      {message && <p className="mt-3 text-[13px] text-text">{message}</p>}
      {error && <p className="mt-3 text-[13px] text-danger">{t(error)}</p>}

      <section className="mt-5 overflow-hidden rounded-md border border-border bg-surface">
        {!confirmClear ? (
          <button onClick={() => setConfirmClear(true)} disabled={busy} className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-danger">
            <Trash2 size={15} /> {t('清空训练记录')}
          </button>
        ) : (
          <div className="p-4">
            <p className="text-sm">
              {cloud
                ? t('确定清空当前账号的云端和本机器械记录，以及本机力量记录？如需保留，请先导出备份。')
                : t('确定清空本机的器械和力量记录？如需保留，请先导出备份。')}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setConfirmClear(false)} className="flex-1 rounded-md border border-border py-2.5 text-sm">
                {t('取消')}
              </button>
              <button onClick={handleClear} disabled={busy} className="flex-1 rounded-md bg-danger py-2.5 text-sm font-semibold text-bg">
                {t('确认清空')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
