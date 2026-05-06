import { useEffect, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { listComments, addComment, deleteComment } from '../api'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime } from '@/lib/format'

export default function TaskCommentsThread({ taskId }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => { load() }, [taskId])

  async function load() {
    setLoading(true)
    try { setComments(await listComments(taskId)) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function onPost(e) {
    e?.preventDefault()
    if (!body.trim()) return
    setPosting(true)
    try {
      const c = await addComment(taskId, body.trim())
      setBody('')
      setComments(arr => [...arr, c])
    } catch (err) { toast.error(err.message) }
    finally { setPosting(false) }
  }

  async function onDelete(c) {
    try {
      await deleteComment(c.id)
      setComments(arr => arr.filter(x => x.id !== c.id))
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onPost} className="flex items-start gap-2.5">
        <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onPost(e) }}
            rows={2}
            placeholder="Add a comment… (Cmd+Enter to send)"
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400/60 resize-none"
          />
          <div className="flex justify-end mt-1.5">
            <Button onClick={onPost} disabled={!body.trim()} loading={posting} size="sm" leftIcon={<Send className="w-3.5 h-3.5" />}>
              Send
            </Button>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : comments.length === 0 ? (
        <div className="text-center text-xs text-zinc-500 py-4">No comments yet.</div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2.5 group">
              <Avatar name={c.author?.full_name} src={c.author?.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-200">{c.author?.full_name || 'Unknown'}</span>
                  <span className="text-zinc-500">{formatDateTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-zinc-300 mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
              {profile?.id === c.author_id && (
                <button onClick={() => onDelete(c)} className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-rose-400 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
