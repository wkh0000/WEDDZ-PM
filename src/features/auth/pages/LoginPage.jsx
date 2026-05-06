import { useState, useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import AuthLayout from './AuthLayout'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

export default function LoginPage() {
  const { signIn, isAuthed, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    document.title = 'Sign in · WEDDZ PM'
  }, [])

  if (!authLoading && isAuthed) {
    const from = location.state?.from || '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!email) errs.email = 'Email is required'
    if (!password) errs.password = 'Password is required'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back')
      navigate(location.state?.from || '/', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Sign in to continue."
      footer={
        <>
          Forgot your password?{' '}
          <Link to="/forgot-password" className="text-indigo-400 hover:text-indigo-300 font-medium">
            Reset it
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          leftIcon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@company.com"
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          leftIcon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
          placeholder="••••••••"
        />
        <Button type="submit" loading={submitting} className="w-full" size="lg">
          Sign in
        </Button>
      </form>
      <div className="mt-6 pt-6 border-t border-white/10 text-center">
        <p className="text-xs text-zinc-500">
          First-time setup?{' '}
          <Link to="/signup" className="text-indigo-400 hover:text-indigo-300">
            Bootstrap the founder account
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
