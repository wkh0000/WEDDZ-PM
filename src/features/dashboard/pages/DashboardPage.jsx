import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, FolderKanban, FileText, Wallet, ArrowUpRight, Calendar } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatLKRCompact, formatDate } from '@/lib/format'
import { dashboardSummary, recentProjects, upcomingInvoices } from '../api'
import { projectStatusBadge } from '@/features/projects/components/ProjectStatusBadge'
import { invoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge'

export default function DashboardPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { document.title = 'Dashboard · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [s, p, i] = await Promise.all([
        dashboardSummary(),
        recentProjects(5),
        upcomingInvoices(14)
      ])
      setSummary(s); setProjects(p); setInvoices(i)
    } catch (err) {
      toast.error(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const firstName = (profile?.full_name || profile?.email || 'there').split(' ')[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi ${firstName}`}
        description="Here's what's happening across WEDDZ IT this month."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <StatCard icon={Users} label="Customers" value={summary?.customers ?? 0} loading={loading} tone="indigo" />
        </div>
        <div>
          <StatCard icon={FolderKanban} label="Active Projects" value={summary?.activeProjects ?? 0} loading={loading} tone="emerald" />
        </div>
        <div>
          <StatCard
            icon={FileText}
            label="Unpaid Invoices"
            value={loading ? '' : formatLKRCompact(summary?.unpaidTotal ?? 0)}
            hint={summary && `${summary.unpaidCount} ${summary.unpaidCount === 1 ? 'invoice' : 'invoices'} pending`}
            loading={loading}
            tone="amber"
          />
        </div>
        <div>
          <StatCard
            icon={Wallet}
            label="This Month's Expenses"
            value={loading ? '' : formatLKRCompact(summary?.monthlyExpenses ?? 0)}
            loading={loading}
            tone="rose"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent projects */}
        <Card padded={false} className="lg:col-span-2">
          <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Recent projects</h3>
            <Link to="/projects" className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
              See all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-12 flex justify-center"><Spinner size="md" /></div>
          ) : projects.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              No projects yet. <Link to="/projects" className="text-indigo-400 hover:text-indigo-300">Create one</Link>.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {projects.map(p => (
                <Link
                  key={p.id} to={`/projects/${p.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-100 truncate">{p.name}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {p.customer ? (p.customer.company || p.customer.name) : 'Internal'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-zinc-300 tabular-nums">{formatLKR(p.budget)}</span>
                    {projectStatusBadge(p.status)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Upcoming invoices */}
        <Card padded={false}>
          <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-100">Upcoming due</h3>
            <Link to="/invoices" className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
              All invoices <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-12 flex justify-center"><Spinner size="md" /></div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">No invoices due in the next 14 days.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {invoices.map(i => (
                <Link
                  key={i.id} to={`/invoices/${i.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-medium text-zinc-100">{i.invoice_no}</div>
                    <div className="text-xs text-zinc-500 truncate">
                      {i.customer ? (i.customer.company || i.customer.name) : '—'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-zinc-200 tabular-nums">{formatLKR(i.total)}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(i.due_date)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
