import { useState, useEffect } from 'react'
import { Mail, User, Lock, Shield, Wand2, Copy, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { createTeamMember, generateTempPassword } from '../api'
import { useToast } from '@/context/ToastContext'

export default function AddTeamMemberModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setEmail(''); setFullName(''); setPassword(generateTempPassword())
      setRole('member'); setErrors({}); setCopied(false)
    }
  }, [open])

  function regenerate() { setPassword(generateTempPassword()); setCopied(false) }
  async function copyPassword() {
    await navigator.clipboard.writeText(password)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!email) errs.email = 'Email is required'
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Invalid email'
    if (!fullName) errs.fullName = 'Full name is required'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 8) errs.password = 'At least 8 characters'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      const user = await createTeamMember({ email, full_name: fullName, password, role })
      toast.success(`${fullName} added. Share the temp password with them.`)
      onCreated?.(user)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to add team member')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Team Member"
      description="Create a new login. They can change their password from the account menu after first sign-in."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>Add member</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Full name"
          leftIcon={<User className="w-4 h-4" />}
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          error={errors.fullName}
          placeholder="Wachindra Kasun"
          autoFocus
        />
        <Input
          label="Email"
          type="email"
          leftIcon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={errors.email}
          placeholder="member@company.com"
        />
        <div>
          <Input
            label="Temporary password"
            leftIcon={<Lock className="w-4 h-4" />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            error={errors.password}
            hint="Auto-generated. Share securely; they should change it after signing in."
          />
          <div className="flex items-center gap-2 mt-2">
            <Button type="button" size="sm" variant="subtle" leftIcon={<Wand2 className="w-3.5 h-3.5" />} onClick={regenerate}>
              Regenerate
            </Button>
            <Button type="button" size="sm" variant="subtle" leftIcon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copyPassword}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
        <Select
          label="Role"
          leftIcon={<Shield className="w-4 h-4" />}
          value={role}
          onChange={e => setRole(e.target.value)}
          options={[
            { value: 'member', label: 'Member — full operational access' },
            { value: 'super_admin', label: 'Super Admin — full + HR + user management' }
          ]}
        />
      </form>
    </Modal>
  )
}
