import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushMachineSessions } from '../api'
import {
  bindEmail as bindEmailApi,
  bindPhone as bindPhoneApi,
  bindWechat as bindWechatApi,
  changePassword as changePasswordApi,
  deleteAccount as deleteAccountApi,
  getLocalGuestAccount,
  getSessionUser,
  loginAccount,
  loginWithEmail as loginWithEmailApi,
  loginWithSms as loginWithSmsApi,
  loginWithWechat as loginWithWechatApi,
  loginWithWechatPhone as loginWithWechatPhoneApi,
  logoutAccount,
  registerAccount,
  setPassword as setPasswordApi,
  unbindEmail as unbindEmailApi,
  unbindWechat as unbindWechatApi,
  updateAccount as updateAccountApi,
  type Account,
  type ProfilePatch,
} from '../utils/auth'
import { isNative } from '../platform/runtime'

interface AuthValue {
  user: Account | null
  login: (phone: string, password: string) => Promise<void>
  register: (input: { phone: string; password: string; nickname: string }) => Promise<void>
  loginWithSms: (phone: string, code: string) => Promise<void>
  loginWithEmail: (email: string, code: string) => Promise<void>
  loginWithWechat: () => Promise<Account | null>
  loginWithWechatPhone: (phone: string, code: string) => Promise<void>
  bindEmail: (email: string, code: string) => Promise<void>
  bindPhone: (phone: string, code: string) => Promise<void>
  bindWechat: () => Promise<void>
  unbindEmail: () => Promise<void>
  unbindWechat: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: ProfilePatch) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  setPassword: (newPassword: string) => Promise<void>
  deleteAccount: (password?: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(() =>
    isNative ? getLocalGuestAccount() : getSessionUser(),
  )
  useEffect(() => {
    if (user?.id) void flushMachineSessions()
  }, [user?.id])

  async function login(phone: string, password: string) {
    setUser(await loginAccount(phone, password))
  }

  async function register(input: { phone: string; password: string; nickname: string }) {
    setUser(await registerAccount(input))
  }

  async function loginWithSms(phone: string, code: string) {
    setUser(await loginWithSmsApi(phone, code))
  }

  async function loginWithEmail(email: string, code: string) {
    setUser(await loginWithEmailApi(email, code))
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

  async function bindPhone(phone: string, code: string) {
    if (!user) throw new Error('请先登录')
    setUser(await bindPhoneApi(user.id, phone, code))
  }

  async function bindWechat() {
    if (!user) throw new Error('请先登录')
    setUser(await bindWechatApi(user.id))
  }

  async function unbindEmail() {
    if (!user) throw new Error('请先登录')
    setUser(await unbindEmailApi(user.id))
  }

  async function unbindWechat() {
    if (!user) throw new Error('请先登录')
    setUser(await unbindWechatApi(user.id))
  }

  async function logout() {
    await logoutAccount()
    setUser(null)
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

  async function deleteAccount(password?: string) {
    if (!user) throw new Error('请先登录')
    await deleteAccountApi(user.id, password)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
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
