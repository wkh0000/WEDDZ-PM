import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { useToast } from '@/context/ToastContext'
import { createPhase, updatePhase, PHASE_STATUSES } from '../api'

export default function PhaseFormModal({ open, onClose, projectId, phase, onSaved }) {
  const toast = useToast()
  const isEdit = !!phase
  const [form, setForm] = useState(empty())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(phase ? { ...empty(), ...phase, amount: phase.amount ?? '' } : empty())
  }, [open, phase])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.name?.trim()) errs.name = 'Name is required'
    if (form.start_date && form.end_date && form.end_date < form.start_date) errs.end_date = 'End must be after start'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description?.trim() || null,
        status: form.status || 'not_started',
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        amount: form.amount === '' || form.amount == null ? null : Number(form.amount),
        notes: form.notes?.trim() || null
      }
      const saved = isEdit
        ? await updatePhase(phase.id, payload)
        : await createPhase({ projectId, ...payload })
      toast.success(isEdit ? 'Phase updated' : 'Phase added')
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
      title={isEdit ? 'Edit Phase' : 'Add Phase'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add phase'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Name *"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          placeholder="Phase 1 — Discovery & Launch MVP"
          autoFocus
        />
        <Textarea
          label="Description"
          value={form.description ?? ''}
          onChange={set('description')}
          rows={3}
          placeholder="Business goal, scope, constraints…"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Status"
            value={form.status ?? 'not_started'}
            onChange={set('status')}
            options={PHASE_STATUSES}
          />
          <Input
            label="Start date"
            type="date"
            value={form.start_date ?? ''}
            onChange={set('start_date')}
          />
          <Input
            label="End date"
            type="date"
            value={form.end_date ?? ''}
            onChange={set('end_date')}
            error={errors.end_date}
          />
        </div>
        <Input
          label="Milestone amount (LKR)"
          type="number" step="0.01" min="0" prefix="LKR"
          value={form.amount}
          onChange={set('amount')}
          hint="Optional — payment milestone tied to this phase."
        />
        <Textarea label="Notes" value={form.notes ?? ''} onChange={set('notes')} rows={2} />
      </form>
    </Modal>
  )
}

function empty() {
  return {
    name: '', description: '', status: 'not_started',
    start_date: '', end_date: '', amount: '', notes: ''
  }
}
