import { useEffect, useState } from 'react'
import { Trash2, Calendar, Flag, User, Tag, MessageSquare, CheckSquare, Paperclip, Activity } from 'lucide-react'
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
  updateTask, deleteTask, listLabels, attachLabel, detachLabel
} from '../api'
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
          <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={confirm.onOpen}>
            Delete task
          </Button>
        }
      >
        <div className="px-6 py-5 space-y-5">
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
            <Select
              label="Assignee"
              leftIcon={<User className="w-4 h-4" />}
              value={draft.assignee_id ?? ''}
              onChange={e => save('assignee_id', e.target.value || null)}
              options={profiles.map(p => ({ value: p.id, label: p.full_name || p.email }))}
              placeholder="Unassigned"
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
