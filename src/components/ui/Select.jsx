import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

const Select = forwardRef(function Select(
  { className, label, error, hint, options = [], placeholder, id, children, ...props },
  ref
) {
  const inputId = id || (label ? `s-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined)
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-zinc-300 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className={cn(
        'relative rounded-xl border transition-colors',
        'bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]',
        error
          ? 'border-rose-500/50 focus-within:border-rose-400'
          : 'border-white/10 focus-within:border-indigo-400/60'
      )}>
        <select
          ref={ref}
          id={inputId}
          className={cn(
            'w-full appearance-none bg-transparent px-3 py-2.5 pr-9 text-sm text-zinc-100',
            'focus:outline-none disabled:opacity-60',
            className
          )}
          {...props}
        >
          {placeholder && <option value="" className="bg-zinc-900">{placeholder}</option>}
          {children ?? options.map(opt => (
            <option key={opt.value ?? opt} value={opt.value ?? opt} className="bg-zinc-900">
              {opt.label ?? opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
      </div>
      {error ? (
        <p className="text-xs text-rose-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  )
})

export default Select
