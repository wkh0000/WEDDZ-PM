import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'WEDDZ PM'

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-zinc-950 bg-app-radial relative overflow-hidden flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-grid-faint bg-grid-32 opacity-30 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative"
      >
        <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-glow">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center font-bold text-white shadow-glow">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-zinc-100">{APP_NAME}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">WEDDZ IT</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
          {subtitle && <p className="text-sm text-zinc-400 mt-1.5">{subtitle}</p>}

          <div className="mt-8">{children}</div>
        </div>

        {footer && (
          <div className="mt-6 text-center text-sm text-zinc-400">{footer}</div>
        )}
      </motion.div>
    </div>
  )
}
