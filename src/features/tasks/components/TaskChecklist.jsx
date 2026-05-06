import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import { listChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem } from '../api'
import { useToast } from '@/context/ToastContext'

export default function TaskChecklist({ taskId }) {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')

  useEffect(() => { load() }, [taskId])

  async function load() {
    setLoading(true)
    try { setItems(await listChecklist(taskId)) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function add(e) {
    e?.preventDefault()
    const v = draft.trim()
    if (!v) return
    try {
      const created = await addChecklistItem(taskId, v)
      setItems(arr => [...arr, created])
      setDraft('')
    } catch (err) { toast.error(err.message) }
  }

  async function toggle(item) {
    try {
      const updated = await updateChecklistItem(item.id, { done: !item.done })
      setItems(arr => arr.map(x => x.id === item.id ? updated : x))
    } catch (err) { toast.error(err.message) }
  }

  async function remove(item) {
    try {
      await deleteChecklistItem(item.id)
      setItems(arr => arr.filter(x => x.id !== item.id))
    } catch (err) { toast.error(err.message) }
  }

  const done = items.filter(i => i.done).length

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
          <span className="tabular-nums">{done}/{items.length}</span>
          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-[width]" style={{ width: items.length ? `${(done / items.length) * 100}%` : 0 }} />
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.03] group">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggle(item)}
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
              />
              <span className={`flex-1 text-sm ${item.done ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                {item.body}
              </span>
              <button onClick={() => remove(item)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex items-center gap-2 pt-2">
        <Plus className="w-4 h-4 text-zinc-500" />
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a checklist item…"
          className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none border-b border-transparent focus:border-white/15 py-1"
        />
      </form>
    </div>
  )
}
