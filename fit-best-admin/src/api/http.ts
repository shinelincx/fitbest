import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { useAdminStore } from '@/store/admin'
import { BASENAME, stripBase } from '@/router/base'
import { message } from 'antd'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/fit-best/api/v1'

export interface ApiClient extends Omit<AxiosInstance, 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'> {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
}

const instance = axios.create({
  baseURL,
  timeout: 15000,
}) as ApiClient

instance.interceptors.request.use((config) => {
  const token = useAdminStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (res: AxiosResponse) => res.data,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)
    const status = error.response?.status
    const data = error.response?.data as { message?: string; code?: number } | undefined

    if (status === 401 && error.config?.url !== '/admin/auth/login') {
      useAdminStore.getState().logout()
      const redirect = encodeURIComponent(stripBase(window.location.pathname))
      window.location.href = `${BASENAME}/login?redirect=${redirect}`
      return Promise.reject(error)
    }

    const msg = data?.message || error.message || '请求失败'
    if (!error.config?.url?.startsWith('/admin/feedback')) message.error(msg)
    return Promise.reject(error)
  },
)

export default instance
