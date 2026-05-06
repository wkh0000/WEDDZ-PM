import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { createSalary, updateSalary, listEmployees } from '../api'
import { useToast } from '@/context/ToastContext'
import { formatLKR } from '@/lib/format'

export default function SalaryFormModal({ open, onClose, salary, defaultPeriod, onSaved }) {
  const toast = useToast()
  const isEdit = !!salary
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(empty())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listEmployees({ activeOnly: true }).then(setEmployees).catch(() => setEmployees([]))
    setErrors({})
    if (salary) {
      setForm({
        employee_id: salary.employee_id ?? '',
        period_year: salary.period_year,
        period_month: salary.period_month,
        amount: salary.amount ?? 0,
        bonus: salary.bonus ?? 0,
        deductions: salary.deductions ?? 0,
        notes: salary.notes ?? ''
      })
    } else {
      const d = new Date()
      setForm({
        ...empty(),
        period_year: defaultPeriod?.year ?? d.getFullYear(),
        period_month: defaultPeriod?.month ?? d.getMonth() + 1
      })
    }
  }, [open, salary, defaultPeriod])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  const net = Number(form.amount ?? 0) + Number(form.bonus ?? 0) - Number(form.deductions ?? 0)

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.employee_id) errs.employee_id = 'Employee is required'
    if (form.amount === '' || Number.isNaN(Number(form.amount))) errs.amount = 'Required'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const payload = {
        employee_id: form.employee_id,
        period_year: Number(form.period_year),
        period_month: Number(form.period_month),
        amount: Number(form.amount),
        bonus: Number(form.bonus ?? 0),
        deductions: Number(form.deductions ?? 0),
        notes: form.notes?.trim() || null
      }
      const saved = isEdit
        ? await updateSalary(salary.id, payload)
        : await createSalary(payload)
      toast.success(isEdit ? 'Salary updated' : 'Salary added')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1, label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' })
  }))
  const years = Array.from({ length: 6 }, (_, i) => ({
    value: new Date().getFullYear() - 2 + i, label: String(new Date().getFullYear() - 2 + i)
  }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Salary' : 'Add Salary'}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add salary'}</Button>
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
          disabled={isEdit}
          options={employees.map(e => ({ value: e.id, label: e.full_name }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Year" value={form.period_year} onChange={set('period_year')} options={years} disabled={isEdit} />
          <Select label="Month" value={form.period_month} onChange={set('period_month')} options={months} disabled={isEdit} />
        </div>
        <Input label="Amount (LKR) *" type="number" step="0.01" min="0" prefix="LKR" value={form.amount} onChange={set('amount')} error={errors.amount} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Bonus" type="number" step="0.01" min="0" prefix="LKR" value={form.bonus} onChange={set('bonus')} />
          <Input label="Deductions" type="number" step="0.01" min="0" prefix="LKR" value={form.deductions} onChange={set('deductions')} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 flex items-center justify-between">
          <span className="text-sm text-zinc-400">Net amount</span>
          <span className="text-lg font-semibold text-zinc-100 tabular-nums">{formatLKR(net)}</span>
        </div>
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  )
}

function empty() {
  return { employee_id: '', period_year: '', period_month: '', amount: 0, bonus: 0, deductions: 0, notes: '' }
}
