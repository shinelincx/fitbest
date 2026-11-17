import type { Prisma } from '@prisma/client'

export type UserWithProfile = Prisma.UserGetPayload<{
  include: { identities: true; credential: true; goal: true }
}>

export function maskPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email
  const name = email.slice(0, at)
  return `${name.slice(0, 1)}***${email.slice(at)}`
}

export function maskWechat(identifier: string): string {
  const prefix = identifier.startsWith('devu_') || identifier.startsWith('dev_') ? 5 : 4
  return `${identifier.slice(0, prefix)}***${identifier.slice(-2)}`
}

export function buildProfile(user: UserWithProfile) {
  const phone = user.identities.find((item) => item.type === 'phone')?.identifier ?? null
  const email = user.identities.find((item) => item.type === 'email')?.identifier ?? null
  const wechat = user.identities.find((item) => item.type === 'wechat')?.identifier ?? null

  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    gender: user.gender,
    birthYear: user.birthYear,
    heightCm: user.heightCm ? Number(user.heightCm) : null,
    weightKg: user.weightKg ? Number(user.weightKg) : null,
    identities: {
      phone: phone ? maskPhone(phone) : null,
      email: email ? maskEmail(email) : null,
      wechat: wechat ? maskWechat(wechat) : null,
    },
    hasPassword: Boolean(user.credential),
    goals: {
      weeklySessions: user.goal?.weeklySessions ?? 0,
      weeklyMinutes: user.goal?.weeklyMinutes ?? 0,
    },
  }
}

export const PROFILE_INCLUDE = { identities: true, credential: true, goal: true } as const
