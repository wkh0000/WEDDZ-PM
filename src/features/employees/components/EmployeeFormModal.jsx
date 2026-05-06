import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createEmployee, updateEmployee, EMPLOYMENT_TYPES } from '../api'
import { useToast } from '@/context/ToastContext'

export default function EmployeeFormModal({ open, onClose, employee, onSaved }) {
  const toast = useToast()
  const isEdit = !!employee
  const [form, setForm] = useState(empty())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(employee ? { ...empty(), ...employee, base_salary: employee.base_salary ?? '' } : empty())
      setErrors({})
    }
  }, [open, employee])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.full_name?.trim()) errs.full_name = 'Name is required'
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Invalid email'
    if (form.base_salary === '' || Number.isNaN(Number(form.base_salary))) errs.base_salary = 'Must be a number'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        role: form.role?.trim() || null,
        employment_type: form.employment_type || 'full_time',
        base_salary: Number(form.base_salary || 0),
        joined_on: form.joined_on || null,
        active: form.active,
        notes: form.notes?.trim() || null
      }
      const saved = isEdit
        ? await updateEmployee(employee.id, payload)
        : await createEmployee(payload)
      toast.success(isEdit ? 'Employee updated' : 'Employee added')
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
      title={isEdit ? 'Edit Employee' : 'Add Employee'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add employee'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Full name *" value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder="Wachindra Kasun" autoFocus />
          <Input label="Job title" value={form.role} onChange={set('role')} placeholder="Senior engineer" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="member@company.com" />
          <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+94 ..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Employment" value={form.employment_type} onChange={set('employment_type')} options={EMPLOYMENT_TYPES} />
          <Input label="Base salary (LKR / month)" type="number" step="0.01" min="0" prefix="LKR" value={form.base_salary} onChange={set('base_salary')} error={errors.base_salary} />
          <Input label="Joined on" type="date" value={form.joined_on ?? ''} onChange={set('joined_on')} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">Active</div>
            <div className="text-xs text-zinc-400">Inactive employees won't appear in monthly salary runs.</div>
          </div>
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, active: !f.active }))}
            className={`relative h-6 w-11 rounded-full transition-colors ${form.active ? 'bg-indigo-500' : 'bg-zinc-700'}`}
            aria-pressed={form.active}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <Textarea label="Notes" value={form.notes ?? ''} onChange={set('notes')} rows={3} />
      </form>
    </Modal>
  )
}

function empty() {
  return {
    full_name: '', email: '', phone: '', role: '',
    employment_type: 'full_time', base_salary: '', joined_on: '',
    active: true, notes: ''
  }
}
