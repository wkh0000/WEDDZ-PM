import { cn } from '@/lib/cn'

const tones = {
  default: 'bg-white/[0.06] text-zinc-300 border-white/10',
  indigo:  'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose:    'bg-rose-500/15 text-rose-300 border-rose-500/30',
  zinc:    'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  sky:     'bg-sky-500/15 text-sky-300 border-sky-500/30',
  violet:  'bg-violet-500/15 text-violet-300 border-violet-500/30'
}

const sizes = {
  sm: 'h-5 px-2 text-[10px]',
  md: 'h-6 px-2.5 text-xs',
  lg: 'h-7 px-3 text-sm'
}

export default function Badge({ children, tone = 'default', size = 'md', className, dot = false }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium uppercase tracking-wide',
      tones[tone],
      sizes[size],
      className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[tone])} />}
      {children}
    </span>
  )
}

const dotColors = {
  default: 'bg-zinc-400',
  indigo:  'bg-indigo-400',
  emerald: 'bg-emerald-400',
  amber:   'bg-amber-400',
  rose:    'bg-rose-400',
  zinc:    'bg-zinc-400',
  sky:     'bg-sky-400',
  violet:  'bg-violet-400'
}
