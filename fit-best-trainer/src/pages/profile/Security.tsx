import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Shield, Trash2 } from 'lucide-react'
import ContactVerification from '../../components/ContactVerification'
import PageHeader from '../../components/PageHeader'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { isCloudAccount, maskContact, maskPhone, type Verification } from '../../utils/auth'

const inputCls =
  'mt-1.5 w-full rounded-md border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-text'

export default function Security() {
  const { t } = useTranslation()
  const { user, changePassword, setPassword, recoverPassword, logout, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [passwordVerification, setPasswordVerification] = useState<Verification>()
  const [recovering, setRecovering] = useState(location.state?.recovery === true)

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePw, setDeletePw] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteVerification, setDeleteVerification] = useState<Verification>()

  if (!user) return null
  const cloud = isCloudAccount()
  const useVerification = cloud && (!user.passwordHash || recovering)

  async function handleChangePassword() {
    if (pwSaving) return
    if (newPw.length < 6) return setPwError(t('新密码至少 6 位'))
    if (newPw !== confirmPw) return setPwError(t('两次输入的新密码不一致'))
    if (useVerification && passwordVerification?.code.length !== 6) {
      return setPwError(t('请先验证已有登录方式'))
    }
    setPwSaving(true)
    setPwError('')
    try {
      if (cloud && recovering && user?.passwordHash && passwordVerification) {
        await recoverPassword(newPw, passwordVerification)
        toast(t('密码已重设，请重新登录'))
        navigate('/login', { replace: true, state: { returnTo: '/profile/security' } })
      } else if (user?.passwordHash) {
        await changePassword(oldPw, newPw)
        toast(t('密码已更新'))
      } else {
        await setPassword(newPw, passwordVerification)
        toast(t('密码已设置'))
      }
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
      setPasswordVerification(undefined)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : t('修改失败，请重试'))
    } finally {
      setPwSaving(false)
    }
  }

  async function handleDelete() {
    if (deleteSaving) return
    if (user?.passwordHash && !deletePw) return setDeleteError(t('请输入密码确认身份'))
    if (cloud && !user?.passwordHash && deleteVerification?.code.length !== 6) {
      return setDeleteError(t('请先验证已有登录方式'))
    }
    setDeleteError('')
    setDeleteSaving(true)
    try {
      await deleteAccount(deletePw || undefined, deleteVerification)
    } catch (err) {
      setDeleteSaving(false)
      return setDeleteError(err instanceof Error ? err.message : t('注销失败，请重试'))
    }
    toast(t('账号已注销'))
    navigate('/', { replace: true })
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

      {user.phone && !deleteOpen && (
        <section className="mb-5 rounded-md border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">{user.passwordHash ? t(recovering ? '重设密码' : '修改密码') : t('设置密码')}</h2>
          <div className="mt-3 space-y-3">
            {user.passwordHash && !recovering && (
              <label className="block">
                <span className="text-[13px] text-text-sub">{t('原密码')}</span>
                <input type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={inputCls} />
              </label>
            )}
            <label className="block">
              <span className="text-[13px] text-text-sub">{t('新密码')}</span>
              <input type="password" autoComplete="new-password" maxLength={32} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-[13px] text-text-sub">{t('确认新密码')}</span>
              <input type="password" autoComplete="new-password" maxLength={32} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
            </label>
            {useVerification && (
              <ContactVerification key={String(recovering)} user={user} value={passwordVerification} onChange={setPasswordVerification} disabled={pwSaving} />
            )}
            {pwError && <p role="alert" className="text-[13px] text-danger">{t(pwError)}</p>}
            <button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="w-full rounded-md bg-text py-3.5 text-sm font-semibold text-bg disabled:opacity-60"
            >
              {user.passwordHash ? t(recovering ? '确认重设密码' : '保存新密码') : t('设置密码')}
            </button>
            {cloud && user.passwordHash && <button type="button" disabled={pwSaving} className="min-h-9 text-[13px] underline"
              onClick={() => { setRecovering((value) => !value); setOldPw(''); setPasswordVerification(undefined); setPwError('') }}>
              {t(recovering ? '返回修改密码' : '忘记原密码')}
            </button>}
          </div>
        </section>
      )}
      {recovering && !user.phone && <p className="mb-4 text-sm text-text-sub">
        {t('手机号密码登录需要绑定手机号。')}{' '}
        <Link to="/profile/identities" className="underline">{t('查看登录方式')}</Link>
      </p>}

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

      <section className="overflow-hidden rounded-md border border-danger/30 bg-surface">
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
              {t('注销后该账号停止使用，所有设备的登录凭证失效。云端训练记录保留，注销的账号无法再访问。建议先在')}
              <Link to="/profile/data" className="mx-0.5 underline">
                {t('数据管理')}
              </Link>
              {t('导出备份。')}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-text-sub">
              {t('本机训练记录和已导出的备份仍保存在原设备，已发出的分享可能仍可查看。')}
            </p>
            {user.passwordHash ? (
              <label className="mt-3 block">
                <span className="text-[13px] text-text-sub">{t('输入密码确认')}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePw}
                  onChange={(e) => setDeletePw(e.target.value)}
                  className={inputCls}
                />
              </label>
            ) : cloud && (
              <ContactVerification user={user} value={deleteVerification} onChange={setDeleteVerification} disabled={deleteSaving} />
            )}
            {deleteError && <p role="alert" className="mt-2 text-[13px] text-danger">{t(deleteError)}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => {
                setDeleteOpen(false)
                setDeletePw('')
                setDeleteVerification(undefined)
                setDeleteError('')
              }} disabled={deleteSaving} className="flex-1 rounded-md border border-border py-2.5 text-sm disabled:opacity-60">
                {t('取消')}
              </button>
              <button onClick={handleDelete} disabled={deleteSaving} className="flex-1 rounded-md bg-danger py-2.5 text-sm font-semibold text-bg disabled:opacity-60">
                {t('确认注销')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
