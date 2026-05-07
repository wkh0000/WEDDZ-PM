import { useEffect, useState } from 'react'
import { Trash2, Calendar, Flag, User, Tag, MessageSquare, CheckSquare, Paperclip, Activity, Archive, ArchiveRestore } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import {
  updateTask, deleteTask, listLabels, attachLabel, detachLabel, setTaskAssignees,
  archiveTask, unarchiveTask
} from '../api'
import AssigneePicker from './AssigneePicker'
import TaskCommentsThread from './TaskCommentsThread'
import TaskChecklist from './TaskChecklist'
import TaskAttachments from './TaskAttachments'
import TaskActivityFeed from './TaskActivityFeed'

export default function TaskDetailDrawer({ open, onClose, task, projectId, profiles, onUpdated, onDeleted }) {
  const toast = useToast()
  const confirm = useDisclosure()
  const [draft, setDraft] = useState(null)
  const [tab, setTab] = useState('details')
  const [savingField, setSavingField] = useState(false)
  const [allLabels, setAllLabels] = useState([])
  const [busyDelete, setBusyDelete] = useState(false)
  const [busyArchive, setBusyArchive] = useState(false)

  useEffect(() => {
    if (task) setDraft(task)
    if (open && projectId) listLabels(projectId).then(setAllLabels).catch(() => setAllLabels([]))
  }, [task, open, projectId])

  if (!task || !draft) return null

  async function save(field, value) {
    setSavingField(true)
    try {
      const updated = await updateTask(task.id, { [field]: value })
      setDraft(d => ({ ...d, ...updated }))
      onUpdated?.(updated)
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSavingField(false)
    }
  }

  async function onDelete() {
    setBusyDelete(true)
    try {
      await deleteTask(task.id)
      toast.success('Task deleted')
      onDeleted?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    } finally {
      setBusyDelete(false)
    }
  }

  async function onArchiveToggle() {
    setBusyArchive(true)
    try {
      const updated = draft.archived_at
        ? await unarchiveTask(task.id)
        : await archiveTask(task.id)
      setDraft(d => ({ ...d, ...updated }))
      onUpdated?.(updated)
      toast.success(draft.archived_at ? 'Task restored' : 'Task archived')
    } catch (err) {
      toast.error(err.message || 'Archive failed')
    } finally {
      setBusyArchive(false)
    }
  }

  async function toggleLabel(label, on) {
    try {
      if (on) await attachLabel(task.id, label.id)
      else    await detachLabel(task.id, label.id)
      const nextLabels = on
        ? [...(draft.labels ?? []), label]
        : (draft.labels ?? []).filter(l => l.id !== label.id)
      setDraft(d => ({ ...d, labels: nextLabels }))
      onUpdated?.({ ...draft, labels: nextLabels })
    } catch (err) { toast.error(err.message || 'Label update failed') }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={null}
        width="lg"
        footer={
          <div className="flex flex-wrap items-center gap-2 w-full justify-end">
            <Button
              variant="subtle"
              leftIcon={draft.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              onClick={onArchiveToggle}
              loading={busyArchive}
            >
              {draft.archived_at ? 'Restore' : 'Archive'}
            </Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={confirm.onOpen}>
              Delete
            </Button>
          </div>
        }
      >
        <div className="px-6 py-5 space-y-5">
          {draft.archived_at && (
            <div className="-mt-1 inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium border bg-violet-500/15 text-violet-200 border-violet-500/30">
              <Archive className="w-3 h-3" />
              Archived
            </div>
          )}
          {/* Title */}
          <div>
            <input
              defaultValue={draft.title}
              onBlur={(e) => { if (e.target.value !== draft.title) save('title', e.target.value) }}
              className="w-full bg-transparent text-xl font-semibold text-zinc-100 focus:outline-none focus:bg-white/[0.03] rounded px-2 py-1 -mx-2"
            />
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AssigneePicker
              label="Assignees"
              profiles={profiles}
              value={(draft.assignees ?? []).map(a => a.id)}
              onChange={async ids => {
                // Optimistic — drawer state updates instantly so the
                // picker re-renders with the new chips, even before
                // the network round-trip completes.
                const next = ids.map(id => profiles.find(p => p.id === id)).filter(Boolean)
                setDraft(d => ({ ...d, assignees: next, assignee_id: ids[0] ?? null, assignee: next[0] ?? null }))
                try {
                  const updated = await setTaskAssignees(task.id, ids)
                  onUpdated?.({ ...updated, assignees: next })
                } catch (e) { toast.error(e.message || 'Assignee update failed') }
              }}
            />
            <Select
              label="Priority"
              value={draft.priority ?? 'medium'}
              onChange={e => save('priority', e.target.value)}
              options={[
                { value: 'low',    label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high',   label: 'High' },
                { value: 'urgent', label: 'Urgent' }
              ]}
            />
            <Input
              label="Due date"
              type="date"
              value={draft.due_date ?? ''}
              onChange={e => save('due_date', e.target.value || null)}
            />
            <div>
              <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide mb-1.5">Status</label>
              <Button
                size="md"
                variant={draft.completed_at ? 'success' : 'subtle'}
                leftIcon={<CheckSquare className="w-4 h-4" />}
                onClick={() => save('completed_at', draft.completed_at ? null : new Date().toISOString())}
                className="w-full"
              >
                {draft.completed_at ? 'Completed — undo' : 'Mark complete'}
              </Button>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide mb-1.5">Labels</label>
            <div className="flex flex-wrap gap-1.5">
              {allLabels.length === 0 && <span className="text-xs text-zinc-500">No labels yet — create them on the board page.</span>}
              {allLabels.map(l => {
                const active = draft.labels?.some(x => x.id === l.id)
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l, !active)}
                    className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10px] font-medium uppercase tracking-wide border transition-colors ${
                      active ? 'border-white/20' : 'border-white/10 opacity-50 hover:opacity-100'
                    }`}
                    style={active ? { background: l.color + '22', color: l.color, borderColor: l.color + '55' } : {}}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide mb-1.5">Description</label>
            <Textarea
              defaultValue={draft.description ?? ''}
              onBlur={(e) => { if (e.target.value !== (draft.description ?? '')) save('description', e.target.value || null) }}
              rows={4}
              placeholder="What needs to be done?"
            />
          </div>

          {/* Tabs */}
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'details', label: 'Comments' },
              { value: 'checklist', label: 'Checklist' },
              { value: 'attachments', label: 'Attachments' },
              { value: 'activity', label: 'Activity' }
            ]}
          />

          {tab === 'details'     && <TaskCommentsThread taskId={task.id} />}
          {tab === 'checklist'   && <TaskChecklist taskId={task.id} />}
          {tab === 'attachments' && <TaskAttachments taskId={task.id} />}
          {tab === 'activity'    && <TaskActivityFeed taskId={task.id} />}
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.onClose}
        onConfirm={onDelete}
        title="Delete this task?"
        description="The task and all its comments, checklist items, attachments, and activity will be permanently removed."
        confirmLabel="Delete task"
        loading={busyDelete}
      />
    </>
  )
}
