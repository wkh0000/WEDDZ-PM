import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const widths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl'
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
  closeOnBackdrop = true
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => closeOnBackdrop && onClose?.()}
          />
          <motion.div
            className={cn(
              'relative w-full glass-strong rounded-t-2xl sm:rounded-2xl shadow-glow border border-white/15 max-h-[92vh] flex flex-col',
              widths[width]
            )}
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 16 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
          >
            {(title || onClose) && (
              <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-white/10">
                <div>
                  {title && <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>}
                  {description && <p className="text-sm text-zinc-400 mt-0.5">{description}</p>}
                </div>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 -m-1 rounded-md"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
