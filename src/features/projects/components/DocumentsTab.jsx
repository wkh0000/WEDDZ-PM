import { useEffect, useState, useMemo } from 'react'
import {
  Plus, FileText, ExternalLink, Download, MoreHorizontal,
  Pencil, Trash2, Search, FileSearch
} from 'lucide-react'
import { motion } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import {
  listProjectDocuments, deleteDocument, getDocumentSignedUrl,
  DOCUMENT_KINDS
} from '../api'
import DocumentFormModal from './DocumentFormModal'
import { cn } from '@/lib/cn'

const TONE_FOR_KIND = Object.fromEntries(DOCUMENT_KINDS.map(k => [k.value, k.tone]))
const LABEL_FOR_KIND = Object.fromEntries(DOCUMENT_KINDS.map(k => [k.value, k.label]))

export default function DocumentsTab({ projectId }) {
  const toast = useToast()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setDocs(await listProjectDocuments(projectId)) }
    catch (err) { toast.error(err.message || 'Failed to load documents') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    let arr = docs
    if (kindFilter !== 'all') arr = arr.filter(d => d.kind === kindFilter)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) arr = arr.filter(d =>
      d.title?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.version?.toLowerCase().includes(q) ||
      d.notes?.toLowerCase().includes(q)
    )
    return arr
  }, [docs, kindFilter, debouncedSearch])

  // Quick stats per kind for the filter chips
  const counts = useMemo(() => {
    const out = { all: docs.length }
    for (const k of DOCUMENT_KINDS) out[k.value] = 0
    for (const d of docs) out[d.kind] = (out[d.kind] ?? 0) + 1
    return out
  }, [docs])

  async function onOpenDoc(doc) {
    if (doc.external_url) {
      window.open(doc.external_url, '_blank', 'noopener')
      return
    }
    if (doc.storage_path) {
      try {
        const url = await getDocumentSignedUrl(doc.storage_path)
        window.open(url, '_blank', 'noopener')
      } catch (err) { toast.error(err.message || 'Could not open') }
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteDocument(deleting)
      toast.success('Document removed')
      setDocs(arr => arr.filter(d => d.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Documents</h3>
        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); formDisc.onOpen() }}>
          Add document
        </Button>
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input
            leftIcon={<Search className="w-4 h-4" />}
            placeholder="Search by title, version, notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={kindFilter === 'all'} onClick={() => setKindFilter('all')} count={counts.all}>All</Chip>
          {DOCUMENT_KINDS.filter(k => counts[k.value] > 0 || kindFilter === k.value).map(k => (
            <Chip key={k.value} active={kindFilter === k.value} onClick={() => setKindFilter(k.value)} count={counts[k.value]}>
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title={search || kindFilter !== 'all' ? 'No matches' : 'No documents yet'}
          description={search || kindFilter !== 'all'
            ? 'Try a different filter or query.'
            : 'Track contracts, quotations, invoices, requirements, and more — all in one place.'}
          action={!search && kindFilter === 'all' && (
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); formDisc.onOpen() }}>
              Add the first document
            </Button>
          )}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          {filtered.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              onOpen={() => onOpenDoc(doc)}
              onEdit={() => { setEditing(doc); formDisc.onOpen() }}
              onDelete={() => { setDeleting(doc); confirmDisc.onOpen() }}
            />
          ))}
        </motion.div>
      )}

      <DocumentFormModal
        open={formDisc.open}
        onClose={formDisc.onClose}
        projectId={projectId}
        document={editing}
        onSaved={load}
      />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this document?"
        description={deleting ? `"${deleting.title}" will be permanently removed${deleting.storage_path ? ' (including the attached file)' : ''}.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function Chip({ active, onClick, count, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-colors',
        active
          ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
          : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
      )}
    >
      {children}
      {count != null && count > 0 && (
        <span className={cn('text-[10px] tabular-nums', active ? 'text-indigo-300' : 'text-zinc-500')}>{count}</span>
      )}
    </button>
  )
}

function DocRow({ doc, onOpen, onEdit, onDelete }) {
  const tone = TONE_FOR_KIND[doc.kind] ?? 'default'
  const label = LABEL_FOR_KIND[doc.kind] ?? doc.kind
  const hasFile = !!doc.storage_path
  const hasUrl  = !!doc.external_url

  return (
    <Card padded={false} className="hover:border-white/15 transition-colors">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <FileText className="w-4 h-4 text-indigo-300" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={tone}>{label}</Badge>
            <span className="font-medium text-zinc-100 truncate">{doc.title}</span>
            {doc.version && <span className="text-xs text-zinc-500">{doc.version}</span>}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{formatDate(doc.doc_date)}</span>
            {doc.amount != null && (
              <>
                <span>·</span>
                <span className="text-zinc-300 tabular-nums">{formatLKR(doc.amount)}</span>
              </>
            )}
            {hasFile && (
              <>
                <span>·</span>
                <span>{doc.file_name} ({(doc.size_bytes / 1024).toFixed(1)} KB)</span>
              </>
            )}
            {hasUrl && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-0.5"><ExternalLink className="w-3 h-3" />link</span>
              </>
            )}
            {doc.author?.full_name && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Avatar name={doc.author.full_name} src={doc.author.avatar_url} size="xs" />
                  {doc.author.full_name}
                </span>
              </>
            )}
          </div>
          {doc.description && (
            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{doc.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(hasFile || hasUrl) && (
            <button
              onClick={onOpen}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
              title={hasUrl ? 'Open link' : 'Open file'}
            >
              {hasUrl ? <ExternalLink className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            </button>
          )}
          <DropdownMenu
            trigger={
              <button className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
            items={[
              { label: 'Edit', icon: Pencil, onClick: onEdit },
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onClick: onDelete }
            ]}
          />
        </div>
      </div>
    </Card>
  )
}
