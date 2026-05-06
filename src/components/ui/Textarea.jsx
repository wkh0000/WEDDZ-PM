import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const Textarea = forwardRef(function Textarea(
  { className, label, error, hint, id, rows = 4, ...props },
  ref
) {
  const inputId = id || (label ? `t-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300 uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cn(
          'w-full rounded-xl border px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors',
          'bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.06]',
          'focus:outline-none disabled:opacity-60 resize-y min-h-[80px]',
          error
            ? 'border-rose-500/50 focus:border-rose-400'
            : 'border-white/10 focus:border-indigo-400/60',
          className
        )}
        {...props}
      />
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  )
})

export default Textarea
