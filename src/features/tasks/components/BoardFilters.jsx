import { Filter, X } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

const PRIORITIES = [
  { value: 'low',    label: 'Low',    color: 'bg-zinc-500' },
  { value: 'medium', label: 'Medium', color: 'bg-sky-500' },
  { value: 'high',   label: 'High',   color: 'bg-amber-500' },
  { value: 'urgent', label: 'Urgent', color: 'bg-rose-500' }
]

export default function BoardFilters({ filters, setFilters, profiles, labels }) {
  const has = filters.assignee || filters.priority || filters.label
  function clear() { setFilters({ assignee: null, priority: null, label: null }) }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <Filter className="w-3.5 h-3.5" />
        <span className="uppercase tracking-widest text-[10px]">Filter</span>
      </div>

      {/* Assignees */}
      <div className="flex items-center gap-1">
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => setFilters(f => ({ ...f, assignee: f.assignee === p.id ? null : p.id }))}
            title={p.full_name || p.email}
            className={cn(
              'rounded-full transition-all',
              filters.assignee === p.id
                ? 'ring-2 ring-indigo-400'
                : filters.assignee ? 'opacity-40 hover:opacity-80' : 'hover:opacity-90'
            )}
          >
            <Avatar name={p.full_name || p.email} src={p.avatar_url} size="xs" />
          </button>
        ))}
      </div>

      <span className="w-px h-5 bg-white/10" />

      {/* Priorities */}
      <div className="flex items-center gap-1">
        {PRIORITIES.map(p => (
          <button
            key={p.value}
            onClick={() => setFilters(f => ({ ...f, priority: f.priority === p.value ? null : p.value }))}
            className={cn(
              'h-6 px-2 inline-flex items-center gap-1 rounded-full text-[10px] uppercase tracking-wide border',
              filters.priority === p.value
                ? 'bg-white/10 text-zinc-100 border-white/20'
                : 'bg-white/[0.04] text-zinc-400 border-white/10 hover:text-zinc-200'
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', p.color)} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Labels */}
      {labels.length > 0 && (
        <>
          <span className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-1 flex-wrap">
            {labels.map(l => (
              <button
                key={l.id}
                onClick={() => setFilters(f => ({ ...f, label: f.label === l.id ? null : l.id }))}
                className={cn(
                  'h-6 px-2 rounded-full text-[10px] uppercase tracking-wide border transition-colors',
                  filters.label === l.id ? 'border-white/25' : 'opacity-50 hover:opacity-100 border-white/10'
                )}
                style={filters.label === l.id ? { background: l.color + '22', color: l.color, borderColor: l.color + '55' } : {}}
              >
                {l.name}
              </button>
            ))}
          </div>
        </>
      )}

      {has && (
        <button onClick={clear} className="ml-auto text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1">
          <X className="w-3 h-3" /> Clear
        </button>
      )}
    </div>
  )
}
