import { CalendarClock, AlertOctagon, UserX, UserCheck, CheckSquare, X, Search, FilterX, Archive } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

const PRI_OPTIONS = [
  { value: 'low',    color: 'bg-zinc-400' },
  { value: 'medium', color: 'bg-sky-400' },
  { value: 'high',   color: 'bg-amber-400' },
  { value: 'urgent', color: 'bg-rose-400' }
]

const SMART = [
  { id: 'overdue',     label: 'Overdue',       icon: AlertOctagon, tone: 'rose' },
  { id: 'this_week',   label: 'Due this week', icon: CalendarClock, tone: 'amber' },
  { id: 'unassigned',  label: 'Unassigned',    icon: UserX,        tone: 'zinc' },
  { id: 'mine',        label: 'Assigned to me',icon: UserCheck,    tone: 'indigo' },
  { id: 'completed',   label: 'Completed',     icon: CheckSquare,  tone: 'emerald' },
  { id: 'archived',    label: 'Archived',      icon: Archive,      tone: 'violet' }
]

const TONE_CHIP = {
  rose:    'bg-rose-500/15 text-rose-200 border-rose-500/30',
  amber:   'bg-amber-500/15 text-amber-200 border-amber-500/30',
  zinc:    'bg-zinc-500/15 text-zinc-200 border-zinc-500/30',
  indigo:  'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  violet:  'bg-violet-500/15 text-violet-200 border-violet-500/30'
}

export default function BoardSmartFilters({ filters, setFilters, profiles, labels, search, setSearch, density, setDensity }) {
  const activeCount =
    Object.values(filters).filter(v => v != null).length + (search.trim() ? 1 : 0)
  const hasFilter = activeCount > 0

  function toggleSmart(id) {
    setFilters(f => ({ ...f, smart: f.smart === id ? null : id }))
  }

  function resetAll() {
    setFilters({ assignee: null, priority: null, label: null, smart: null })
    setSearch('')
  }

  return (
    <div className="space-y-2.5">
      {/* Row 1: search + density + clear. flex-wrap so the density
          toggle + Reset button stack below the search box on phones
          instead of getting clipped off-screen. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full pl-8 pr-3 h-8 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400/60"
          />
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
          <button
            onClick={() => setDensity('comfortable')}
            className={cn('text-[10px] px-2 h-6 rounded uppercase tracking-wider', density === 'comfortable' ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
            title="Comfortable density"
          >Cozy</button>
          <button
            onClick={() => setDensity('compact')}
            className={cn('text-[10px] px-2 h-6 rounded uppercase tracking-wider', density === 'compact' ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
            title="Compact density"
          >Compact</button>
        </div>
        <button
          onClick={resetAll}
          disabled={!hasFilter}
          title={hasFilter ? `Reset ${activeCount} active filter${activeCount === 1 ? '' : 's'}` : 'No filters active'}
          className={cn(
            'text-xs inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border transition-colors',
            hasFilter
              ? 'text-zinc-200 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/15 hover:border-rose-500/40'
              : 'text-zinc-600 bg-white/[0.02] border-white/10 cursor-not-allowed'
          )}
        >
          <FilterX className="w-3.5 h-3.5" />
          Reset filters
          {hasFilter && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-rose-500/30 text-rose-100 tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Row 2: smart filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Quick</span>
        {SMART.map(s => {
          const active = filters.smart === s.id
          return (
            <button
              key={s.id}
              onClick={() => toggleSmart(s.id)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[11px] font-medium border inline-flex items-center gap-1.5 transition-colors',
                active ? TONE_CHIP[s.tone] : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
              )}
            >
              <s.icon className="w-3 h-3" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Row 3: priority + assignee + label */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Priority</span>
        {PRI_OPTIONS.map(p => (
          <button
            key={p.value}
            onClick={() => setFilters(f => ({ ...f, priority: f.priority === p.value ? null : p.value }))}
            className={cn(
              'h-7 px-2 inline-flex items-center gap-1 rounded-full text-[10px] uppercase tracking-wider border transition-colors',
              filters.priority === p.value
                ? 'bg-white/10 text-zinc-100 border-white/20'
                : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', p.color)} />
            {p.value}
          </button>
        ))}

        {profiles?.length > 0 && (
          <>
            <span className="w-px h-5 bg-white/10 mx-1" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Assignee</span>
            <div className="flex items-center gap-0.5">
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilters(f => ({ ...f, assignee: f.assignee === p.id ? null : p.id }))}
                  title={p.full_name || p.email}
                  className={cn(
                    'rounded-full transition-all p-0.5',
                    filters.assignee === p.id
                      ? 'ring-2 ring-indigo-400'
                      : filters.assignee ? 'opacity-40 hover:opacity-90' : 'hover:opacity-90'
                  )}
                >
                  <Avatar name={p.full_name || p.email} src={p.avatar_url} size="xs" />
                </button>
              ))}
            </div>
          </>
        )}

        {labels?.length > 0 && (
          <>
            <span className="w-px h-5 bg-white/10 mx-1" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 mr-1">Label</span>
            {labels.map(l => (
              <button
                key={l.id}
                onClick={() => setFilters(f => ({ ...f, label: f.label === l.id ? null : l.id }))}
                className={cn(
                  'h-7 px-2 rounded-full text-[10px] uppercase tracking-wider border transition-colors',
                  filters.label === l.id ? 'border-white/30' : 'opacity-60 hover:opacity-100 border-white/10'
                )}
                style={filters.label === l.id ? { background: l.color + '22', color: l.color, borderColor: l.color + '55' } : {}}
              >
                {l.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
