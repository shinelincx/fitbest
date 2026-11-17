import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from './AuthGuard'
import { BASENAME } from './base'
import AdminLayout from '@/layouts/AdminLayout'

const Login = lazy(() => import('@/pages/login'))
const Dashboard = lazy(() => import('@/pages/dashboard'))
const Users = lazy(() => import('@/pages/users'))
const UserDetail = lazy(() => import('@/pages/users/Detail'))
const Sessions = lazy(() => import('@/pages/sessions'))
const TrainingRecords = lazy(() => import('@/pages/training-records'))
const DeviceSessions = lazy(() => import('@/pages/device-sessions'))
const Machines = lazy(() => import('@/pages/machines'))
const Gyms = lazy(() => import('@/pages/gyms'))
const Events = lazy(() => import('@/pages/events'))
const Audit = lazy(() => import('@/pages/audit'))

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

export const router = createBrowserRouter(
  [
  {
    path: '/login',
    element: withSuspense(<Login />),
  },
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
          { path: 'gyms', element: withSuspense(<Gyms />) },
          { path: 'events', element: withSuspense(<Events />) },
          { path: 'audit', element: withSuspense(<Audit />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
  ],
  { basename: BASENAME },
)
