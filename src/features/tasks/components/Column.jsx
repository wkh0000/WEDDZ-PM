import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import TaskCard from './TaskCard'
import DropdownMenu from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/cn'

export default function Column({ column, tasks, onAddTask, onTaskClick, onRenameColumn, onDeleteColumn }) {
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

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.name)

  function submitAdd(e) {
    e?.preventDefault()
    const v = draft.trim()
    if (!v) { setAdding(false); return }
    onAddTask?.(v)
    setDraft(''); setAdding(false)
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
        'shrink-0 w-72 sm:w-80 max-h-full flex flex-col rounded-2xl bg-white/[0.03] border border-white/10',
        isDragging && 'opacity-40'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-white/10">
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
                { label: 'Rename column', icon: Pencil, onClick: () => { setRenameValue(column.name); setRenaming(true) } },
                { separator: true },
                { label: 'Delete column', icon: Trash2, danger: true, onClick: onDeleteColumn }
              ]}
            />
          </>
        ) : (
          <form onSubmit={submitRename} className="flex-1 flex items-center">
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
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
          'flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-[80px] transition-colors',
          isOver && 'bg-indigo-500/[0.04]'
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick?.(task)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && !adding && (
          <div className="text-xs text-zinc-600 text-center py-6">No tasks</div>
        )}
      </div>

      {/* Add task footer */}
      <div className="p-2 border-t border-white/10">
        {adding ? (
          <form onSubmit={submitAdd}>
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submitAdd(e) }}
              placeholder="Task title…"
              rows={2}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:border-indigo-400/60"
            />
            <div className="flex items-center gap-1 mt-1.5">
              <button type="submit" className="text-xs px-2 py-1 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white">Add</button>
              <button type="button" onClick={() => { setAdding(false); setDraft('') }} className="text-xs px-2 py-1 rounded-md text-zinc-400 hover:bg-white/5">Cancel</button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add task
          </button>
        )}
      </div>
    </div>
  )
}
