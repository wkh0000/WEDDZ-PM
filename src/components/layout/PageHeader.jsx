import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export default function PageHeader({ title, description, actions, className, breadcrumb }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4', className)}
    >
      <div className="min-w-0">
        {breadcrumb && (
          <div className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1.5">
            {breadcrumb}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">{title}</h1>
        {description && <p className="text-sm text-zinc-400 mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </motion.div>
  )
}
