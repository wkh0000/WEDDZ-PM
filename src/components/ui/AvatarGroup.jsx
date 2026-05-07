import Avatar from './Avatar'
import { cn } from '@/lib/cn'

/**
 * Stacked avatar list with overflow counter.
 *
 * Props
 *   items   — array of { id?, full_name?, name?, avatar_url?, src? }
 *   max     — max avatars to show before collapsing the rest into a +N chip (default 3)
 *   size    — Avatar size (default 'xs')
 *   ring    — outline color used between overlapping avatars (default 'ring-zinc-900')
 *
 * Renders nothing if items is empty.
 */
export default function AvatarGroup({ items = [], max = 3, size = 'xs', ring = 'ring-zinc-900', className }) {
  const visible = items.slice(0, max)
  const overflow = Math.max(0, items.length - max)
  if (items.length === 0) return null

  // ring offset / spacing so avatars overlap by ~30%.
  const overlap = size === 'xs' ? '-ml-1.5' : size === 'sm' ? '-ml-2' : '-ml-2.5'
  const dotSize = size === 'xs' ? 'h-6 w-6 text-[10px]'
                : size === 'sm' ? 'h-8 w-8 text-xs'
                : 'h-10 w-10 text-sm'

  return (
    <div
      className={cn('inline-flex items-center', className)}
      title={items.map(i => i.full_name ?? i.name ?? i.email ?? '').filter(Boolean).join(', ')}
    >
      {visible.map((it, idx) => (
        <Avatar
          key={it.id ?? idx}
          name={it.full_name ?? it.name ?? it.email}
          src={it.avatar_url ?? it.src}
          size={size}
          className={cn(idx > 0 && overlap, 'ring-2', ring)}
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full font-semibold ring-2 select-none',
            'bg-white/[0.08] text-zinc-300 border border-white/10',
            ring, overlap, dotSize
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
