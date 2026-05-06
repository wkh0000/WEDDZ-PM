import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

const widths = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl'
}

export default function Drawer({
  open,
  onClose,
  title,
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
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => closeOnBackdrop && onClose?.()}
          />
          <motion.div
            className={cn(
              'absolute right-0 top-0 bottom-0 w-full bg-zinc-950 border-l border-white/10',
              'flex flex-col shadow-2xl',
              widths[width]
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
          >
            {(title || onClose) && (
              <div className="flex items-center justify-between px-6 h-14 border-b border-white/10 shrink-0">
                {title && <h2 className="text-base font-semibold text-zinc-100">{title}</h2>}
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
            <div className="flex-1 overflow-y-auto">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">
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
