import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { loginReturn } from './utils/loginReturn'
import Home from './pages/Home'
import Machines from './pages/Machines'
import MachineTrain from './pages/MachineTrain'
import Records from './pages/Records'
import Profile from './pages/Profile'
import EditProfile from './pages/profile/EditProfile'
import Security from './pages/profile/Security'
import Notifications from './pages/profile/Notifications'
import Settings, { LanguageSettings, TrainingPreferences } from './pages/profile/Settings'
import Install from './pages/profile/Install'
import Identities from './pages/profile/Identities'
import Data from './pages/profile/Data'
import About from './pages/profile/About'
import AuthPage from './pages/Auth'
import SharePage from './pages/SharePage'
import Strength from './pages/Strength'
import PinTrain from './pages/PinTrain'
import Pins from './pages/Pins'
import Discover from './pages/Discover'
import { isNative } from './platform/runtime'

function AccountPage({ children }: { children: ReactNode }) {
  const { user, authPending } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  if (authPending) return <p role="status" className="px-5 py-6 text-sm text-text-sub">{t('正在恢复登录…')}</p>
  if (!user) return <Navigate to="/login" replace state={{ returnTo: loginReturn(pathname) }} />
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/train/:type" element={<MachineTrain />} />
            <Route path="/strength" element={<Strength />} />
            <Route path="/pin/:machineId" element={<PinTrain />} />
            <Route path="/pin" element={<PinTrain />} />
            <Route path="/pins" element={<Pins />} />
            <Route path="/records" element={<Records />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<AccountPage><EditProfile /></AccountPage>} />
            <Route path="/profile/goals" element={<AccountPage><EditProfile goals /></AccountPage>} />
            <Route
              path="/profile/security"
              element={isNative ? <Navigate to="/profile/settings" replace /> : <AccountPage><Security /></AccountPage>}
            />
            <Route path="/profile/settings" element={<Settings />} />
            <Route path="/profile/settings/training" element={<TrainingPreferences />} />
            <Route path="/profile/settings/language" element={<LanguageSettings />} />
            <Route path="/profile/install" element={isNative ? <Navigate to="/profile/settings" replace /> : <Install />} />
            <Route
              path="/profile/identities"
              element={isNative ? <Navigate to="/profile/settings" replace /> : <AccountPage><Identities /></AccountPage>}
            />
            <Route path="/profile/notifications" element={<Notifications />} />
            <Route path="/profile/data" element={<Data />} />
            <Route path="/profile/about" element={<About />} />
            <Route path="/login" element={isNative ? <Navigate to="/profile" replace /> : <AuthPage mode="login" />} />
            <Route path="/register" element={isNative ? <Navigate to="/profile" replace /> : <AuthPage mode="register" />} />
            <Route path="/s/:id" element={<SharePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}
