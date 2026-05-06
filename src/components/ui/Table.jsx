import { cn } from '@/lib/cn'

export function Table({ children, className }) {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  )
}

export function THead({ children, className }) {
  return (
    <thead className={cn('bg-white/[0.03] border-b border-white/10', className)}>
      {children}
    </thead>
  )
}

export function TR({ children, className, onClick, hover }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-white/5 last:border-0',
        hover && 'hover:bg-white/[0.03] cursor-pointer transition-colors',
        className
      )}
    >
      {children}
    </tr>
  )
}

export function TH({ children, className, align = 'left' }) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  )
}

export function TD({ children, className, align = 'left' }) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-zinc-200',
        align === 'right' && 'text-right tabular-nums',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  )
}
