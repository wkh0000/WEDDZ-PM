import { useState, useEffect, useRef } from 'react'
import { Upload, ExternalLink as LinkIcon, FileText, Download, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { useToast } from '@/context/ToastContext'
import { createDocument, updateDocument, getDocumentSignedUrl, DOCUMENT_KINDS } from '../api'

const MAX_BYTES = 10 * 1024 * 1024  // 10 MB

export default function DocumentFormModal({ open, onClose, projectId, document, onSaved }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const isEdit = !!document
  const [form, setForm] = useState(empty())
  // file values:
  //   undefined → no change (keep whatever's stored)
  //   File      → upload as replacement (or initial in create mode)
  //   null      → explicitly detach (edit mode only)
  const [file, setFile] = useState(undefined)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({}); setFile(undefined)
    setForm(document ? { ...empty(), ...document, amount: document.amount ?? '' } : empty())
  }, [open, document])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  function onPickFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_BYTES) { toast.error('Max 10 MB per file'); return }
    setFile(f)
  }

  async function onDownloadExisting() {
    if (!document?.storage_path) return
    setDownloading(true)
    try {
      const url = await getDocumentSignedUrl(document.storage_path, 60 * 5)
      // Trigger download — we open in a new tab so the browser handles
      // PDFs / images natively. The signed URL respects the original filename.
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err.message || 'Failed to fetch download link')
    } finally {
      setDownloading(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.title?.trim()) errs.title = 'Title is required'
    if (!form.kind) errs.kind = 'Kind is required'
    if (!form.doc_date) errs.doc_date = 'Date is required'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      if (isEdit) {
        const saved = await updateDocument(document.id, {
          kind: form.kind,
          title: form.title.trim(),
          description: form.description?.trim() || null,
          doc_date: form.doc_date,
          amount: form.amount === '' || form.amount == null ? null : Number(form.amount),
          version: form.version || null,
          external_url: form.external_url || null,
          notes: form.notes?.trim() || null,
          // Only forward `file` when the user actually changed it. `undefined`
          // means "no change" and the API skips storage work.
          ...(file !== undefined ? { file } : {})
        })
        toast.success('Document updated')
        onSaved?.(saved)
      } else {
        const created = await createDocument({
          projectId,
          kind: form.kind,
          title: form.title.trim(),
          description: form.description?.trim() || null,
          doc_date: form.doc_date,
          amount: form.amount === '' || form.amount == null ? null : Number(form.amount),
          version: form.version || null,
          external_url: form.external_url || null,
          notes: form.notes?.trim() || null,
          file
        })
        toast.success('Document added')
        onSaved?.(created)
      }
      onClose()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Document' : 'Add Document'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add document'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Kind *"
            value={form.kind ?? 'other'}
            onChange={set('kind')}
            error={errors.kind}
            options={DOCUMENT_KINDS}
          />
          <Input
            label="Date *"
            type="date"
            value={form.doc_date ?? ''}
            onChange={set('doc_date')}
            error={errors.doc_date}
          />
          <Input
            label="Version"
            value={form.version ?? ''}
            onChange={set('version')}
            placeholder="v1, v2.1, draft"
          />
        </div>
        <Input
          label="Title *"
          value={form.title}
          onChange={set('title')}
          error={errors.title}
          placeholder="OnScene Phase Plan v3"
          autoFocus
        />
        <Input
          label="Amount (LKR)"
          type="number" step="0.01" min="0" prefix="LKR"
          value={form.amount}
          onChange={set('amount')}
          hint="Optional — for quotations / invoices / contracts."
        />
        <Textarea
          label="Description"
          value={form.description ?? ''}
          onChange={set('description')}
          rows={2}
        />

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Attachment (one of)</div>

          {/* Existing file — only visible in edit mode when a file is currently
              attached AND the user hasn't already picked a replacement / detached. */}
          {isEdit && document?.storage_path && file === undefined && (
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="text-xs text-zinc-200 truncate flex-1" title={document.file_name}>
                {document.file_name}
                {document.size_bytes ? <span className="text-zinc-500"> · {(document.size_bytes / 1024).toFixed(1)} KB</span> : null}
              </span>
              <button
                type="button"
                onClick={onDownloadExisting}
                disabled={downloading}
                className="inline-flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-50"
                title="Download / open"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-zinc-500 hover:text-rose-400 inline-flex items-center gap-1"
                title="Detach file"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* New file picker — works in both modes */}
          <div className="flex items-start gap-2 flex-wrap">
            <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
            <Button
              type="button"
              size="sm"
              variant="subtle"
              leftIcon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => fileRef.current?.click()}
            >
              {file instanceof File
                ? 'Change file'
                : (isEdit && document?.storage_path && file !== null) ? 'Replace file' : 'Upload file'}
            </Button>
            {file instanceof File && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-300 bg-white/[0.04] border border-white/10 rounded-md px-2 py-1">
                <FileText className="w-3 h-3" /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                <button type="button" onClick={() => setFile(undefined)} className="ml-1 text-zinc-500 hover:text-rose-400">×</button>
              </span>
            )}
            {file === null && (
              <span className="inline-flex items-center gap-1 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-2 py-1">
                Will detach existing file
                <button type="button" onClick={() => setFile(undefined)} className="ml-1 text-zinc-500 hover:text-zinc-300">×</button>
              </span>
            )}
          </div>

          <div className="text-xs text-zinc-500 text-center">— or —</div>
          <Input
            leftIcon={<LinkIcon className="w-4 h-4" />}
            value={form.external_url ?? ''}
            onChange={set('external_url')}
            placeholder="https://drive.google.com/… or any URL"
          />
          <p className="text-[11px] text-zinc-500">Max 10 MB per file. Use a URL for larger files (Drive, Notion, etc.).</p>
        </div>
        <Textarea label="Notes" value={form.notes ?? ''} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  )
}

function empty() {
  return { kind: 'quotation', title: '', description: '', doc_date: today(), amount: '', version: '', external_url: '', notes: '' }
}
function today() { return new Date().toISOString().slice(0, 10) }
