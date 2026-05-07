import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, MoreHorizontal, Pencil, Trash2, CheckCircle2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import { listInvoices, deleteInvoice, markInvoicePaid } from '../api'
import InvoiceFormModal from '../components/InvoiceFormModal'
import { invoiceStatusBadge, INVOICE_STATUSES } from '../components/InvoiceStatusBadge'
import { cn } from '@/lib/cn'

export default function InvoicesListPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Invoices · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try { setItems(await listInvoices()) }
    catch (err) { toast.error(err.message || 'Failed to load invoices') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    let arr = items
    if (statusFilter !== 'all') arr = arr.filter(i => i.status === statusFilter)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) arr = arr.filter(i =>
      i.invoice_no?.toLowerCase().includes(q) ||
      i.customer?.name?.toLowerCase().includes(q) ||
      i.customer?.company?.toLowerCase().includes(q)
    )
    return arr
  }, [items, statusFilter, debouncedSearch])

  const totals = useMemo(() => ({
    total: filtered.reduce((s, i) => s + Number(i.total ?? 0), 0),
    unpaid: filtered.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total ?? 0), 0),
    paid: filtered.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total ?? 0), 0)
  }), [filtered])

  function openAdd() { setEditing(null); formDisc.onOpen() }
  function openEdit(inv) { setEditing(inv); formDisc.onOpen() }
  function askDelete(inv) { setDeleting(inv); confirmDisc.onOpen() }

  async function onMarkPaid(inv) {
    try {
      await markInvoicePaid(inv.id)
      toast.success(`${inv.invoice_no} marked as paid`)
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to mark paid')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteInvoice(deleting.id)
      toast.success('Invoice removed')
      setItems(arr => arr.filter(x => x.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Auto-numbered. Mark as paid creates the audit trail."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>New invoice</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryTile label="Filtered total" value={formatLKR(totals.total)} />
        <SummaryTile label="Unpaid"         value={formatLKR(totals.unpaid)} tone="amber" />
        <SummaryTile label="Paid"           value={formatLKR(totals.paid)}   tone="emerald" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Search by number, customer…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
          {INVOICE_STATUSES.map(s => (
            <FilterChip key={s.value} active={statusFilter === s.value} onClick={() => setStatusFilter(s.value)}>{s.label}</FilterChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search || statusFilter !== 'all' ? 'No matches' : 'No invoices yet'}
          description={search || statusFilter !== 'all' ? 'Try changing the filter.' : 'Create the first invoice to get started.'}
          action={!search && statusFilter === 'all' && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>New invoice</Button>}
        />
      ) : (
        <div>
          <Table>
            <THead>
              <TR>
                <TH>Number</TH><TH>Customer</TH><TH>Status</TH>
                <TH align="right">Total</TH><TH>Issued</TH><TH>Due</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map(i => (
                <TR key={i.id}>
                  <TD>
                    <Link to={`/invoices/${i.invoice_no}`} className="font-mono text-sm font-medium text-zinc-100 hover:text-indigo-300">{i.invoice_no}</Link>
                  </TD>
                  <TD className="text-zinc-300">{i.customer?.company || i.customer?.name || '—'}</TD>
                  <TD>{invoiceStatusBadge(i.status)}</TD>
                  <TD align="right">{formatLKR(i.total)}</TD>
                  <TD className="text-zinc-400">{formatDate(i.issue_date)}</TD>
                  <TD className="text-zinc-400">{formatDate(i.due_date)}</TD>
                  <TD align="right">
                    <DropdownMenu
                      trigger={
                        <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        { label: 'View / print', icon: FileText, onClick: () => navigate(`/invoices/${i.invoice_no}`) },
                        { label: 'Edit',         icon: Pencil,   onClick: () => openEdit(i) },
                        ...(i.status !== 'paid' ? [{ label: 'Mark as paid', icon: CheckCircle2, onClick: () => onMarkPaid(i) }] : []),
                        { separator: true },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(i) }
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <InvoiceFormModal open={formDisc.open} onClose={formDisc.onClose} invoice={editing} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this invoice?"
        description={deleting ? `${deleting.invoice_no} and its line items will be removed.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function SummaryTile({ label, value, tone }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={cn(
        'mt-1 text-xl font-semibold tabular-nums',
        tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-zinc-100'
      )}>{value}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
          : 'bg-white/[0.04] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
      )}
    >
      {children}
    </button>
  )
}
