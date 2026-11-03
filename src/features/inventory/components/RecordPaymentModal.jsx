import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { recordPayment, getDocument } from '../api'
import { formatRs } from '../lib/money'
import { invoicePaid, replacementChain, splitPaid } from '../lib/stock'
import { regenerateDocument, saveBytes } from '../docs'
import { useInventory } from '../pages/InventoryLayout'

const today = () => new Date().toISOString().slice(0, 10)

export default function RecordPaymentModal({ open, onClose, invoice, invoices, payments, onSaved }) {
  const toast = useToast()
  const { clients, locations } = useInventory()
  const [f, setF] = useState({})
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const chain = invoice ? replacementChain(invoice.id, invoices) : new Set()
  const prior = payments.filter(p => chain.has(p.invoice_id) && p.cheque_status !== 'bounced')
  const balance = invoice ? Math.round((Number(invoice.total) - invoicePaid(invoice.id, invoices, payments)) * 100) / 100 : 0
  const split = invoice ? splitPaid(invoice, prior) : null

  useEffect(() => {
    if (open && invoice) {
      setF({ paidOn: today(), receiptDate: '', amount: String(balance), method: '', chequeNo: '', softwareAmount: '', hardwareAmount: '',
        title: '', paymentDetail: '', invoiceDetail: '', thanksTitle: '', thanksBody: '', footnoteExtra: '' })
      setMore(false)
    }
  }, [open, invoice?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null
  const amount = Number(f.amount)
  const sw = f.softwareAmount === '' ? null : Number(f.softwareAmount)
  const hw = f.hardwareAmount === '' ? null : Number(f.hardwareAmount)
  const problem = !(amount > 0) ? 'Enter the amount received'
    : amount > balance ? `That is more than the balance due (${formatRs(balance)})`
    : (sw ?? 0) + (hw ?? 0) > amount ? 'The software/hardware split is more than the amount' : null

  async function submit() {
    if (problem) return
    setBusy(true)
    try {
      const meta = Object.fromEntries(Object.entries({
        payment_detail: f.paymentDetail, invoice_detail: f.invoiceDetail, thanks_title: f.thanksTitle,
        thanks_body: f.thanksBody, footnote_extra: f.footnoteExtra
      }).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v))
      const receiptId = await recordPayment({
        invoiceId: invoice.id, paidOn: f.paidOn, amount, method: f.method || null, chequeNo: f.method === 'cheque' ? f.chequeNo : null,
        softwareAmount: sw, hardwareAmount: hw, receiptDate: f.receiptDate || f.paidOn, title: f.title?.trim() || null, meta
      })
      const receipt = await getDocument(receiptId)
      try {
        const { bytes } = await regenerateDocument(receipt, { clients, locations })
        saveBytes(bytes, `${receipt.doc_no}.pdf`)
        toast.success(`${receipt.doc_no} issued — PDF downloaded`)
      } catch (err) { toast.error(`${receipt.doc_no} issued, but the PDF failed: ${err.message}`) }
      onSaved?.(); onClose()
    } catch (err) { toast.error(err.message || 'Could not record the payment') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} width="lg" title={`Record payment — ${invoice.doc_no}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!!problem}>Record & issue receipt</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/10 p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-zinc-400">Invoice total</span><span className="tabular-nums">{formatRs(invoice.total)}</span></div>
          {prior.map(p => (
            <div key={p.id} className="flex justify-between text-zinc-400">
              <span>{formatDate(p.paid_on)} · {p.receipt?.doc_no}{p.cheque_status === 'pending' ? ' · cheque pending' : ''}</span>
              <span className="tabular-nums">– {formatRs(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold border-t border-white/10 pt-1"><span>Balance due</span><span className="tabular-nums">{formatRs(balance)}</span></div>
          {split && Number(invoice.software_total) > 0 && Number(invoice.hardware_total) > 0 && (
            <div className="text-xs text-zinc-500">Software balance {formatRs(split.softwareBalance)} · Hardware balance {formatRs(split.hardwareBalance)}</div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Input label="Received on" type="date" value={f.paidOn ?? ''} onChange={e => set('paidOn', e.target.value)} />
          <Input label="Amount (Rs.)" type="number" min="0" step="0.01" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} />
          <Select label="Method" value={f.method ?? ''} onChange={e => set('method', e.target.value)}
            options={[{ value: '', label: 'Not recorded' }, { value: 'cash', label: 'Cash' }, { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }]} />
          {f.method === 'cheque' && <Input label="Cheque no. (optional)" value={f.chequeNo ?? ''} onChange={e => set('chequeNo', e.target.value)} />}
          <Input label="Towards software (optional)" type="number" min="0" value={f.softwareAmount ?? ''} onChange={e => set('softwareAmount', e.target.value)} hint="Blank = software first" />
          <Input label="Towards hardware (optional)" type="number" min="0" value={f.hardwareAmount ?? ''} onChange={e => set('hardwareAmount', e.target.value)} />
        </div>
        {f.method === 'cheque' && <p className="text-xs text-zinc-500">The receipt prints “Subject to realisation” until you mark the cheque cleared.</p>}

        <button type="button" className="text-xs text-indigo-300 hover:text-indigo-200" onClick={() => setMore(m => !m)}>{more ? 'Hide' : 'Show'} receipt wording</button>
        {more && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Receipt date" type="date" value={f.receiptDate ?? ''} onChange={e => set('receiptDate', e.target.value)} hint="Defaults to the payment date" />
              <Input label="Heading" value={f.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="Defaults to the project name" />
            </div>
            <Input label="Payment detail line" value={f.paymentDetail ?? ''} onChange={e => set('paymentDetail', e.target.value)} />
            <Input label="Invoice total detail" value={f.invoiceDetail ?? ''} onChange={e => set('invoiceDetail', e.target.value)} placeholder="e.g. Advance Rs. 760,000.00 + POS hardware Rs. 419,300.00" />
            <Input label="Thank-you heading" value={f.thanksTitle ?? ''} onChange={e => set('thanksTitle', e.target.value)} />
            <Textarea label="Thank-you text" rows={2} value={f.thanksBody ?? ''} onChange={e => set('thanksBody', e.target.value)} />
            <Textarea label="Extra footnote" rows={2} value={f.footnoteExtra ?? ''} onChange={e => set('footnoteExtra', e.target.value)} />
          </div>
        )}
        {problem && f.amount !== '' && <p className="text-sm text-rose-300">{problem}</p>}
      </div>
    </Modal>
  )
}
