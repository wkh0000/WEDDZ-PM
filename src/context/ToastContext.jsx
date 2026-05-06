import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((tid) => {
    setToasts(t => t.filter(x => x.id !== tid))
  }, [])

  const show = useCallback((toast) => {
    const tid = ++idRef.current
    const item = { id: tid, type: 'info', duration: 4000, ...toast }
    setToasts(t => [...t, item])
    if (item.duration > 0) {
      setTimeout(() => dismiss(tid), item.duration)
    }
    return tid
  }, [dismiss])

  const success = useCallback((message, opts) => show({ type: 'success', message, ...opts }), [show])
  const error   = useCallback((message, opts) => show({ type: 'error',   message, ...opts }), [show])
  const info    = useCallback((message, opts) => show({ type: 'info',    message, ...opts }), [show])
  const warning = useCallback((message, opts) => show({ type: 'warning', message, ...opts }), [show])

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-auto"
          >
            <ToastItem toast={t} onDismiss={() => onDismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const iconFor = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Info
}

const toneFor = {
  success: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300',
  error:   'border-rose-500/30 bg-rose-500/[0.08] text-rose-300',
  warning: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-300',
  info:    'border-indigo-500/30 bg-indigo-500/[0.08] text-indigo-300'
}

function ToastItem({ toast, onDismiss }) {
  const Icon = iconFor[toast.type] || Info
  return (
    <div className={cn(
      'glass-strong border rounded-xl px-4 py-3 pr-10 shadow-glow flex items-start gap-3 relative',
      toneFor[toast.type] || toneFor.info
    )}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-sm text-zinc-100 flex-1">{toast.message}</div>
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-200 transition-colors p-1"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
