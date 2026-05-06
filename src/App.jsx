import { motion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'WEDDZ PM'

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-app-radial relative overflow-hidden">
      {/* Faint grid backdrop */}
      <div className="absolute inset-0 bg-grid-faint bg-grid-32 opacity-40 pointer-events-none" />

      <main className="relative min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass rounded-3xl px-8 sm:px-10 py-12 max-w-md w-full text-center shadow-glow"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.4, ease: 'backOut' }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 mb-6"
          >
            <Sparkles className="w-8 h-8 text-indigo-400" strokeWidth={1.75} />
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-zinc-400 mt-3 text-balance">
            Internal Project Management & CRM for WEDDZ IT.
          </p>

          <div className="mt-8 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-indigo-300/90 border border-indigo-500/30 rounded-full px-3.5 py-1.5 bg-indigo-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-soft" />
            Phase 01 · Foundation
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 text-left space-y-2">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Next phases</p>
            {['02 · Database & Edge Function', '03 · Auth & Layout', '04 · Team Members & Roles'].map((step) => (
              <div key={step} className="flex items-center gap-2 text-sm text-zinc-300">
                <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  )
}
