import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createExpense, updateExpense, EXPENSE_CATEGORIES } from '../api'
import { useToast } from '@/context/ToastContext'
import { listProjects } from '@/features/projects/api'

export default function ExpenseFormModal({ open, onClose, expense, defaultProjectId, onSaved }) {
  const toast = useToast()
  const isEdit = !!expense
  const [form, setForm] = useState(empty())
  const [projects, setProjects] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    listProjects().then(setProjects).catch(() => setProjects([]))
    setErrors({})
    if (expense) {
      setForm({
        description: expense.description ?? '',
        amount: expense.amount ?? '',
        category: expense.category ?? 'Other',
        expense_date: expense.expense_date ?? today(),
        project_id: expense.project_id ?? '',
        notes: expense.notes ?? ''
      })
    } else {
      setForm({ ...empty(), project_id: defaultProjectId ?? '', expense_date: today() })
    }
  }, [open, expense, defaultProjectId])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.description?.trim()) errs.description = 'Description is required'
    if (form.amount === '' || Number.isNaN(Number(form.amount))) errs.amount = 'Amount is required'
    else if (Number(form.amount) < 0) errs.amount = 'Must be ≥ 0'
    if (!form.category) errs.category = 'Category is required'
    if (!form.expense_date) errs.expense_date = 'Date is required'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const payload = {
        description: form.description.trim(),
        amount: Number(form.amount),
        category: form.category,
        expense_date: form.expense_date,
        project_id: form.project_id || null,
        notes: form.notes?.trim() || null
      }
      const saved = isEdit
        ? await updateExpense(expense.id, payload)
        : await createExpense(payload)
      toast.success(isEdit ? 'Expense updated' : 'Expense added')
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
      title={isEdit ? 'Edit Expense' : 'New Expense'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add expense'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Description *"
          value={form.description}
          onChange={set('description')}
          error={errors.description}
          placeholder="e.g. Notion subscription · April"
          autoFocus
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Amount (LKR) *"
            type="number" step="0.01" min="0"
            prefix="LKR"
            value={form.amount}
            onChange={set('amount')}
            error={errors.amount}
            placeholder="0.00"
          />
          <Select
            label="Category *"
            value={form.category}
            onChange={set('category')}
            error={errors.category}
            options={EXPENSE_CATEGORIES.map(c => ({ value: c, label: c }))}
          />
          <Input
            label="Date *"
            type="date"
            value={form.expense_date}
            onChange={set('expense_date')}
            error={errors.expense_date}
          />
        </div>
        <Select
          label="Project (optional)"
          value={form.project_id ?? ''}
          onChange={set('project_id')}
          placeholder="General (not linked to a project)"
          options={projects.map(p => ({ value: p.id, label: p.name }))}
          hint="Leave blank for general/admin expenses."
        />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} rows={3} placeholder="Optional context" />
      </form>
    </Modal>
  )
}

function empty() {
  return { description: '', amount: '', category: 'Other', expense_date: '', project_id: '', notes: '' }
}
function today() { return new Date().toISOString().slice(0, 10) }
