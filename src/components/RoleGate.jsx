import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

/**
 * Gate that renders children only when the current user has the required role.
 * Place inside a ProtectedRoute (so we already know they're authenticated).
 *
 * Profile is loaded by a separate effect after the session is restored, so
 * there's a brief window where loading=false but profile=null. We treat that
 * window as "still loading" rather than denying access — denying would redirect
 * away on every hard refresh of a role-gated route.
 */
export default function RoleGate({ role = 'super_admin', children, fallback = '/' }) {
  const { profile, loading, isAuthed } = useAuth()
  const toast = useToast()

  // Still loading session, OR session loaded but profile fetch hasn't returned yet
  const isStillLoading = loading || (isAuthed && !profile)
  const allowed = !isStillLoading && profile && (role === 'any' || profile.role === role)

  useEffect(() => {
    if (!isStillLoading && profile && !allowed) {
      toast.error('You do not have access to that page.')
    }
  }, [isStillLoading, profile, allowed, toast])

  if (isStillLoading) return null
  if (!allowed) return <Navigate to={fallback} replace />
  return children
}
