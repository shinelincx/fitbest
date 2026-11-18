import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushMachineSessions } from '../api'
import { getAccessUserId, hasAccessFor, SESSION_TOKEN_EVENT } from '../api/client'
import {
  bindEmail as bindEmailApi,
  bindPhone as bindPhoneApi,
  bindWechat as bindWechatApi,
  changePassword as changePasswordApi,
  deleteAccount as deleteAccountApi,
  getLocalGuestAccount,
  getSessionUser,
  isCloudAccount,
  loginAccount,
  loginWithEmail as loginWithEmailApi,
  loginWithSms as loginWithSmsApi,
  loginWithWechat as loginWithWechatApi,
  loginWithWechatPhone as loginWithWechatPhoneApi,
  logoutAccount,
  recoverPassword as recoverPasswordApi,
  restoreSharedSession,
  registerAccount,
  setPassword as setPasswordApi,
  unbindEmail as unbindEmailApi,
  unbindWechat as unbindWechatApi,
  updateAccount as updateAccountApi,
  type Account,
  type ProfilePatch,
  type Verification,
} from '../utils/auth'
import { isNative } from '../platform/runtime'

interface AuthValue {
  user: Account | null
  sessionExpired: boolean
  authPending: boolean
  login: (phone: string, password: string) => Promise<void>
  register: (input: { phone: string; password: string; nickname: string }) => Promise<void>
  loginWithSms: (phone: string, code: string, existingOnly?: boolean) => Promise<void>
  loginWithEmail: (email: string, code: string, existingOnly?: boolean) => Promise<void>
  loginWithWechat: () => Promise<Account | null>
  loginWithWechatPhone: (phone: string, code: string) => Promise<void>
  bindEmail: (email: string, code: string) => Promise<void>
  bindPhone: (phone: string, code: string, verification?: Verification, replace?: boolean) => Promise<void>
  bindWechat: () => Promise<void>
  unbindEmail: (verification?: Verification) => Promise<void>
  unbindWechat: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: ProfilePatch) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  setPassword: (newPassword: string) => Promise<void>
  recoverPassword: (password: string, verification: Verification) => Promise<void>
  deleteAccount: (password?: string, verification?: Verification) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(() =>
    isNative ? getLocalGuestAccount() : getSessionUser(),
  )
  const [tokenChange, setTokenChange] = useState(0)
  const [authPending, setAuthPending] = useState(() => !isNative && Boolean(getAccessUserId()) && !getSessionUser())
  const sessionExpired = !isNative && user !== null && isCloudAccount() && !hasAccessFor(user.id)

  useEffect(() => {
    if (isNative) return
    let generation = 0
    const refresh = () => setTokenChange((value) => value + 1)
    async function restore() {
      const version = ++generation
      const local = getSessionUser()
      setUser(local)
      setAuthPending(!local && Boolean(getAccessUserId()))
      if (!local && getAccessUserId()) {
        try {
          const restored = await restoreSharedSession()
          if (version === generation) setUser(restored)
        } catch {
          // 恢复失败时停留在游客模式，可手动登录。
        } finally {
          if (version === generation) setAuthPending(false)
        }
      }
    }
    const crossTab = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || (event.key && !['fitbest:access', 'fitbest:session', 'fitbest:cloud-account'].includes(event.key))) return
      void restore()
      refresh()
    }
    window.addEventListener(SESSION_TOKEN_EVENT, refresh)
    window.addEventListener('storage', crossTab)
    void restore()
    return () => {
      generation++
      window.removeEventListener(SESSION_TOKEN_EVENT, refresh)
      window.removeEventListener('storage', crossTab)
    }
  }, [])

  useEffect(() => {
    if (user?.id && !sessionExpired) void flushMachineSessions()
  }, [user?.id, sessionExpired, tokenChange])

  async function login(phone: string, password: string) {
    setUser(await loginAccount(phone, password))
  }

  async function register(input: { phone: string; password: string; nickname: string }) {
    setUser(await registerAccount(input))
  }

  async function loginWithSms(phone: string, code: string, existingOnly?: boolean) {
    setUser(await loginWithSmsApi(phone, code, existingOnly))
  }

  async function loginWithEmail(email: string, code: string, existingOnly?: boolean) {
    setUser(await loginWithEmailApi(email, code, existingOnly))
  }

  async function loginWithWechat() {
    const account = await loginWithWechatApi()
    if (account) setUser(account)
    return account
  }

  async function loginWithWechatPhone(phone: string, code: string) {
    setUser(await loginWithWechatPhoneApi(phone, code))
  }

  async function bindEmail(email: string, code: string) {
    if (!user) throw new Error('请先登录')
    setUser(await bindEmailApi(user.id, email, code))
  }

  async function bindPhone(phone: string, code: string, verification?: Verification, replace?: boolean) {
    if (!user) throw new Error('请先登录')
    setUser(await bindPhoneApi(user.id, phone, code, verification, replace))
  }

  async function bindWechat() {
    if (!user) throw new Error('请先登录')
    setUser(await bindWechatApi(user.id))
  }

  async function unbindEmail(verification?: Verification) {
    if (!user) throw new Error('请先登录')
    setUser(await unbindEmailApi(user.id, verification))
  }

  async function unbindWechat() {
    if (!user) throw new Error('请先登录')
    setUser(await unbindWechatApi(user.id))
  }

  async function logout() {
    await logoutAccount()
    setUser(getSessionUser())
  }

  async function updateProfile(patch: ProfilePatch) {
    if (!user) throw new Error('请先登录')
    setUser(await updateAccountApi(user.id, patch))
  }

  async function changePassword(oldPassword: string, newPassword: string) {
    if (!user) throw new Error('请先登录')
    setUser(await changePasswordApi(user.id, oldPassword, newPassword))
  }

  async function setPassword(newPassword: string) {
    if (!user) throw new Error('请先登录')
    setUser(await setPasswordApi(user.id, newPassword))
  }

  async function deleteAccount(password?: string, verification?: Verification) {
    if (!user) throw new Error('请先登录')
    await deleteAccountApi(user.id, password, verification)
    setUser(null)
  }

  async function recoverPassword(password: string, verification: Verification) {
    if (!user) throw new Error('请先登录')
    await recoverPasswordApi(user.id, password, verification)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionExpired,
        authPending,
        login,
        register,
        loginWithSms,
        loginWithEmail,
        loginWithWechat,
        loginWithWechatPhone,
        bindEmail,
        bindPhone,
        bindWechat,
        unbindEmail,
        unbindWechat,
        logout,
        updateProfile,
        changePassword,
        setPassword,
        recoverPassword,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
