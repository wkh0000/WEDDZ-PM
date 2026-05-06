import { useState, useEffect } from 'react'
import { User, Mail, Shield, Lock, Save, KeyRound } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { supabase } from '@/lib/supabase'

export default function AccountPage() {
  const { profile, user, updateOwnProfile, refreshProfile } = useAuth()
  const toast = useToast()
  const [fullName, setFullName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  useEffect(() => {
    document.title = 'Account · WEDDZ PM'
    if (profile) setFullName(profile.full_name ?? '')
  }, [profile])

  async function saveName(e) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSavingName(true)
    try {
      await updateOwnProfile({ full_name: fullName.trim() })
      await refreshProfile()
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSavingName(false)
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (pw !== pwConfirm) { toast.error('Passwords do not match'); return }
    setSavingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setPw(''); setPwConfirm('')
      toast.success('Password changed. Use the new one next time you sign in.')
    } catch (err) {
      toast.error(err.message || 'Password change failed')
    } finally {
      setSavingPw(false)
    }
  }

  if (!profile) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Account" description="Update your name, role display, and password." />

      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size="lg" />
          <div>
            <div className="text-base font-semibold text-zinc-100">{profile.full_name || 'Member'}</div>
            <div className="text-sm text-zinc-400">{profile.email}</div>
            <div className="mt-1.5">
              {profile.role === 'super_admin'
                ? <Badge tone="indigo" dot>Super Admin</Badge>
                : <Badge dot>Member</Badge>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-indigo-400" /> Display name
        </h3>
        <form onSubmit={saveName} className="space-y-3 max-w-md">
          <Input
            label="Full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Your name"
          />
          <Input label="Email" leftIcon={<Mail className="w-4 h-4" />} value={profile.email} disabled hint="Contact a super admin to change your email." />
          <Button type="submit" loading={savingName} leftIcon={<Save className="w-4 h-4" />}>Save</Button>
        </form>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-zinc-100 mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-400" /> Change password
        </h3>
        <form onSubmit={savePassword} className="space-y-3 max-w-md">
          <Input
            label="New password"
            type="password"
            leftIcon={<Lock className="w-4 h-4" />}
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            type="password"
            leftIcon={<Lock className="w-4 h-4" />}
            value={pwConfirm}
            onChange={e => setPwConfirm(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
          <Button type="submit" loading={savingPw} disabled={!pw || pw !== pwConfirm} leftIcon={<Shield className="w-4 h-4" />}>
            Update password
          </Button>
        </form>
      </Card>
    </div>
  )
}
