import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/** Stock-only users live under /inventory (plus their own account page). */
export default function InventoryScope({ children }) {
  const { role } = useAuth()
  const { pathname } = useLocation()
  if (role === 'inventory' && !pathname.startsWith('/inventory') && pathname !== '/account') {
    return <Navigate to="/inventory" replace />
  }
  return children
}
