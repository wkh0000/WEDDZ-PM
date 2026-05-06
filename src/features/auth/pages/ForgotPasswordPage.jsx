import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import AuthLayout from './AuthLayout'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => { document.title = 'Reset password · WEDDZ PM' }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (!email) return
    setSubmitting(true)
    try {
      await sendPasswordReset(email)
      setSent(true)
      toast.success('Reset link sent. Check your email.')
    } catch (err) {
      toast.error(err.message || 'Failed to send reset link')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle={sent ? 'Check your inbox for a reset link.' : 'Enter your email and we will send a reset link.'}
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
        </Link>
      }
    >
      {!sent ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            leftIcon={<Mail className="w-4 h-4" />}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
          />
          <Button type="submit" loading={submitting} className="w-full" size="lg">
            Send reset link
          </Button>
        </form>
      ) : (
        <div className="text-sm text-zinc-300">
          A reset link has been sent to <span className="text-zinc-100 font-medium">{email}</span>. Click it from your inbox to set a new password.
        </div>
      )}
    </AuthLayout>
  )
}
