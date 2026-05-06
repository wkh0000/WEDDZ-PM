import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * Gate that renders children only when the current user has the required role.
 * Place inside a ProtectedRoute (so we already know they're authenticated).
 */
export default function RoleGate({ role = 'super_admin', children, fallback = '/' }) {
  const { profile, loading } = useAuth()
  const toast = useToast()

  const allowed = !loading && profile && (role === 'any' || profile.role === role)

  useEffect(() => {
    if (!loading && profile && !allowed) {
      toast.error('You do not have access to that page.')
    }
  }, [loading, profile, allowed, toast])

  if (loading) return null
  if (!allowed) return <Navigate to={fallback} replace />
  return children
}
