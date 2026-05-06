import { useEffect, useState } from 'react'
import { Activity, Plus, Edit3, Move, MessageSquare, CheckSquare, Tag, Paperclip, RotateCcw, UserPlus } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import { listActivity } from '../api'
import { useToast } from '@/context/ToastContext'
import { formatDateTime } from '@/lib/format'

const iconFor = {
  created:    Plus,
  updated:    Edit3,
  moved:      Move,
  assigned:   UserPlus,
  commented:  MessageSquare,
  completed:  CheckSquare,
  reopened:   RotateCcw,
  attached:   Paperclip,
  labeled:    Tag,
  unlabeled:  Tag
}

const labelFor = {
  created:    'created the task',
  updated:    'updated the task',
  moved:      'moved the task',
  assigned:   'changed assignee',
  commented:  'left a comment',
  completed:  'marked complete',
  reopened:   'reopened the task',
  attached:   'attached a file',
  labeled:    'added a label',
  unlabeled:  'removed a label'
}

export default function TaskActivityFeed({ taskId }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [taskId])
  async function load() {
    setLoading(true)
    try { setItems(await listActivity(taskId)) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>
  if (items.length === 0) return <div className="text-center text-xs text-zinc-500 py-4">No activity yet.</div>

  return (
    <ol className="relative border-l border-white/10 pl-4 ml-2 space-y-3">
      {items.map(a => {
        const Icon = iconFor[a.kind] || Activity
        return (
          <li key={a.id} className="relative">
            <span className="absolute -left-[22px] top-0.5 w-4 h-4 rounded-full bg-zinc-900 border border-white/15 flex items-center justify-center">
              <Icon className="w-2.5 h-2.5 text-zinc-400" />
            </span>
            <div className="flex items-center gap-2 text-xs">
              <Avatar name={a.actor?.full_name} src={a.actor?.avatar_url} size="xs" />
              <span className="font-medium text-zinc-200">{a.actor?.full_name ?? 'Someone'}</span>
              <span className="text-zinc-400">{labelFor[a.kind] ?? a.kind}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500">{formatDateTime(a.created_at)}</span>
            </div>
            {a.payload?.snippet && <div className="text-xs text-zinc-400 mt-1 italic">"{a.payload.snippet}"</div>}
          </li>
        )
      })}
    </ol>
  )
}
