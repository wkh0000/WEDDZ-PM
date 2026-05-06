import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Calendar, MessageSquare, CheckSquare, Paperclip, AlertCircle } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/cn'

const priorityTone = {
  low: 'bg-zinc-500',
  medium: 'bg-sky-500',
  high: 'bg-amber-500',
  urgent: 'bg-rose-500'
}

export default function TaskCard({ task, onClick, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', task }
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only fire onClick if it's not a drag (no movement)
        if (!isDragging) onClick?.()
      }}
      className={cn(
        'glass rounded-xl p-3 cursor-grab active:cursor-grabbing select-none',
        'hover:border-white/15 transition-colors',
        isDragging && 'opacity-30',
        isOverlay && 'shadow-glow rotate-2 scale-105'
      )}
    >
      {/* Labels */}
      {task.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 4).map(l => (
            <span
              key={l.id}
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: l.color }}
              title={l.name}
            />
          ))}
        </div>
      )}

      <div className="text-sm text-zinc-100 leading-snug font-medium line-clamp-2">{task.title}</div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-400 min-w-0">
          {task.priority && task.priority !== 'medium' && (
            <span
              className={cn('inline-block w-1.5 h-1.5 rounded-full', priorityTone[task.priority])}
              title={`Priority: ${task.priority}`}
            />
          )}
          {task.due_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(task.due_date)}
            </span>
          )}
          {task.completed_at && (
            <span className="text-emerald-400 inline-flex items-center gap-0.5">
              <CheckSquare className="w-3 h-3" /> done
            </span>
          )}
        </div>
        {task.assignee && (
          <Avatar name={task.assignee.full_name} src={task.assignee.avatar_url} size="xs" />
        )}
      </div>
    </div>
  )
}
