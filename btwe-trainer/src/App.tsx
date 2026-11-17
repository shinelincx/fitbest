import { Routes, Route, Navigate } from 'react-router-dom'
import { useSyncExternalStore } from 'react'
import { currentUserId, subscribeToAccount } from './api/client'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { BandProvider } from './context/BandContext'
import Home from './pages/Home'
import Plans from './pages/Plans'
import Train from './pages/Train'
import Records from './pages/Records'
import Profile from './pages/Profile'
import AiCoach from './pages/AiCoach'
import PlanCoach from './pages/PlanCoach'
import Settings from './pages/Settings'
import Help from './pages/Help'
import Login from './pages/Login'

export default function App() {
  const userId = useSyncExternalStore(subscribeToAccount, currentUserId)
  return (
    <ToastProvider>
      <BandProvider key={userId ?? 'guest'} userId={userId}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/train" element={<Train userId={userId} />} />
            <Route path="/records" element={<Records />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/ai-coach" element={<AiCoach />} />
            <Route path="/plan-coach" element={<PlanCoach />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BandProvider>
    </ToastProvider>
  )
}
