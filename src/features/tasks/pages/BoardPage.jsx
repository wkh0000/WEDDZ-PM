import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { ArrowLeft, Plus, Tag } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { useToast } from '@/context/ToastContext'
import { useDisclosure } from '@/hooks/useDisclosure'
import { getProject } from '@/features/projects/api'
import { listProfiles } from '@/features/admin/api'
import {
  listColumns, listTasks, createTask, updateTask, moveTask,
  createColumn, updateColumn, deleteColumn, reorderColumns,
  listLabels, createLabel, deleteLabel
} from '../api'
import Column from '../components/Column'
import TaskCard from '../components/TaskCard'
import TaskDetailDrawer from '../components/TaskDetailDrawer'
import BoardFilters from '../components/BoardFilters'
import { useBoardRealtime } from '../hooks/useBoardRealtime'

const LABEL_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899', '#84cc16']

export default function BoardPage() {
  const { id: projectId } = useParams()
  const toast = useToast()
  const taskDrawer = useDisclosure()
  const labelsModal = useDisclosure()
  const [project, setProject] = useState(null)
  const [columns, setColumns] = useState([])
  const [tasks, setTasks] = useState([])
  const [labels, setLabels] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [filters, setFilters] = useState({ assignee: null, priority: null, label: null })
  const reloadingRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const load = useCallback(async () => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    try {
      const [p, cs, ts, ls, ps] = await Promise.all([
        getProject(projectId),
        listColumns(projectId),
        listTasks(projectId),
        listLabels(projectId),
        listProfiles().catch(() => [])
      ])
      setProject(p); setColumns(cs); setTasks(ts); setLabels(ls); setProfiles(ps.filter(x => x.active))
    } catch (err) {
      toast.error(err.message || 'Failed to load board')
    } finally {
      reloadingRef.current = false
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => { document.title = `${project?.name ?? 'Board'} · WEDDZ PM` }, [project])
  useEffect(() => { load() }, [load])
  useBoardRealtime(projectId, load)

  // ---- filters
  const filteredTasks = useMemo(() => {
    let arr = tasks
    if (filters.assignee) arr = arr.filter(t => t.assignee_id === filters.assignee)
    if (filters.priority) arr = arr.filter(t => t.priority === filters.priority)
    if (filters.label)    arr = arr.filter(t => t.labels?.some(l => l.id === filters.label))
    return arr
  }, [tasks, filters])

  const tasksByColumn = useMemo(() => {
    const map = {}
    for (const c of columns) map[c.id] = []
    for (const t of filteredTasks) (map[t.column_id] ||= []).push(t)
    for (const colId of Object.keys(map)) map[colId].sort((a, b) => a.position - b.position)
    return map
  }, [filteredTasks, columns])

  // ---- DnD handlers
  function onDragStart(e) {
    const t = tasks.find(x => x.id === e.active.id)
    if (t) setActiveTask(t)
  }

  async function onDragEnd(e) {
    setActiveTask(null)
    const { active, over } = e
    if (!over) return

    // Column reorder
    const activeIsColumn = active.data.current?.type === 'column'
    const overIsColumn = over.data.current?.type === 'column'
    if (activeIsColumn && overIsColumn && active.id !== over.id) {
      const oldIdx = columns.findIndex(c => c.id === active.id)
      const newIdx = columns.findIndex(c => c.id === over.id)
      const next = arrayMove(columns, oldIdx, newIdx)
      setColumns(next.map((c, i) => ({ ...c, position: i })))
      try { await reorderColumns(next.map(c => c.id)) }
      catch (err) { toast.error(err.message); load() }
      return
    }

    // Task move (over column or over another task)
    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    let targetColumnId = null
    let targetIndex = 0

    if (over.data.current?.type === 'column') {
      targetColumnId = over.data.current.columnId
      targetIndex = (tasksByColumn[targetColumnId] ?? []).length
    } else {
      const overTask = tasks.find(t => t.id === over.id)
      if (!overTask) return
      targetColumnId = overTask.column_id
      const list = tasksByColumn[targetColumnId] ?? []
      const idx = list.findIndex(t => t.id === overTask.id)
      targetIndex = idx === -1 ? list.length : idx
    }

    // Optimistic local: rebuild positions
    const next = tasks.filter(t => t.id !== activeTask.id)
    const updatedActive = { ...activeTask, column_id: targetColumnId }

    // Insert into target column at targetIndex
    const colTasks = next.filter(t => t.column_id === targetColumnId).sort((a, b) => a.position - b.position)
    colTasks.splice(targetIndex, 0, updatedActive)
    colTasks.forEach((t, i) => { t.position = i })

    // Renumber positions in source column too
    if (activeTask.column_id !== targetColumnId) {
      const src = next.filter(t => t.column_id === activeTask.column_id).sort((a, b) => a.position - b.position)
      src.forEach((t, i) => { t.position = i })
    }

    setTasks([...next.filter(t => t.column_id !== targetColumnId), ...colTasks])
    try {
      await moveTask(activeTask.id, targetColumnId, targetIndex)
    } catch (err) {
      toast.error(err.message || 'Move failed')
      load()
    }
  }

  // ---- Column actions
  async function onAddTaskToColumn(columnId, title) {
    const colTasks = tasksByColumn[columnId] ?? []
    try {
      const created = await createTask({ projectId, columnId, title, position: colTasks.length })
      setTasks(arr => [...arr, { ...created, labels: [] }])
    } catch (err) { toast.error(err.message) }
  }

  const newColDisc = useDisclosure()
  const [newColName, setNewColName] = useState('')

  async function onAddColumn() {
    if (!newColName.trim()) return
    try {
      await createColumn(projectId, newColName.trim())
      setNewColName('')
      newColDisc.onClose()
      load()
    } catch (err) { toast.error(err.message) }
  }

  async function onRenameCol(col, name) {
    try {
      await updateColumn(col.id, { name })
      setColumns(arr => arr.map(c => c.id === col.id ? { ...c, name } : c))
    } catch (err) { toast.error(err.message) }
  }

  async function onDeleteCol(col) {
    const inCol = (tasksByColumn[col.id] ?? []).length
    if (inCol > 0) {
      if (!window.confirm(`This column has ${inCol} task${inCol === 1 ? '' : 's'}. They will be deleted too. Continue?`)) return
    }
    try {
      await deleteColumn(col.id)
      load()
    } catch (err) { toast.error(err.message) }
  }

  // ---- Labels
  const [labelDraft, setLabelDraft] = useState({ name: '', color: LABEL_PALETTE[0] })
  async function onAddLabel(e) {
    e?.preventDefault()
    if (!labelDraft.name.trim()) return
    try {
      const created = await createLabel(projectId, labelDraft.name.trim(), labelDraft.color)
      setLabels(arr => [...arr, created])
      setLabelDraft({ name: '', color: LABEL_PALETTE[0] })
    } catch (err) { toast.error(err.message) }
  }
  async function onDeleteLabel(id) {
    try {
      await deleteLabel(id)
      setLabels(arr => arr.filter(l => l.id !== id))
    } catch (err) { toast.error(err.message) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={
          <>
            <Link to="/projects" className="hover:text-zinc-300 inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Projects</Link>
            <span>/</span>
            <Link to={`/projects/${projectId}`} className="hover:text-zinc-300">{project?.name}</Link>
          </>
        }
        title="Board"
        description={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} across ${columns.length} ${columns.length === 1 ? 'column' : 'columns'}`}
        actions={
          <>
            <Button variant="subtle" leftIcon={<Tag className="w-4 h-4" />} onClick={labelsModal.onOpen}>Labels</Button>
            <Button variant="subtle" leftIcon={<Plus className="w-4 h-4" />} onClick={newColDisc.onOpen}>Add column</Button>
          </>
        }
      />

      <BoardFilters filters={filters} setFilters={setFilters} profiles={profiles} labels={labels} />

      {columns.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No columns yet"
          description="Add a column to start organizing tasks."
          action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={newColDisc.onOpen}>Add column</Button>}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="overflow-x-auto pb-4">
            <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex items-start gap-4 min-h-[60vh]">
                {columns.map(col => (
                  <Column
                    key={col.id}
                    column={col}
                    tasks={tasksByColumn[col.id] ?? []}
                    onAddTask={(title) => onAddTaskToColumn(col.id, title)}
                    onTaskClick={(task) => { setSelectedTask(task); taskDrawer.onOpen() }}
                    onRenameColumn={(name) => onRenameCol(col, name)}
                    onDeleteColumn={() => onDeleteCol(col)}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDetailDrawer
        open={taskDrawer.open}
        onClose={taskDrawer.onClose}
        task={selectedTask}
        projectId={projectId}
        profiles={profiles}
        onUpdated={(t) => setTasks(arr => arr.map(x => x.id === t.id ? { ...x, ...t } : x))}
        onDeleted={() => setTasks(arr => arr.filter(x => x.id !== selectedTask?.id))}
      />

      {/* New column modal */}
      <Modal
        open={newColDisc.open}
        onClose={newColDisc.onClose}
        title="Add column"
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={newColDisc.onClose}>Cancel</Button>
            <Button onClick={onAddColumn}>Add</Button>
          </>
        }
      >
        <Input label="Name" value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="e.g. In Review" autoFocus />
      </Modal>

      {/* Labels modal */}
      <Modal open={labelsModal.open} onClose={labelsModal.onClose} title="Labels" width="md">
        <form onSubmit={onAddLabel} className="space-y-3">
          <Input label="New label" value={labelDraft.name} onChange={e => setLabelDraft(d => ({ ...d, name: e.target.value }))} placeholder="Bug, Frontend, Q3 …" />
          <div>
            <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {LABEL_PALETTE.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setLabelDraft(d => ({ ...d, color: c }))}
                  className={`w-7 h-7 rounded-full border-2 ${labelDraft.color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button type="submit" disabled={!labelDraft.name.trim()}>Add label</Button>
        </form>
        {labels.length > 0 && (
          <div className="mt-6 space-y-1.5">
            {labels.map(l => (
              <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/10 bg-white/[0.03]">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="flex-1 text-sm text-zinc-100">{l.name}</span>
                <button onClick={() => onDeleteLabel(l.id)} className="text-zinc-500 hover:text-rose-400 text-xs">Delete</button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
