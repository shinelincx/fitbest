import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App'
import { DeviceProvider } from './context/DeviceContext'
import NativeRuntime from './platform/NativeRuntime'
import { initPwa } from './platform/pwa'

initPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceProvider>
      <HashRouter>
        <NativeRuntime />
        <App />
      </HashRouter>
    </DeviceProvider>
  </StrictMode>,
)
