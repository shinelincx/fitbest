import { create } from 'zustand'
import type { AdminInfo } from '@/api/admin'
import { adminApi } from '@/api/admin'

interface AdminState {
  token: string | null
  admin: AdminInfo | null
  setAuth: (token: string, admin: AdminInfo) => void
  fetchMe: () => Promise<void>
  logout: () => void
}

const TOKEN_KEY = 'fitbest_admin_token'
const ADMIN_KEY = 'fitbest_admin_info'

function readStorage() {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      admin: JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null') as AdminInfo | null,
    }
  } catch {
    return { token: null, admin: null }
  }
}

export const useAdminStore = create<AdminState>((set, get) => ({
  ...readStorage(),
  setAuth: (token, admin) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
    set({ token, admin })
  },
  fetchMe: async () => {
    try {
      const admin = await adminApi.me()
      localStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
      set({ admin })
    } catch {
      get().logout()
    }
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ADMIN_KEY)
    set({ token: null, admin: null })
  },
}))
