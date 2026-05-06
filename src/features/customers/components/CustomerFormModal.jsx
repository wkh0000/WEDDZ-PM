import { useState, useEffect } from 'react'
import { Building2, Mail, Phone, MapPin, FileText } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { createCustomer, updateCustomer } from '../api'
import { useToast } from '@/context/ToastContext'

export default function CustomerFormModal({ open, onClose, customer, onSaved }) {
  const toast = useToast()
  const isEdit = !!customer
  const [form, setForm] = useState(empty())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(customer ? { ...empty(), ...customer } : empty())
      setErrors({})
    }
  }, [open, customer])

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.name?.trim()) errs.name = 'Name is required'
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Invalid email'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        company: form.company?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null
      }
      const saved = isEdit
        ? await updateCustomer(customer.id, payload)
        : await createCustomer(payload)
      toast.success(isEdit ? 'Customer updated' : 'Customer added')
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
      title={isEdit ? 'Edit Customer' : 'Add Customer'}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>{isEdit ? 'Save changes' : 'Add customer'}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={set('name')} error={errors.name} placeholder="John Doe" autoFocus />
          <Input label="Company" leftIcon={<Building2 className="w-4 h-4" />} value={form.company} onChange={set('company')} placeholder="Acme Inc." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Email" type="email" leftIcon={<Mail className="w-4 h-4" />} value={form.email} onChange={set('email')} error={errors.email} placeholder="contact@acme.com" />
          <Input label="Phone" leftIcon={<Phone className="w-4 h-4" />} value={form.phone} onChange={set('phone')} placeholder="+94 ..." />
        </div>
        <Input label="Address" leftIcon={<MapPin className="w-4 h-4" />} value={form.address} onChange={set('address')} placeholder="Street, city, country" />
        <Textarea label="Notes" value={form.notes} onChange={set('notes')} placeholder="Anything worth remembering about this customer." rows={3} />
      </form>
    </Modal>
  )
}

function empty() {
  return { name: '', company: '', email: '', phone: '', address: '', notes: '' }
}
