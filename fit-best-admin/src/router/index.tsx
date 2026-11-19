import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from './AuthGuard'
import { BASENAME } from './base'
import AdminLayout from '@/layouts/AdminLayout'
import { Result } from 'antd'
import { useAdminStore } from '@/store/admin'
import type { AdminInfo } from '@/api/admin'
import { canAccessWebsite, canManageAccounts, isPlatform } from '@/utils/adminPermissions'

const Login = lazy(() => import('@/pages/login'))
const Dashboard = lazy(() => import('@/pages/dashboard'))
const Users = lazy(() => import('@/pages/users'))
const UserDetail = lazy(() => import('@/pages/users/Detail'))
const Sessions = lazy(() => import('@/pages/sessions'))
const TrainingRecords = lazy(() => import('@/pages/training-records'))
const DeviceSessions = lazy(() => import('@/pages/device-sessions'))
const Machines = lazy(() => import('@/pages/machines'))
const MachineModels = lazy(() => import('@/pages/machines/Models'))
const Gyms = lazy(() => import('@/pages/gyms'))
const Events = lazy(() => import('@/pages/events'))
const Feedback = lazy(() => import('@/pages/feedback'))
const Audit = lazy(() => import('@/pages/audit'))
const Accounts = lazy(() => import('@/pages/system/Accounts'))
const Organizations = lazy(() => import('@/pages/system/Organizations'))
const Roles = lazy(() => import('@/pages/system/Roles'))
const Catalog = lazy(() => import('@/pages/system/Catalog'))
const Password = lazy(() => import('@/pages/system/Password'))
const Website = lazy(() => import('@/pages/system/Website'))

function PageLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: '#8c8c8c' }}>
      加载中…
    </div>
  )
}

const withSuspense = (el: React.ReactNode) => (
  <Suspense fallback={<PageLoading />}>{el}</Suspense>
)

function Restricted({ allowed, children }: {
  allowed: (admin: AdminInfo | null) => boolean
  children: React.ReactNode
}) {
  const admin = useAdminStore((s) => s.admin)
  if (!admin) return <PageLoading />
  return allowed(admin) ? withSuspense(children) : <Result status="403" title="无权访问此页面" />
}

export const router = createBrowserRouter(
  [
  {
    path: '/login',
    element: withSuspense(<Login />),
  },
  { path: '/setup', element: withSuspense(<Password setup />) },
  {
    element: <AuthGuard />,
    children: [
      {
        path: '/',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: withSuspense(<Dashboard />) },
          { path: 'users', element: withSuspense(<Users />) },
          { path: 'users/:id', element: withSuspense(<UserDetail />) },
          { path: 'sessions', element: withSuspense(<Sessions />) },
          { path: 'training-records', element: withSuspense(<TrainingRecords />) },
          { path: 'device-sessions', element: withSuspense(<DeviceSessions />) },
          { path: 'machines', element: withSuspense(<Machines />) },
          { path: 'machine-models', element: withSuspense(<MachineModels />) },
          { path: 'gyms', element: withSuspense(<Gyms />) },
          { path: 'events', element: withSuspense(<Events />) },
          { path: 'feedback', element: withSuspense(<Feedback />) },
          { path: 'audit', element: withSuspense(<Audit />) },
          { path: 'my-password', element: withSuspense(<Password />) },
          { path: 'system/accounts', element: <Restricted allowed={canManageAccounts}><Accounts /></Restricted> },
          { path: 'system/organizations', element: <Restricted allowed={canManageAccounts}><Organizations /></Restricted> },
          { path: 'system/roles', element: <Restricted allowed={canManageAccounts}><Roles /></Restricted> },
          { path: 'system/catalog', element: <Restricted allowed={isPlatform}><Catalog /></Restricted> },
          { path: 'system/website', element: <Restricted allowed={canAccessWebsite}><Website /></Restricted> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
  ],
  { basename: BASENAME },
)
