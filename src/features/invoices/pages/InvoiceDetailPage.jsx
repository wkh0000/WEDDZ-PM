import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Printer, CheckCircle2, FileText } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate, formatDateTime, formatLKR } from '@/lib/format'
import { isUuid } from '@/lib/slug'
import { getInvoice, getInvoiceByNumber, listInvoiceItems, deleteInvoice, markInvoicePaid } from '../api'
import { invoiceStatusBadge } from '../components/InvoiceStatusBadge'
import InvoiceFormModal from '../components/InvoiceFormModal'

export default function InvoiceDetailPage() {
  const { invoiceNo } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [invoiceNo])
  useEffect(() => { document.title = `${invoice?.invoice_no ?? 'Invoice'} · WEDDZ PM` }, [invoice])

  async function load() {
    setLoading(true)
    try {
      // Backwards-compat: if the URL param looks like a UUID, fall back
      // to id-lookup and replace the URL with the canonical invoice_no.
      let inv
      if (isUuid(invoiceNo)) {
        inv = await getInvoice(invoiceNo)
        if (inv?.invoice_no) navigate(`/invoices/${inv.invoice_no}`, { replace: true })
      } else {
        inv = await getInvoiceByNumber(invoiceNo)
      }
      const its = await listInvoiceItems(inv.id)
      setInvoice(inv); setItems(its)
    } catch (err) {
      toast.error(err.message || 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }

  async function onMarkPaid() {
    if (!invoice) return
    try {
      const updated = await markInvoicePaid(invoice.id)
      setInvoice(prev => ({ ...prev, ...updated }))
      toast.success('Marked as paid')
    } catch (err) {
      toast.error(err.message || 'Failed to mark paid')
    }
  }

  async function onDelete() {
    if (!invoice) return
    setBusy(true)
    try {
      await deleteInvoice(invoice.id)
      toast.success('Invoice removed')
      navigate('/invoices')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
      setBusy(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!invoice) {
    return (
      <EmptyState
        icon={FileText}
        title="Invoice not found"
        description="This invoice may have been deleted."
        action={<Link to="/invoices"><Button leftIcon={<ArrowLeft className="w-4 h-4" />}>Back to invoices</Button></Link>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<Link to="/invoices" className="hover:text-zinc-300 inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Invoices</Link>}
        title={invoice.invoice_no}
        description={`Issued ${formatDate(invoice.issue_date)}${invoice.due_date ? ` · Due ${formatDate(invoice.due_date)}` : ''}`}
        actions={
          <>
            {invoice.status !== 'paid' && (
              <Button variant="success" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={onMarkPaid}>Mark paid</Button>
            )}
            <Link to={`/invoices/${invoice.invoice_no}/print`}>
              <Button variant="subtle" leftIcon={<Printer className="w-4 h-4" />}>Print</Button>
            </Link>
            <Button variant="subtle" leftIcon={<Pencil className="w-4 h-4" />} onClick={editDisc.onOpen}>Edit</Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={confirmDisc.onOpen}>Delete</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">Bill to</div>
              <div className="mt-1 text-zinc-100 font-medium">{invoice.customer?.company || invoice.customer?.name}</div>
              {invoice.customer?.email && <div className="text-sm text-zinc-400">{invoice.customer.email}</div>}
              {invoice.customer?.phone && <div className="text-sm text-zinc-400">{invoice.customer.phone}</div>}
              {invoice.customer?.address && <div className="text-sm text-zinc-400 whitespace-pre-line">{invoice.customer.address}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-zinc-500">Status</div>
              <div className="mt-1">{invoiceStatusBadge(invoice.status)}</div>
              {invoice.paid_at && <div className="mt-2 text-xs text-zinc-500">Paid {formatDateTime(invoice.paid_at)}</div>}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden mt-4">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-2 text-right">Amount</div>
            </div>
            <div className="divide-y divide-white/5">
              {items.map(it => (
                <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 text-sm">
                  <div className="col-span-6 text-zinc-100">{it.description}</div>
                  <div className="col-span-2 text-right text-zinc-300 tabular-nums">{Number(it.quantity).toLocaleString()}</div>
                  <div className="col-span-2 text-right text-zinc-300 tabular-nums">{formatLKR(it.unit_price)}</div>
                  <div className="col-span-2 text-right text-zinc-100 tabular-nums">{formatLKR(it.amount)}</div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">No line items</div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-2">
              <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Notes</div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-zinc-100 mb-4">Summary</h3>
          <div className="space-y-3 text-sm">
            <Row label="Subtotal" value={formatLKR(invoice.subtotal)} />
            <Row label={`Tax (${Number(invoice.tax_rate).toFixed(2)}%)`} value={formatLKR(invoice.tax_amount)} />
            <div className="border-t border-white/10 pt-3 flex items-center justify-between">
              <span className="font-semibold text-zinc-100">Total</span>
              <span className="text-xl font-semibold text-zinc-100 tabular-nums">{formatLKR(invoice.total)}</span>
            </div>
            {invoice.project && (
              <div className="border-t border-white/10 pt-3">
                <div className="text-xs text-zinc-500">Linked to project</div>
                <Link to={`/projects/${invoice.project.slug}`} className="text-indigo-300 hover:text-indigo-200">{invoice.project.name}</Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      <InvoiceFormModal open={editDisc.open} onClose={editDisc.onClose} invoice={invoice} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={onDelete}
        title="Delete this invoice?"
        description={`${invoice.invoice_no} and its line items will be permanently removed.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-100 tabular-nums">{value}</span>
    </div>
  )
}
