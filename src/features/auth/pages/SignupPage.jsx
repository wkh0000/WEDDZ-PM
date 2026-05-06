import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Mail, Lock, User } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import AuthLayout from './AuthLayout'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * Signup is intended for the very first user only — they become super_admin
 * via the handle_new_user database trigger. After bootstrap, the super admin
 * disables public signups in Supabase Auth settings and adds team members
 * via /admin/users.
 */
export default function SignupPage() {
  const { signUp, signIn, isAuthed, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => { document.title = 'Sign up · WEDDZ PM' }, [])

  if (!authLoading && isAuthed) return <Navigate to="/" replace />

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!email) errs.email = 'Email is required'
    if (!fullName) errs.fullName = 'Full name is required'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 8) errs.password = 'Use at least 8 characters'
    if (password !== confirm) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSubmitting(true)
    try {
      await signUp(email, password, fullName)
      // try sign-in immediately (works when email confirmation is off)
      try {
        await signIn(email, password)
        toast.success('Account created. Welcome to WEDDZ PM.')
        navigate('/', { replace: true })
      } catch {
        toast.info('Check your email to confirm your account, then sign in.')
        navigate('/login')
      }
    } catch (err) {
      toast.error(err.message || 'Sign up failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Bootstrap account"
      subtitle="The first user to sign up becomes the super admin."
      footer={
        <>Already have an account?{' '}<Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link></>
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
          autoComplete="email"
          leftIcon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@company.com"
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          leftIcon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
          placeholder="At least 8 characters"
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          leftIcon={<Lock className="w-4 h-4" />}
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          error={errors.confirm}
          placeholder="Re-enter password"
        />
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
