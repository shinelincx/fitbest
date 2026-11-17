import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { LogOut, Shield, Trash2 } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { maskContact, maskPhone, verifyPassword } from '../../utils/auth'

const inputCls =
  'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text'

export default function Security() {
  const { t } = useTranslation()
  const { user, changePassword, setPassword, logout, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [deleteError, setDeleteError] = useState('')

  if (!user) return <Navigate to="/login" replace />

  async function handleChangePassword() {
    if (pwSaving) return
    if (newPw.length < 6) return setPwError(t('新密码至少 6 位'))
    if (newPw !== confirmPw) return setPwError(t('两次输入的新密码不一致'))
    setPwSaving(true)
    setPwError('')
    try {
      if (user?.passwordHash) {
        await changePassword(oldPw, newPw)
        toast(t('密码已更新'))
      } else {
        await setPassword(newPw)
        toast(t('密码已设置'))
      }
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t('修改失败，请重试'))
    } finally {
      setPwSaving(false)
    }
  }

  async function handleDelete() {
    if (user?.passwordHash) {
      if (!deletePw) return setDeleteError(t('请输入密码确认身份'))
      setDeleteError('')
      try {
        if (!(await verifyPassword(user.id, deletePw))) return setDeleteError(t('密码不正确，无法注销'))
      } catch {
        return setDeleteError(t('密码不正确，无法注销'))
      }
    }
    try {
      await deleteAccount(deletePw || undefined)
    } catch (err) {
      return setDeleteError(err instanceof Error ? err.message : t('注销失败，请重试'))
    }
    toast(t('账号已注销'))
    navigate('/')
  }

  return (
    <div className="px-5 pt-5">
      <PageHeader title={t('账号与安全')} desc={maskContact(user)} />

      <section className="mb-5 rounded-md border border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield size={15} className="text-primary" /> {t('账号信息')}
        </p>
        <div className="mt-3 flex items-center justify-between text-[13px]">
          <span className="text-text-sub">{t('昵称')}</span>
          <span className="font-medium">{user.nickname}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="text-text-sub">{t('手机号')}</span>
          <span className="font-mono">{user.phone ? maskPhone(user.phone) : t('未绑定')}</span>
        </div>
        <Link
          to="/profile/identities"
          className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[13px]"
        >
          <span className="text-text-sub">{t('登录方式')}</span>
          <span className="font-medium">{t('手机号 · 邮箱 · 微信')}</span>
        </Link>
      </section>

      {user.phone && (
        <section className="mb-5 rounded-md border border-border bg-surface p-4">
          <p className="text-sm font-semibold">{user.passwordHash ? t('修改密码') : t('设置密码')}</p>
          <div className="mt-3 space-y-3">
            {user.passwordHash && (
              <label className="block">
                <span className="text-[13px] text-text-sub">{t('原密码')}</span>
                <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={inputCls} />
              </label>
            )}
            <label className="block">
              <span className="text-[13px] text-text-sub">{t('新密码')}</span>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[13px] text-text-sub">{t('确认新密码')}</span>
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
            </label>
            {pwError && <p className="text-[13px] text-danger">{t(pwError)}</p>}
            <button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="w-full rounded-md bg-text py-3.5 text-sm font-semibold text-bg disabled:opacity-60"
            >
              {user.passwordHash ? t('保存新密码') : t('设置密码')}
            </button>
          </div>
        </section>
      )}

      <section className="mb-5 overflow-hidden rounded-md border border-border bg-surface">
        {!confirmLogout ? (
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm"
          >
            <LogOut size={15} className="text-text-sub" /> {t('退出登录')}
          </button>
        ) : (
          <div className="px-4 py-3.5">
            <p className="text-sm">{t('退出后将回到游客记录，确定退出？')}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setConfirmLogout(false)} className="flex-1 rounded-md border border-border py-2.5 text-sm">
                {t('取消')}
              </button>
              <button
                onClick={async () => {
                  try {
                    await logout()
                  } catch {
                    // 忽略登出异常，本地清理已在内部完成
                  }
                  toast(t('已退出登录'))
                  navigate('/profile')
                }}
                className="flex-1 rounded-md bg-text py-2.5 text-sm font-semibold text-bg"
              >
                {t('确认退出')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-surface">
        {!deleteOpen ? (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-danger"
          >
            <Trash2 size={15} /> {t('注销账号')}
          </button>
        ) : (
          <div className="p-4">
            <p className="text-sm font-semibold text-danger">{t('注销后不可恢复')}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-sub">
              {t('该账号的训练记录将被删除，且无法恢复。建议先在')}
              <Link to="/profile/data" className="mx-0.5 underline">
                {t('数据管理')}
              </Link>
              {t('导出备份。')}
            </p>
            <label className="mt-3 block">
              <span className="text-[13px] text-text-sub">{user.passwordHash ? t('输入密码确认') : t('确认身份')}</span>
              {user.passwordHash ? (
                <input
                  type="password"
                  value={deletePw}
                  onChange={(e) => setDeletePw(e.target.value)}
                  className={inputCls}
                />
              ) : (
                <p className="mt-1 text-[13px] text-text-sub">{t('当前账号未设置密码，确认后直接注销。')}</p>
              )}
            </label>
            {deleteError && <p className="mt-2 text-[13px] text-danger">{t(deleteError)}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setDeleteOpen(false)} className="flex-1 rounded-md border border-border py-2.5 text-sm">
                {t('取消')}
              </button>
              <button onClick={handleDelete} className="flex-1 rounded-md bg-danger py-2.5 text-sm font-semibold text-bg">
                {t('确认注销')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
