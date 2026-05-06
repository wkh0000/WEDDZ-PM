import { useEffect, useState } from 'react'
import { Send, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Textarea from '@/components/ui/Textarea'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import { listProjectUpdates, addProjectUpdate } from '../api'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime } from '@/lib/format'

export default function ProjectUpdatesLog({ projectId }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setUpdates(await listProjectUpdates(projectId)) }
    catch (err) { toast.error(err.message || 'Failed to load updates') }
    finally { setLoading(false) }
  }

  async function onPost(e) {
    e?.preventDefault()
    if (!body.trim()) return
    setPosting(true)
    try {
      await addProjectUpdate(projectId, body.trim())
      setBody('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to post update')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onPost} className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            placeholder="Post a project update — what changed, what's blocked, what's next."
            className="!bg-white/[0.03]"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={onPost} disabled={!body.trim()} loading={posting} size="sm" leftIcon={<Send className="w-3.5 h-3.5" />}>
            Post update
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : updates.length === 0 ? (
        <EmptyState icon={Clock} title="No updates yet" description="Post the first update to start the project timeline." />
      ) : (
        <div className="space-y-3">
          {updates.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              className="glass rounded-2xl p-4 flex gap-3"
            >
              <Avatar name={u.author?.full_name} src={u.author?.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-200">{u.author?.full_name || 'Unknown'}</span>
                  <span className="text-zinc-500">{formatDateTime(u.created_at)}</span>
                </div>
                <p className="text-sm text-zinc-300 mt-1.5 whitespace-pre-wrap">{u.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
