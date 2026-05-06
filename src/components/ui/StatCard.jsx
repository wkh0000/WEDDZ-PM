import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export default function StatCard({ icon: Icon, label, value, hint, tone = 'indigo', loading }) {
  const tones = {
    indigo:  'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose:    'text-rose-400 bg-rose-500/10 border-rose-500/20',
    sky:     'text-sky-400 bg-sky-500/10 border-sky-500/20',
    violet:  'text-violet-400 bg-violet-500/10 border-violet-500/20'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="glass rounded-2xl p-5 hover:border-white/15 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">{label}</span>
        {Icon && (
          <span className={cn('inline-flex items-center justify-center w-9 h-9 rounded-lg border', tones[tone])}>
            <Icon className="w-4 h-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-32 rounded bg-white/5 animate-pulse" />
        ) : (
          <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100 tabular-nums">{value}</div>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </motion.div>
  )
}
