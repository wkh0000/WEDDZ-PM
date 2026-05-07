import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, FolderKanban, FileText, Receipt,
  UserCog, BarChart3, Shield, Sparkles, Database
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/context/AuthContext'
import { motion } from 'framer-motion'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'WEDDZ PM'

function buildNav(isSuperAdmin) {
  const nav = [
    { to: '/',            label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/customers',   label: 'Customers', icon: Users },
    { to: '/projects',    label: 'Projects',  icon: FolderKanban },
    { to: '/invoices',    label: 'Invoices',  icon: FileText },
    { to: '/expenses',    label: 'Expenses',  icon: Receipt },
    { to: '/insights',    label: 'Insights',  icon: BarChart3 }
  ]
  if (isSuperAdmin) {
    nav.splice(5, 0, { to: '/employees', label: 'Employees', icon: UserCog })
    nav.push({ to: '/admin/users',   label: 'Team Members', icon: Shield,   group: 'admin' })
    nav.push({ to: '/admin/backups', label: 'Backups',      icon: Database, group: 'admin' })
  }
  return nav
}

export default function Sidebar({ onNavigate }) {
  const { isSuperAdmin } = useAuth()
  const nav = buildNav(isSuperAdmin)
  const operational = nav.filter(n => n.group !== 'admin')
  const admin       = nav.filter(n => n.group === 'admin')

  return (
    <aside className="h-full w-64 shrink-0 border-r border-white/10 bg-zinc-950/60 backdrop-blur-md flex flex-col">
      {/* Brand */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-glow">
          WP
        </div>
        <div className="leading-tight">
          <div className="font-semibold tracking-tight text-zinc-100">{APP_NAME}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">WEDDZ IT</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        <div>
          <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Workspace</div>
          <div className="space-y-1">
            {operational.map(item => (
              <NavItem key={item.to} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
        {admin.length > 0 && (
          <div>
            <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Admin</div>
            <div className="space-y-1">
              {admin.map(item => (
                <NavItem key={item.to} {...item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="glass rounded-xl p-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="text-xs text-zinc-400 leading-tight">
            Internal PM &amp; CRM<br />
            <span className="text-zinc-500">v0.1 · WEDDZ IT</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function NavItem({ to, label, icon: Icon, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-indigo-500/10 text-indigo-200 border border-indigo-500/20'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-indigo-400"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <Icon className="w-4 h-4 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}
