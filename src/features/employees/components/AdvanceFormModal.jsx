import { useState, useEffect } from 'react'
import { Wallet } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { giveAdvance, listEmployees } from '../api'
import { useToast } from '@/context/ToastContext'
import { formatLKR } from '@/lib/format'

/**
 * Give a salary advance. Records the advance and logs a `Salary` expense
 * immediately (cash out now). The amount is auto-deducted from the
 * employee's salary when it's next marked paid.
 */
export default function AdvanceFormModal({ open, onClose, defaultEmployeeId, onSaved }) {
  const toast = useToast()
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(empty())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listEmployees({ activeOnly: true }).then(setEmployees).catch(() => setEmployees([]))
    setErrors({})
    setForm({ ...empty(), employee_id: defaultEmployeeId ?? '' })
  }, [open, defaultEmployeeId])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.employee_id) errs.employee_id = 'Employee is required'
    if (form.amount === '' || Number.isNaN(Number(form.amount)) || Number(form.amount) <= 0) errs.amount = 'Enter an amount above 0'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      await giveAdvance({
        employee_id: form.employee_id,
        amount: Number(form.amount),
        advance_date: form.advance_date || null,
        notes: form.notes?.trim() || null
      })
      toast.success('Advance recorded — a Salary expense was logged for it')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to record advance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Give salary advance"
      description="Logs a Salary expense now. Auto-deducted from the employee's salary when it's marked paid."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting} leftIcon={<Wallet className="w-4 h-4" />}>Record advance</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Select
          label="Employee *"
          value={form.employee_id}
          onChange={set('employee_id')}
          placeholder="Select an employee"
          error={errors.employee_id}
          options={employees.map(e => ({ value: e.id, label: e.full_name }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Amount (LKR) *" type="number" step="0.01" min="0" prefix="LKR" value={form.amount} onChange={set('amount')} error={errors.amount} />
          <Input label="Advance date" type="date" value={form.advance_date} onChange={set('advance_date')} hint="Defaults to today" />
        </div>
        {Number(form.amount) > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-sm text-amber-200/90">
            {formatLKR(Number(form.amount))} will be paid out now and deducted from the next paid salary.
          </div>
        )}
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={2} placeholder="Reason / reference (optional)" />
      </form>
    </Modal>
  )
}

function empty() {
  return { employee_id: '', amount: '', advance_date: '', notes: '' }
}
