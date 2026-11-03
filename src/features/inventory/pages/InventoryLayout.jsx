import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cn } from '@/lib/cn'
import * as api from '../api'
import { stockFromRows } from '../lib/stock'

const InventoryContext = createContext(null)

export function useInventory() {
  return useContext(InventoryContext)
}

export function usePermissions() {
  const { role } = useAuth()
  return useMemo(() => ({
    role,
    finance: role === 'super_admin' || role === 'member',
    manage: role === 'super_admin' || role === 'inventory',
    admin: role === 'super_admin'
  }), [role])
}

export default function InventoryLayout() {
  const toast = useToast()
  const can = usePermissions()
  const [state, setState] = useState({ products: [], locations: [], clients: [], stock: new Map(), loading: true })

  const reload = useCallback(async () => {
    try {
      const [products, locations, clients, stockRows] = await Promise.all([
        api.listProducts(), api.listLocations(), api.listClients(), api.getStock()
      ])
      setState({ products, locations, clients, stock: stockFromRows(stockRows), loading: false })
    } catch (err) {
      toast.error(err.message || 'Failed to load inventory')
      setState(s => ({ ...s, loading: false }))
    }
  }, [toast])

  useEffect(() => { reload() }, [reload])

  const value = useMemo(() => ({ ...state, reload, can }), [state, reload, can])

  const tabs = [
    { to: '/inventory', label: 'Stock', end: true },
    { to: '/inventory/deployments', label: 'Deployments' },
    { to: '/inventory/movements', label: 'Movements' },
    { to: '/inventory/documents', label: can.finance ? 'Documents' : 'Delivery notes' },
    { to: '/inventory/products', label: 'Products' },
    { to: '/inventory/locations', label: 'Locations' },
    { to: '/inventory/reconciliation', label: 'Reconciliation' }
  ]

  return (
    <InventoryContext.Provider value={value}>
      <div className="space-y-6">
        <nav className="flex items-center gap-1 border-b border-white/10 overflow-x-auto -mx-1 px-1">
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn(
                'relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors',
                isActive ? 'text-zinc-100 border-indigo-400' : 'text-zinc-400 hover:text-zinc-200 border-transparent'
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </InventoryContext.Provider>
  )
}
