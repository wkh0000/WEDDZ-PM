import { useState, useEffect } from 'react'
import { User, Shield } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { updateProfile } from '../api'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'

export default function EditTeamMemberModal({ open, onClose, member, onUpdated }) {
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('member')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (member) {
      setFullName(member.full_name ?? '')
      setRole(member.role ?? 'member')
      setActive(member.active ?? true)
    }
  }, [member])

  if (!member) return null
  const isSelf = currentUser?.id === member.id

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const updated = await updateProfile(member.id, {
        full_name: fullName,
        role: isSelf ? member.role : role,        // can't downgrade yourself
        active: isSelf ? member.active : active   // can't deactivate yourself
      })
      toast.success('Member updated')
      onUpdated?.(updated)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to update member')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Team Member"
      description={member.email}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={onSubmit} loading={submitting}>Save changes</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Full name"
          leftIcon={<User className="w-4 h-4" />}
          value={fullName}
          onChange={e => setFullName(e.target.value)}
        />
        <Select
          label="Role"
          leftIcon={<Shield className="w-4 h-4" />}
          value={role}
          onChange={e => setRole(e.target.value)}
          disabled={isSelf}
          hint={isSelf ? 'You cannot change your own role.' : undefined}
          options={[
            { value: 'member', label: 'Member' },
            { value: 'super_admin', label: 'Super Admin' }
          ]}
        />
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div>
            <div className="text-sm font-medium text-zinc-100">Active</div>
            <div className="text-xs text-zinc-400">Inactive members cannot sign in or be assigned new tasks.</div>
          </div>
          <button
            type="button"
            disabled={isSelf}
            onClick={() => setActive(a => !a)}
            className={`relative h-6 w-11 rounded-full transition-colors ${active ? 'bg-indigo-500' : 'bg-zinc-700'} ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-pressed={active}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </form>
    </Modal>
  )
}
