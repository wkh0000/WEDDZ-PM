import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const Input = forwardRef(function Input(
  { className, label, error, leftIcon, rightIcon, prefix, suffix, hint, id, ...props },
  ref
) {
  const inputId = id || (label ? `i-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className={cn(
        'relative flex items-center rounded-xl border transition-colors',
        'bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]',
        error
          ? 'border-rose-500/50 focus-within:border-rose-400'
          : 'border-white/10 focus-within:border-indigo-400/60',
      )}>
        {leftIcon && <span className="pl-3 text-zinc-400">{leftIcon}</span>}
        {prefix && <span className="pl-3 text-sm text-zinc-400">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500',
            'focus:outline-none disabled:opacity-60',
            className
          )}
          {...props}
        />
        {suffix && <span className="pr-3 text-sm text-zinc-400">{suffix}</span>}
        {rightIcon && <span className="pr-3 text-zinc-400">{rightIcon}</span>}
      </div>
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  )
})

export default Input
