import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { DeviceProvider } from './context/DeviceContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeviceProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </DeviceProvider>
  </StrictMode>,
)
