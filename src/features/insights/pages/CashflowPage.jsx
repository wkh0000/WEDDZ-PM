import { useEffect, useState, useMemo } from 'react'
import { ArrowDownUp, ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import { cashflowLedger } from '../api'
import { cn } from '@/lib/cn'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'in',  label: 'Money in' },
  { id: 'out', label: 'Money out' }
]

export default function CashflowPage() {
  const toast = useToast()
  const [data, setData] = useState({ entries: [], totalIn: 0, totalOut: 0, balance: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { document.title = 'Cashflow · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try { setData(await cashflowLedger()) }
    catch (err) { toast.error(err.message || 'Failed to load cashflow') }
    finally { setLoading(false) }
  }

  const rows = useMemo(() => {
    if (filter === 'all') return data.entries
    return data.entries.filter(e => e.direction === filter)
  }, [data.entries, filter])

  const balancePositive = data.balance >= 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashflow"
        description="Every cash movement since day one — invoices paid in, expenses paid out, and the running balance."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryTile
          icon={ArrowDownLeft}
          tone="emerald"
          label="Money in"
          value={formatLKR(data.totalIn)}
          hint="Paid invoices"
        />
        <SummaryTile
          icon={ArrowUpRight}
          tone="rose"
          label="Money out"
          value={formatLKR(data.totalOut)}
          hint="All expenses"
        />
        <SummaryTile
          icon={balancePositive ? TrendingUp : TrendingDown}
          tone={balancePositive ? 'indigo' : 'rose'}
          label="Current balance"
          value={formatLKR(data.balance)}
          emphasize
        />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
              filter === f.id
                ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
                : 'bg-white/[0.04] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-zinc-500 ml-1">{rows.length} {rows.length === 1 ? 'record' : 'records'}</span>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ArrowDownUp}
          title="No cash movements yet"
          description="Paid invoices and expenses will show up here as they're recorded."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Description</TH>
              <TH align="right">In</TH>
              <TH align="right">Out</TH>
              <TH align="right">Balance</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map(e => (
              <TR key={e.id}>
                <TD className="text-zinc-400 whitespace-nowrap">{formatDate(e.date)}</TD>
                <TD>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 border',
                      e.direction === 'in'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    )}>
                      {e.direction === 'in' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </span>
                    <span className="text-zinc-100 truncate">{e.label}</span>
                    <Badge tone={e.direction === 'in' ? 'emerald' : 'zinc'} size="sm">{e.category}</Badge>
                  </div>
                </TD>
                <TD align="right" className="text-emerald-300 font-medium">
                  {e.direction === 'in' ? formatLKR(e.amount) : <span className="text-zinc-600">—</span>}
                </TD>
                <TD align="right" className="text-rose-300 font-medium">
                  {e.direction === 'out' ? formatLKR(e.amount) : <span className="text-zinc-600">—</span>}
                </TD>
                <TD align="right" className={cn('font-semibold tabular-nums', e.balance >= 0 ? 'text-zinc-100' : 'text-rose-300')}>
                  {formatLKR(e.balance)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function SummaryTile({ icon: Icon, tone, label, value, hint, emphasize }) {
  const toneText = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    indigo: 'text-indigo-300'
  }[tone] ?? 'text-zinc-100'
  const toneBg = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-300',
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
  }[tone] ?? 'bg-white/5 border-white/10 text-zinc-300'

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg border', toneBg)}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
      </div>
      <div className={cn('tabular-nums font-semibold', emphasize ? 'text-3xl' : 'text-2xl', toneText)}>{value}</div>
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
    </Card>
  )
}
