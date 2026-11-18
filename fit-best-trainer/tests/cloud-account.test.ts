import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  bindEmail, bindPhone, changePassword, currentUserId, deleteAccount, getSessionUser,
  loginWithSms, sendEmailCode, sendSmsCode, setPassword, unbindEmail, updateAccount,
} from '../src/utils/auth'

vi.mock('../src/i18n', () => ({ default: { t: (text: string) => text } }))

const transport = vi.fn()
const profile = {
  id: 'account-a',
  nickname: '训练者',
  identities: { phone: '139****0001' },
  hasPassword: false,
  goals: { weeklySessions: 2, weeklyMinutes: 60 },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function loginResponse(id = profile.id) {
  return json({
    accessToken: `header.${btoa(JSON.stringify({ sub: id }))}.signature`,
    refreshToken: `refresh-${id}`,
    user: { ...profile, id },
  })
}

async function signIn(id = profile.id) {
  transport.mockResolvedValueOnce(loginResponse(id))
  return loginWithSms('13900000001', '135790')
}

function expectRequest(path: string, method: string, body?: object) {
  expect(transport).toHaveBeenLastCalledWith(expect.stringMatching(`/api/v1${path}$`),
    expect.objectContaining({ method, body: body ? JSON.stringify(body) : undefined }))
}

beforeEach(() => {
  const entries = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  })
  vi.stubGlobal('fetch', transport)
  transport.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

it('云端资料和目标用原始用户 ID 更新，保留训练归属', async () => {
  const user = await signIn()
  expect(user.id).toBe(profile.id)
  const edited = { ...profile, nickname: '新昵称' }
  transport.mockResolvedValueOnce(json(edited))
    .mockResolvedValueOnce(json({ ...edited, goals: { weeklySessions: 5, weeklyMinutes: 60 } }))
  const saved = await updateAccount(user.id, { nickname: edited.nickname, goalSessions: 5 })

  expect(transport.mock.calls.at(-2)?.[0]).toMatch(/\/me$/)
  expectRequest('/me/goals', 'PATCH', { weeklySessions: 5 })
  expect(saved).toMatchObject({ id: profile.id, nickname: edited.nickname, goalSessions: 5 })
  expect(getSessionUser()).toEqual(saved)
  expect(currentUserId()).toBe(profile.id)
  expect(localStorage.getItem('fitbest:users')).toBeNull()
})

it('清空显式选中的资料字段，留存其他资料和目标', async () => {
  const user = await signIn()
  transport.mockResolvedValueOnce(json({ ...profile, heightCm: null, weightKg: 72 }))
  const saved = await updateAccount(user.id, { clear: ['heightCm'] })
  expectRequest('/me', 'PATCH', { clear: ['heightCm'] })
  expect(saved).toMatchObject({ heightCm: undefined, weightKg: 72, goalSessions: 2, goalMinutes: 60 })
})

it('云端发码区分登录和绑定，账号可以绑定邮箱、手机号和解绑邮箱', async () => {
  transport.mockResolvedValueOnce(json({ sent: true }))
  await sendEmailCode('qa@example.test')
  expectRequest('/auth/email/send', 'POST', { email: 'qa@example.test', scene: 'login' })

  const user = await signIn()
  transport.mockResolvedValueOnce(json({ sent: true }))
  await sendEmailCode(' QA@EXAMPLE.TEST ', 'bind')
  expectRequest('/auth/email/send', 'POST', { email: 'qa@example.test', scene: 'bind' })
  const withEmail = { ...profile, identities: { email: 'q***@example.test' } }
  transport.mockResolvedValueOnce(json(withEmail))
  expect((await bindEmail(user.id, 'qa@example.test', '135790')).email).toBe('q***@example.test')
  expectRequest('/me/identities/email', 'POST', { email: 'qa@example.test', code: '135790' })
  transport.mockResolvedValueOnce(json({ sent: true }))
  await sendSmsCode('13900000002', 'bind')
  expectRequest('/auth/sms/send', 'POST', { phone: '13900000002', scene: 'bind' })
  transport.mockResolvedValueOnce(json({ ...profile, identities: { ...withEmail.identities, phone: '139****0002' } }))
  expect((await bindPhone(user.id, '13900000002', '135790')).phone).toBe('139****0002')
  expectRequest('/me/identities/phone', 'POST', { phone: '13900000002', code: '135790' })
  transport.mockResolvedValueOnce(json(profile))
  expect((await unbindEmail(user.id)).email).toBeUndefined()
  expectRequest('/me/identities/email', 'DELETE')
})

it('发码失败时保留服务端错误', async () => {
  transport.mockResolvedValueOnce(json({ message: '发送过于频繁' }, 400))
  await expect(sendEmailCode('qa@example.test')).rejects.toThrow('发送过于频繁')
})

it('设密更新账号状态，改密及注销以云端确认结果为准', async () => {
  const user = await signIn()
  transport.mockResolvedValueOnce(json({ ok: true }))
  await setPassword(user.id, 'new-password')
  expectRequest('/me/password', 'PUT', { password: 'new-password' })
  expect(getSessionUser()?.passwordHash).toBeTruthy()

  transport.mockResolvedValueOnce(json({ ok: true }))
  await changePassword(user.id, 'new-password', 'another-password')
  expectRequest('/me/password', 'PUT', { password: 'another-password', oldPassword: 'new-password' })
  transport.mockResolvedValueOnce(json({ message: '密码不正确' }, 400))
  await expect(deleteAccount(user.id, 'bad-password')).rejects.toThrow('密码不正确')
  expectRequest('/me', 'DELETE', { password: 'bad-password' })
  expect(getSessionUser()?.id).toBe(user.id)
  transport.mockResolvedValueOnce(json({ ok: false }))
  await expect(deleteAccount(user.id, 'another-password')).rejects.toThrow()
  expect(getSessionUser()?.id).toBe(user.id)
  transport.mockResolvedValueOnce(json({ ok: true }))
  await deleteAccount(user.id, 'another-password')
  expectRequest('/me', 'DELETE', { password: 'another-password' })
  for (const key of ['session', 'cloud-account', 'access', 'refresh']) {
    expect(localStorage.getItem(`fitbest:${key}`)).toBeNull()
  }
})

it('切换账号后丢弃旧请求的返回，旧操作无法清除新会话', async () => {
  const old = await signIn()
  let finish!: (response: Response) => void
  transport.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
  const pending = expect(updateAccount(old.id, { nickname: '修改旧账号' })).rejects.toThrow()
  expect(transport).toHaveBeenCalledTimes(2)
  const latest = await signIn('account-b')
  finish(json({ ...profile, nickname: '修改旧账号' }))
  await pending
  await expect(deleteAccount(old.id)).rejects.toThrow()
  expect(currentUserId()).toBe(latest.id)
  expect(transport).toHaveBeenCalledTimes(3)
})

it('当前本机账号仍可编辑资料并在本机注销', async () => {
  localStorage.setItem('fitbest:session', JSON.stringify('legacy'))
  localStorage.setItem('fitbest:users', JSON.stringify([{
    id: 'legacy', nickname: '本机训练者', phone: '', passwordHash: '',
  }]))
  expect((await updateAccount('legacy', { nickname: '新本机昵称' })).nickname).toBe('新本机昵称')
  await deleteAccount('legacy')
  expect(getSessionUser()).toBeNull()
  expect(transport).not.toHaveBeenCalled()
})
