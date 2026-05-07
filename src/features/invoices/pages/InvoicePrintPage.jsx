import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Printer, ArrowLeft } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import { isUuid } from '@/lib/slug'
import { getInvoice, getInvoiceByNumber, listInvoiceItems } from '../api'
import { formatDate, formatLKR } from '@/lib/format'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'WEDDZ PM'

export default function InvoicePrintPage() {
  const { invoiceNo } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Invoice · Print'
    const lookup = isUuid(invoiceNo) ? getInvoice(invoiceNo) : getInvoiceByNumber(invoiceNo)
    lookup
      .then(inv => listInvoiceItems(inv.id).then(its => ({ inv, its })))
      .then(({ inv, its }) => { setInvoice(inv); setItems(its) })
      .finally(() => setLoading(false))
  }, [invoiceNo])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!invoice) return <div className="p-10 text-center text-zinc-400">Invoice not found.</div>

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:bg-white print:text-black p-6 sm:p-10 print:p-0">
      <div className="max-w-3xl mx-auto">
        {/* Toolbar — hidden in print */}
        <div className="no-print flex items-center justify-between mb-6">
          <Link to={`/invoices/${invoice.invoice_no}`} className="inline-flex items-center gap-1.5 text-sm text-zinc-700 hover:text-zinc-900">
            <ArrowLeft className="w-4 h-4" /> Back to invoice
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-8 print:border-0 print:p-6 print:shadow-none">
          <div className="flex items-start justify-between border-b border-zinc-200 pb-6">
            <div>
              <div className="font-bold text-2xl text-zinc-900">{APP_NAME}</div>
              <div className="text-sm text-zinc-600 mt-1">WEDDZ IT · Sri Lanka</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tracking-tight text-zinc-900">INVOICE</div>
              <div className="font-mono text-zinc-700 mt-1">{invoice.invoice_no}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-6 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">Bill to</div>
              <div className="font-semibold text-zinc-900">{invoice.customer?.company || invoice.customer?.name}</div>
              {invoice.customer?.company && invoice.customer?.name && (
                <div className="text-zinc-700">{invoice.customer.name}</div>
              )}
              {invoice.customer?.email && <div className="text-zinc-700">{invoice.customer.email}</div>}
              {invoice.customer?.phone && <div className="text-zinc-700">{invoice.customer.phone}</div>}
              {invoice.customer?.address && <div className="text-zinc-700 whitespace-pre-line">{invoice.customer.address}</div>}
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <Meta label="Issue date" value={formatDate(invoice.issue_date)} />
                <Meta label="Due date"   value={formatDate(invoice.due_date)} />
                <Meta label="Status"     value={invoice.status?.toUpperCase()} />
                {invoice.project && <Meta label="Project" value={invoice.project.name} />}
              </div>
            </div>
          </div>

          <table className="w-full mt-8 text-sm">
            <thead>
              <tr className="border-b border-zinc-300">
                <th className="text-left py-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">Description</th>
                <th className="text-right py-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">Qty</th>
                <th className="text-right py-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">Unit price</th>
                <th className="text-right py-2 text-xs uppercase tracking-wider text-zinc-500 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-zinc-100">
                  <td className="py-2.5 text-zinc-900">{it.description}</td>
                  <td className="py-2.5 text-right text-zinc-700 tabular-nums">{Number(it.quantity).toLocaleString()}</td>
                  <td className="py-2.5 text-right text-zinc-700 tabular-nums">{formatLKR(it.unit_price)}</td>
                  <td className="py-2.5 text-right text-zinc-900 tabular-nums">{formatLKR(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-72 text-sm space-y-1">
              <PrintRow label="Subtotal" value={formatLKR(invoice.subtotal)} />
              <PrintRow label={`Tax (${Number(invoice.tax_rate).toFixed(2)}%)`} value={formatLKR(invoice.tax_amount)} />
              <div className="border-t border-zinc-300 pt-2 mt-2 flex items-center justify-between">
                <span className="font-bold text-zinc-900">Total</span>
                <span className="text-xl font-bold text-zinc-900 tabular-nums">{formatLKR(invoice.total)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-8 pt-4 border-t border-zinc-200">
              <div className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">Notes</div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          <div className="mt-12 text-center text-xs text-zinc-500">
            Thank you for your business.
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
      <span className="text-zinc-900 font-medium">{value || '—'}</span>
    </div>
  )
}
function PrintRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-600">{label}</span>
      <span className="text-zinc-900 tabular-nums">{value}</span>
    </div>
  )
}
