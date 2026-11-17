import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminStore } from '@/store/admin'
import { stripBase } from './base'

export default function AuthGuard() {
  const token = useAdminStore((s) => s.token)
  const location = useLocation()
  if (!token) {
    const redirect = encodeURIComponent(stripBase(location.pathname) + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <Outlet />
}
