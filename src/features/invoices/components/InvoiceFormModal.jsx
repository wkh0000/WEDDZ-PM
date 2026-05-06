import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import InvoiceLineItems from './InvoiceLineItems'
import { useToast } from '@/context/ToastContext'
import { listCustomers } from '@/features/customers/api'
import { listProjects } from '@/features/projects/api'
import { createInvoice, updateInvoice, listInvoiceItems, nextInvoiceNumber } from '../api'
import { INVOICE_STATUSES } from './InvoiceStatusBadge'

export default function InvoiceFormModal({ open, onClose, invoice, onSaved }) {
  const toast = useToast()
  const isEdit = !!invoice
  const [form, setForm] = useState(empty())
  const [customers, setCustomers] = useState([])
  const [projects, setProjects] = useState([])
  const [items, setItems] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    Promise.all([listCustomers(), listProjects()]).then(([cs, ps]) => {
      setCustomers(cs); setProjects(ps)
    }).catch(() => {})
    if (invoice) {
      setForm({
        invoice_no: invoice.invoice_no,
        customer_id: invoice.customer_id ?? '',
        project_id: invoice.project_id ?? '',
        issue_date: invoice.issue_date ?? today(),
        due_date: invoice.due_date ?? '',
        status: invoice.status ?? 'draft',
        tax_rate: invoice.tax_rate ?? 0,
        notes: invoice.notes ?? ''
      })
      listInvoiceItems(invoice.id).then(setItems).catch(() => setItems([]))
    } else {
      // fetch a fresh invoice number
      nextInvoiceNumber().then(no => {
        setForm({ ...empty(), invoice_no: no, issue_date: today() })
      }).catch(() => setForm({ ...empty(), invoice_no: 'INV-PENDING', issue_date: today() }))
      setItems([{ description: '', quantity: 1, unit_price: 0, amount: 0 }])
    }
  }, [open, invoice])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.customer_id) errs.customer_id = 'Customer is required'
    if (!form.issue_date) errs.issue_date = 'Issue date is required'
    if (form.due_date && form.due_date < form.issue_date) errs.due_date = 'Due date must be after issue date'
    if (items.length === 0) errs.items = 'Add at least one line item'
    setErrors(errs)
    if (Object.keys(errs).length) {
      if (errs.items) toast.error(errs.items)
      return
    }

    const subtotal = items.reduce((s, it) => s + Number(it.amount ?? 0), 0)
    const tax_amount = +(subtotal * (Number(form.tax_rate ?? 0) / 100)).toFixed(2)
    const total = subtotal + tax_amount

    const payload = {
      invoice_no: form.invoice_no,
      customer_id: form.customer_id,
      project_id: form.project_id || null,
      issue_date: form.issue_date,
      due_date: form.due_date || null,
      status: form.status,
      tax_rate: Number(form.tax_rate ?? 0),
      tax_amount, subtotal, total,
      notes: form.notes?.trim() || null
    }

    setSubmitting(true)
    try {
      const saved = isEdit
        ? await updateInvoice({ id: invoice.id, invoice: payload, items })
        : await createInvoice({ invoice: payload, items })
      toast.success(isEdit ? 'Invoice updated' : `Invoice ${saved.invoice_no} created`)
      onSaved?.(saved)
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
      title={isEdit ? `Edit ${invoice.invoice_no}` : 'New Invoice'}
      width="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Create invoice'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Invoice number" value={form.invoice_no} disabled hint="Auto-generated" />
          <Select
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={INVOICE_STATUSES}
          />
          <Input
            label="Tax rate %"
            type="number" step="0.01" min="0" max="100"
            value={form.tax_rate}
            onChange={set('tax_rate')}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Customer *"
            value={form.customer_id}
            onChange={set('customer_id')}
            placeholder="Select a customer"
            error={errors.customer_id}
            options={customers.map(c => ({ value: c.id, label: c.company ? `${c.name} — ${c.company}` : c.name }))}
          />
          <Select
            label="Project (optional)"
            value={form.project_id}
            onChange={set('project_id')}
            placeholder="None"
            options={projects.filter(p => !form.customer_id || p.customer_id === form.customer_id).map(p => ({ value: p.id, label: p.name }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Issue date *" type="date" value={form.issue_date} onChange={set('issue_date')} error={errors.issue_date} />
          <Input label="Due date" type="date" value={form.due_date} onChange={set('due_date')} error={errors.due_date} />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide mb-2">Line items</label>
          <InvoiceLineItems
            items={items}
            onChange={setItems}
            taxRate={form.tax_rate}
            onTaxRateChange={(v) => setForm(f => ({ ...f, tax_rate: v }))}
          />
        </div>

        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={3} placeholder="Payment terms, references, etc." />
      </form>
    </Modal>
  )
}

function empty() {
  return {
    invoice_no: '',
    customer_id: '',
    project_id: '',
    issue_date: '',
    due_date: '',
    status: 'draft',
    tax_rate: 0,
    notes: ''
  }
}

function today() { return new Date().toISOString().slice(0, 10) }
