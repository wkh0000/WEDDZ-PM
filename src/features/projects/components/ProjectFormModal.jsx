import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createProject, updateProject } from '../api'
import { listCustomers } from '@/features/customers/api'
import { useToast } from '@/context/ToastContext'
import { PROJECT_STATUSES } from './ProjectStatusBadge'

export default function ProjectFormModal({ open, onClose, project, defaultCustomerId, onSaved }) {
  const toast = useToast()
  const isEdit = !!project
  const [form, setForm] = useState(empty())
  const [customers, setCustomers] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(project ? { ...empty(), ...project, customer_id: project.customer_id ?? '' } : { ...empty(), customer_id: defaultCustomerId ?? '' })
      setErrors({})
      listCustomers().then(setCustomers).catch(() => setCustomers([]))
    }
  }, [open, project, defaultCustomerId])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.name?.trim()) errs.name = 'Name is required'
    if (form.budget !== '' && Number.isNaN(Number(form.budget))) errs.budget = 'Must be a number'
    if (form.start_date && form.end_date && form.end_date < form.start_date)
      errs.end_date = 'End date must be after start date'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        customer_id: form.customer_id || null,
        description: form.description?.trim() || null,
        status: form.status || 'planning',
        budget: form.budget === '' ? 0 : Number(form.budget),
        start_date: form.start_date || null,
        end_date: form.end_date || null
      }
      const saved = isEdit
        ? await updateProject(project.id, payload)
        : await createProject(payload)
      toast.success(isEdit ? 'Project updated' : 'Project created — default kanban columns added')
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
      title={isEdit ? 'Edit Project' : 'New Project'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Create project'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Name *" value={form.name} onChange={set('name')} error={errors.name} placeholder="Internal CRM revamp" autoFocus />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Customer"
            value={form.customer_id ?? ''}
            onChange={set('customer_id')}
            placeholder="None (internal)"
            options={customers.map(c => ({ value: c.id, label: c.company ? `${c.name} — ${c.company}` : c.name }))}
          />
          <Select
            label="Status"
            value={form.status ?? 'planning'}
            onChange={set('status')}
            options={PROJECT_STATUSES}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Budget (LKR)" type="number" prefix="LKR" value={form.budget} onChange={set('budget')} error={errors.budget} placeholder="0.00" min={0} step="0.01" />
          <Input label="Start date" type="date" value={form.start_date ?? ''} onChange={set('start_date')} />
          <Input label="End date" type="date" value={form.end_date ?? ''} onChange={set('end_date')} error={errors.end_date} />
        </div>
        <Textarea label="Description" value={form.description ?? ''} onChange={set('description')} placeholder="What does this project deliver?" rows={4} />
      </form>
    </Modal>
  )
}

function empty() {
  return {
    name: '',
    customer_id: '',
    description: '',
    status: 'planning',
    budget: '',
    start_date: '',
    end_date: ''
  }
}
