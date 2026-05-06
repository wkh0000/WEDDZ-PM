import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('glass rounded-2xl p-10 sm:p-14 text-center', className)}
    >
      {Icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
          <Icon className="w-6 h-6 text-indigo-400" strokeWidth={1.75} />
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-zinc-400 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}
