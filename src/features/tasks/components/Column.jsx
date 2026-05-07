import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, MoreHorizontal, Pencil, Trash2,
  Flag, User, CalendarDays, Sparkles
} from 'lucide-react'
import TaskCard from './TaskCard'
import DropdownMenu from '@/components/ui/DropdownMenu'
import Avatar from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'

const PRI_OPTIONS = [
  { value: 'low',    color: 'bg-zinc-400' },
  { value: 'medium', color: 'bg-sky-400' },
  { value: 'high',   color: 'bg-amber-400' },
  { value: 'urgent', color: 'bg-rose-400' }
]

export default function Column({
  column, tasks, profiles = [], density = 'comfortable',
  onAddTask, onTaskClick, onQuickAction, onRenameColumn, onDeleteColumn
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column', column }
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id }
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition || undefined
  }

  const [adding, setAdding]       = useState(false)
  const [draftTitle, setTitle]    = useState('')
  const [draftPri, setPri]        = useState('medium')
  const [draftDue, setDue]        = useState('')
  const [draftAssignee, setAssg]  = useState('')
  const [renaming, setRenaming]   = useState(false)
  const [renameValue, setRename]  = useState(column.name)

  function reset() { setTitle(''); setPri('medium'); setDue(''); setAssg(''); setAdding(false) }

  function submitAdd(e) {
    e?.preventDefault()
    const v = draftTitle.trim()
    if (!v) { reset(); return }
    onAddTask?.({
      title: v,
      priority: draftPri,
      due_date: draftDue || null,
      assignee_id: draftAssignee || null
    })
    reset()
  }

  function submitRename(e) {
    e?.preventDefault()
    const v = renameValue.trim()
    if (!v || v === column.name) { setRenaming(false); return }
    onRenameColumn?.(v)
    setRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'shrink-0 w-80 max-h-full flex flex-col rounded-2xl bg-white/[0.03] border border-white/10',
        isDragging && 'opacity-40'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-white/10 shrink-0">
        {!renaming ? (
          <>
            <button
              {...attributes} {...listeners}
              className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
            >
              <span className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">{column.name}</span>
              <span className="text-xs text-zinc-500 tabular-nums">{tasks.length}</span>
            </button>
            <DropdownMenu
              trigger={
                <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
              items={[
                { label: 'Add task',      icon: Plus,    onClick: () => setAdding(true) },
                { label: 'Rename column', icon: Pencil,  onClick: () => { setRename(column.name); setRenaming(true) } },
                { separator: true },
                { label: 'Delete column', icon: Trash2,  danger: true, onClick: onDeleteColumn }
              ]}
            />
          </>
        ) : (
          <form onSubmit={submitRename} className="flex-1 flex items-center">
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRename(e.target.value)}
              onBlur={submitRename}
              className="w-full bg-white/[0.05] border border-white/15 rounded-md px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-indigo-400/60"
            />
          </form>
        )}
      </div>

      {/* Tasks */}
      <div
        ref={setDropRef}
        className={cn(
          'flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[120px] transition-colors',
          isOver && 'bg-indigo-500/[0.05]'
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              density={density}
              onClick={() => onTaskClick?.(task)}
              onQuickAction={onQuickAction}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && !adding && (
          <div className="text-xs text-zinc-600 text-center py-8 italic">No tasks</div>
        )}
      </div>

      {/* Add task */}
      <div className="p-2 border-t border-white/10 shrink-0">
        {adding ? (
          <form onSubmit={submitAdd} className="space-y-2 rounded-lg border border-indigo-500/30 bg-white/[0.04] p-2">
            <textarea
              autoFocus
              value={draftTitle}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) submitAdd(e)
                if (e.key === 'Escape') reset()
              }}
              placeholder="Task title…"
              rows={2}
              className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none"
            />
            {/* Priority chips */}
            <div className="flex items-center gap-1 flex-wrap">
              <Flag className="w-3 h-3 text-zinc-500" />
              {PRI_OPTIONS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPri(p.value)}
                  className={cn(
                    'h-5 px-1.5 inline-flex items-center gap-1 rounded text-[10px] uppercase tracking-wider border transition-colors',
                    draftPri === p.value
                      ? 'bg-white/10 text-zinc-100 border-white/20'
                      : 'border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/15'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', p.color)} />
                  {p.value}
                </button>
              ))}
            </div>
            {/* Due + assignee */}
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase tracking-wider">
                <CalendarDays className="w-3 h-3" />
              </label>
              <input
                type="date"
                value={draftDue}
                onChange={e => setDue(e.target.value)}
                className="bg-white/[0.05] border border-white/10 rounded px-1.5 h-6 text-[11px] text-zinc-200 focus:outline-none focus:border-indigo-400/60 [color-scheme:dark]"
              />
              <label className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase tracking-wider ml-2">
                <User className="w-3 h-3" />
              </label>
              <select
                value={draftAssignee}
                onChange={e => setAssg(e.target.value)}
                className="bg-white/[0.05] border border-white/10 rounded px-1.5 h-6 text-[11px] text-zinc-200 focus:outline-none focus:border-indigo-400/60 max-w-[140px]"
              >
                <option value="">Unassigned</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id} className="bg-zinc-900">{p.full_name || p.email}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-1 pt-1">
              <span className="text-[10px] text-zinc-500">Enter to add · Esc to cancel</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={reset} className="text-xs px-2 py-1 rounded-md text-zinc-400 hover:bg-white/5">Cancel</button>
                <button
                  type="submit"
                  disabled={!draftTitle.trim()}
                  className="text-xs px-2.5 py-1 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Add task
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-zinc-300 px-2 py-2 rounded-lg border border-dashed border-white/15 hover:border-indigo-400/50 hover:bg-indigo-500/[0.05] hover:text-indigo-200 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add task
          </button>
        )}
      </div>
    </div>
  )
}
