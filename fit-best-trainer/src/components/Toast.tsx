import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
      {typeof document !== 'undefined' && createPortal(
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-28 z-[80] flex justify-center px-4">
          {message && <div className="toast-pop max-w-full break-words rounded-xl border border-border bg-text px-4 py-2 text-center text-sm text-bg shadow-card">{message}</div>}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
