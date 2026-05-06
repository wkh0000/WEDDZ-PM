import { useEffect, useState, useRef } from 'react'
import { Paperclip, Upload, Trash2, ExternalLink, FileText } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { listAttachments, uploadAttachment, getAttachmentUrl, deleteAttachment } from '../api'
import { useToast } from '@/context/ToastContext'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export default function TaskAttachments({ taskId }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => { load() }, [taskId])

  async function load() {
    setLoading(true)
    try { setItems(await listAttachments(taskId)) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) { toast.error('Max attachment size is 10 MB'); return }
    setUploading(true)
    try {
      const created = await uploadAttachment(taskId, file)
      setItems(arr => [created, ...arr])
      toast.success('Attached')
    } catch (err) { toast.error(err.message) }
    finally { setUploading(false) }
  }

  async function open(att) {
    try {
      const url = await getAttachmentUrl(att.storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (err) { toast.error(err.message) }
  }

  async function remove(att) {
    try {
      await deleteAttachment(att)
      setItems(arr => arr.filter(x => x.id !== att.id))
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={onUpload} />
        <Button size="sm" variant="subtle" leftIcon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileRef.current?.click()} loading={uploading}>
          Upload
        </Button>
        <span className="text-xs text-zinc-500">Max 10 MB · any file type</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : items.length === 0 ? (
        <div className="text-center text-xs text-zinc-500 py-4">No attachments.</div>
      ) : (
        <div className="space-y-1.5">
          {items.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 group">
              <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{a.file_name}</div>
                <div className="text-[10px] text-zinc-500">{a.mime_type ?? 'file'} · {(a.size_bytes / 1024).toFixed(1)} KB</div>
              </div>
              <button onClick={() => open(a)} className="text-zinc-400 hover:text-zinc-200 p-1" title="Open"><ExternalLink className="w-3.5 h-3.5" /></button>
              <button onClick={() => remove(a)} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-400 p-1 transition" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
