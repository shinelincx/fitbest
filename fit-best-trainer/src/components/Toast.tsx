import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string, duration?: number) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const timerRef = useRef<number | null>(null)

  const show = useCallback((text: string, duration = 2200) => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setMessage(text)
    timerRef.current = window.setTimeout(() => setMessage(''), duration)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" className="fixed bottom-28 left-1/2 z-[80] w-max max-w-[calc(100%-2rem)] -translate-x-1/2">
        {message && <div className="toast-pop rounded-full border border-border bg-text px-4 py-2 text-sm text-bg shadow-card">{message}</div>}
      </div>
    </ToastContext.Provider>
  )
}
