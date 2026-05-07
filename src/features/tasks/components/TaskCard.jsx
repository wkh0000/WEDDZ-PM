import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, MessageSquare, CheckSquare, Paperclip, MoreHorizontal, GripVertical, AlertCircle } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'

const priorityStyle = {
  low:    { dot: 'bg-zinc-400',    chip: 'bg-zinc-500/15  text-zinc-300  border-zinc-500/30',  label: 'Low' },
  medium: { dot: 'bg-sky-400',     chip: 'bg-sky-500/15   text-sky-300   border-sky-500/30',   label: 'Med' },
  high:   { dot: 'bg-amber-400',   chip: 'bg-amber-500/15 text-amber-200 border-amber-500/30', label: 'High' },
  urgent: { dot: 'bg-rose-400',    chip: 'bg-rose-500/15  text-rose-300  border-rose-500/30',  label: 'Urgent' }
}

/**
 * Returns { tone, label } for a due date.
 *  - Past: rose 'Overdue Xd'
 *  - Today: amber 'Today'
 *  - Tomorrow: amber 'Tomorrow'
 *  - Within 7d: sky 'Mon 10' (relative + day)
 *  - Else: zinc absolute date
 */
function dueStatus(dateStr, completed) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (completed) return { tone: 'text-emerald-400', icon: CheckSquare, label: formatDate(dateStr) }
  if (diffDays < 0)  return { tone: 'text-rose-400 font-medium',   icon: AlertCircle, label: `Overdue ${-diffDays}d` }
  if (diffDays === 0) return { tone: 'text-amber-300 font-medium', icon: Calendar,    label: 'Today' }
  if (diffDays === 1) return { tone: 'text-amber-300',             icon: Calendar,    label: 'Tomorrow' }
  if (diffDays <= 7)  return { tone: 'text-sky-300',               icon: Calendar,    label: `In ${diffDays}d` }
  return { tone: 'text-zinc-400', icon: Calendar, label: formatDate(dateStr) }
}

export default function TaskCard({ task, onClick, onQuickAction, isOverlay = false, density = 'comfortable' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task }
  })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || undefined
  }

  const completed = !!task.completed_at
  const due = dueStatus(task.due_date, completed)
  const pri = priorityStyle[task.priority] ?? priorityStyle.medium
  const total = task.checklist_total ?? 0
  const done  = task.checklist_done ?? 0
  const checklistPct = total > 0 ? Math.round((done / total) * 100) : 0

  const isCompact = density === 'compact'

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        // ignore drags + clicks on the drag handle / hover-action button
        if (isDragging) return
        if (e.target?.closest?.('[data-no-card-click]')) return
        onClick?.()
      }}
      className={cn(
        'group relative glass rounded-xl select-none transition-all',
        'hover:border-white/20 hover:bg-white/[0.06]',
        completed && 'opacity-70',
        isDragging && 'opacity-30',
        isOverlay && 'shadow-glow rotate-1 scale-[1.02] border-indigo-400/40'
      )}
    >
      {/* Drag handle (top-left) — explicit so we don't drag from anywhere */}
      <button
        {...attributes}
        {...listeners}
        data-no-card-click
        className="absolute top-2 left-1.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-200 transition-opacity p-0.5 z-10"
        aria-label="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* Quick actions (top-right) */}
      {onQuickAction && (
        <button
          data-no-card-click
          onClick={(e) => { e.stopPropagation(); onQuickAction(task) }}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 rounded p-0.5 transition-all z-10"
          aria-label="Quick actions"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Body */}
      <div className={cn('cursor-pointer', isCompact ? 'p-2.5 pl-7' : 'p-3 pl-7')}>
        {/* Labels */}
        {!isCompact && task.labels?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {task.labels.slice(0, 4).map(l => (
              <span
                key={l.id}
                className="inline-flex items-center text-[10px] uppercase tracking-wider font-medium px-1.5 h-4 rounded border"
                style={{
                  background: l.color + '22',
                  color: l.color,
                  borderColor: l.color + '55'
                }}
              >
                {l.name}
              </span>
            ))}
            {task.labels.length > 4 && (
              <span className="text-[10px] text-zinc-500">+{task.labels.length - 4}</span>
            )}
          </div>
        )}

        {/* Compact mode shows a tiny color stripe above the title */}
        {isCompact && task.labels?.length > 0 && (
          <div className="flex gap-0.5 mb-1.5">
            {task.labels.slice(0, 6).map(l => (
              <span key={l.id} className="h-1 flex-1 rounded-full" style={{ backgroundColor: l.color }} title={l.name} />
            ))}
          </div>
        )}

        {/* Title */}
        <div className={cn(
          'text-zinc-100 font-medium leading-snug',
          isCompact ? 'text-sm line-clamp-1' : 'text-sm line-clamp-3',
          completed && 'line-through text-zinc-400'
        )}>
          {task.title}
        </div>

        {/* Checklist progress bar (only if there are items and not compact) */}
        {!isCompact && total > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[10px]">
            <span className={cn('tabular-nums', done === total ? 'text-emerald-400 font-medium' : 'text-zinc-400')}>
              {done}/{total}
            </span>
            <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className={cn('h-full transition-all', done === total ? 'bg-emerald-400' : 'bg-indigo-400/70')}
                style={{ width: `${checklistPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={cn('flex items-center justify-between gap-2', isCompact ? 'mt-1' : 'mt-2.5')}>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {/* Priority chip — show high/urgent always; medium/low only in non-compact */}
            {(task.priority === 'high' || task.priority === 'urgent' ||
              (!isCompact && task.priority && task.priority !== 'medium')) && (
              <span className={cn(
                'inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider',
                'h-4 px-1.5 rounded border', pri.chip
              )}>
                <span className={cn('w-1 h-1 rounded-full', pri.dot)} />
                {pri.label}
              </span>
            )}

            {/* Due date with urgency color */}
            {due && (
              <span className={cn('inline-flex items-center gap-1 text-[10px]', due.tone)}>
                <due.icon className="w-3 h-3" />
                {due.label}
              </span>
            )}

            {/* Counts (non-compact only) */}
            {!isCompact && (
              <span className="inline-flex items-center gap-2 text-[10px] text-zinc-500">
                {task.comment_count > 0 && (
                  <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{task.comment_count}</span>
                )}
                {task.attachment_count > 0 && (
                  <span className="inline-flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{task.attachment_count}</span>
                )}
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {task.assignee && (
            <Avatar name={task.assignee.full_name} src={task.assignee.avatar_url} size="xs" />
          )}
        </div>
      </div>
    </div>
  )
}
