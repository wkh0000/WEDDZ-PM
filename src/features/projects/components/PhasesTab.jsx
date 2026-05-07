import { useEffect, useState } from 'react'
import {
  Plus, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2, ListChecks, Send
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import {
  listProjectPhases, deletePhase, addDeliverable,
  updateDeliverable, deleteDeliverable, PHASE_STATUSES
} from '../api'
import PhaseFormModal from './PhaseFormModal'
import { cn } from '@/lib/cn'

const TONE_FOR_STATUS = Object.fromEntries(PHASE_STATUSES.map(s => [s.value, s.tone]))
const LABEL_FOR_STATUS = Object.fromEntries(PHASE_STATUSES.map(s => [s.value, s.label]))

export default function PhasesTab({ projectId }) {
  const toast = useToast()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [phases, setPhases] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => { load() }, [projectId])

  async function load() {
    setLoading(true)
    try { setPhases(await listProjectPhases(projectId)) }
    catch (err) { toast.error(err.message || 'Failed to load phases') }
    finally { setLoading(false) }
  }

  function toggle(id) {
    setExpanded(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deletePhase(deleting.id)
      toast.success('Phase removed')
      setPhases(arr => arr.filter(p => p.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  // Aggregate progress across phases
  const allDeliverables = phases.flatMap(p => p.deliverables ?? [])
  const totalDeliv = allDeliverables.length
  const doneDeliv = allDeliverables.filter(d => d.done).length
  const completed = phases.filter(p => p.status === 'completed').length

  return (
    <div className="space-y-4">
      {/* Summary */}
      {phases.length > 0 && (
        <Card padded={false} className="!bg-white/[0.03]">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10">
            <SummaryCell label="Phases" value={phases.length} />
            <SummaryCell label="Completed" value={`${completed}/${phases.length}`} tone={completed === phases.length ? 'emerald' : undefined} />
            <SummaryCell label="Deliverables" value={totalDeliv === 0 ? '—' : `${doneDeliv}/${totalDeliv}`} />
            <SummaryCell
              label="Total milestones"
              value={formatLKR(phases.reduce((s, p) => s + Number(p.amount ?? 0), 0))}
            />
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Project phases</h3>
        <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); formDisc.onOpen() }}>
          Add phase
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : phases.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No phases yet"
          description="Break the project into delivery phases with milestones and deliverables."
          action={
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); formDisc.onOpen() }}>
              Add the first phase
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {phases.map((phase, i) => (
            <PhaseCard
              key={phase.id}
              index={i}
              phase={phase}
              expanded={expanded.has(phase.id)}
              onToggle={() => toggle(phase.id)}
              onEdit={() => { setEditing(phase); formDisc.onOpen() }}
              onDelete={() => { setDeleting(phase); confirmDisc.onOpen() }}
              onChanged={load}
            />
          ))}
        </div>
      )}

      <PhaseFormModal
        open={formDisc.open}
        onClose={formDisc.onClose}
        projectId={projectId}
        phase={editing}
        onSaved={load}
      />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this phase?"
        description={deleting ? `"${deleting.name}" and its deliverables will be permanently removed.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function SummaryCell({ label, value, tone }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums', tone === 'emerald' ? 'text-emerald-300' : 'text-zinc-100')}>{value}</div>
    </div>
  )
}

function PhaseCard({ phase, index, expanded, onToggle, onEdit, onDelete, onChanged }) {
  const toast = useToast()
  const [deliverables, setDeliverables] = useState(phase.deliverables ?? [])
  const [newDeliv, setNewDeliv] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => { setDeliverables(phase.deliverables ?? []) }, [phase])

  const total = deliverables.length
  const done = deliverables.filter(d => d.done).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  async function toggleDone(d) {
    const optimistic = !d.done
    setDeliverables(arr => arr.map(x => x.id === d.id ? { ...x, done: optimistic } : x))
    try { await updateDeliverable(d.id, { done: optimistic }) }
    catch (err) {
      setDeliverables(arr => arr.map(x => x.id === d.id ? { ...x, done: d.done } : x))
      toast.error(err.message || 'Failed')
    }
  }

  async function removeDeliv(d) {
    const prev = deliverables
    setDeliverables(arr => arr.filter(x => x.id !== d.id))
    try { await deleteDeliverable(d.id) }
    catch (err) { setDeliverables(prev); toast.error(err.message || 'Failed') }
  }

  async function addDeliv(e) {
    e?.preventDefault()
    const v = newDeliv.trim()
    if (!v) return
    setAdding(true)
    try {
      const created = await addDeliverable(phase.id, v)
      setDeliverables(arr => [...arr, created])
      setNewDeliv('')
    } catch (err) { toast.error(err.message || 'Failed') }
    finally { setAdding(false) }
  }

  const tone = TONE_FOR_STATUS[phase.status] ?? 'default'

  return (
    <Card padded={false} className="overflow-hidden hover:border-white/15 transition-colors">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
      >
        <span className="shrink-0 mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 tabular-nums">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-zinc-100">{phase.name}</span>
            <Badge tone={tone} dot>{LABEL_FOR_STATUS[phase.status] ?? phase.status}</Badge>
            {phase.amount != null && (
              <span className="text-xs text-zinc-300 tabular-nums">· {formatLKR(phase.amount)}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {phase.start_date && <span>{formatDate(phase.start_date)}</span>}
            {phase.start_date && phase.end_date && <span>→</span>}
            {phase.end_date && <span>{formatDate(phase.end_date)}</span>}
            {total > 0 && (
              <>
                <span>·</span>
                <span className={done === total ? 'text-emerald-400' : ''}>
                  {done}/{total} deliverables
                </span>
              </>
            )}
          </div>
          {total > 0 && (
            <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className={cn('h-full transition-all', done === total ? 'bg-emerald-400' : 'bg-indigo-400/70')}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            trigger={
              <span className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200 inline-flex">
                <MoreHorizontal className="w-4 h-4" />
              </span>
            }
            items={[
              { label: 'Edit phase', icon: Pencil, onClick: onEdit },
              { separator: true },
              { label: 'Delete phase', icon: Trash2, danger: true, onClick: onDelete }
            ]}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-t border-white/10 bg-white/[0.02] overflow-hidden"
          >
            <div className="px-4 py-3 space-y-3">
              {phase.description && (
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{phase.description}</p>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Deliverables</div>
                {deliverables.length === 0 && (
                  <div className="text-xs text-zinc-500 italic mb-2">None yet — add what needs to ship in this phase.</div>
                )}
                <div className="space-y-1">
                  {deliverables.map(d => (
                    <div key={d.id} className="flex items-start gap-2 group px-1 py-1 rounded hover:bg-white/[0.03]">
                      <input
                        type="checkbox"
                        checked={d.done}
                        onChange={() => toggleDone(d)}
                        className="w-4 h-4 mt-0.5 accent-indigo-500 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-sm', d.done ? 'line-through text-zinc-500' : 'text-zinc-200')}>{d.body}</div>
                        {d.verification && (
                          <div className="text-[11px] text-zinc-500 italic mt-0.5">Verify: {d.verification}</div>
                        )}
                      </div>
                      <button
                        onClick={() => removeDeliv(d)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 p-1 transition"
                        aria-label="Delete deliverable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={addDeliv} className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  <Plus className="w-4 h-4 text-zinc-500" />
                  <input
                    value={newDeliv}
                    onChange={e => setNewDeliv(e.target.value)}
                    placeholder="Add a deliverable…"
                    className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none border-b border-transparent focus:border-white/15 py-1"
                  />
                  {newDeliv && (
                    <button
                      type="submit"
                      disabled={adding}
                      className="text-xs px-2 py-1 rounded-md bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/25"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  )}
                </form>
              </div>

              {phase.notes && (
                <div className="pt-2 border-t border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Notes</div>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{phase.notes}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
