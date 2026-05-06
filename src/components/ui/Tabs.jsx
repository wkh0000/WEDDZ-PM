import { cn } from '@/lib/cn'

export function Tabs({ value, onChange, items, className }) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-white/10', className)}>
      {items.map(item => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            onClick={() => onChange?.(item.value)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2',
              active
                ? 'text-zinc-100 border-indigo-400'
                : 'text-zinc-400 hover:text-zinc-200 border-transparent'
            )}
          >
            {item.label}
            {item.count != null && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/[0.06] text-xs text-zinc-300">
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
