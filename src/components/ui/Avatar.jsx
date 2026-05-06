import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl'
}

const palette = [
  'bg-indigo-500/20 text-indigo-200 border-indigo-500/30',
  'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
  'bg-amber-500/20 text-amber-200 border-amber-500/30',
  'bg-rose-500/20 text-rose-200 border-rose-500/30',
  'bg-violet-500/20 text-violet-200 border-violet-500/30',
  'bg-sky-500/20 text-sky-200 border-sky-500/30'
]

function paletteFor(name) {
  if (!name) return palette[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

export default function Avatar({ name, src, size = 'md', className }) {
  const tone = paletteFor(name)
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full border font-semibold uppercase select-none overflow-hidden',
      sizes[size],
      !src && tone,
      src && 'border-white/15 bg-white/5',
      className
    )}>
      {src ? (
        <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  )
}
