import { useEffect, useState } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, Users, FolderKanban, FileText, Receipt,
  UserCog, HandCoins, ArrowUpRight, ArrowDownLeft, ClipboardList, Layers
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DownloadPdfButton from '@/components/ui/DownloadPdfButton'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate, formatMonth, formatNumber } from '@/lib/format'
import {
  lifetimeTotals, salaryReport, expenseSpread, monthlyFinancialSummary
} from '../api'
import { cn } from '@/lib/cn'

export default function ReportsPage() {
  const toast = useToast()
  const [totals, setTotals] = useState(null)
  const [salary, setSalary] = useState([])
  const [expense, setExpense] = useState({ rows: [], total: 0, entryCount: 0 })
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Reports · WEDDZ PM'
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [t, s, e, m] = await Promise.all([
        lifetimeTotals(), salaryReport(), expenseSpread(), monthlyFinancialSummary()
      ])
      setTotals(t); setSalary(s); setExpense(e); setMonthly(m)
    } catch (err) {
      toast.error(err.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  if (loading || !totals) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Lifetime rollups — every rupee in, every rupee out, per-employee salary, expense spread, and month-by-month totals."
        />
        <div className="glass rounded-2xl p-16 flex justify-center"><Spinner size="lg" /></div>
      </div>
    )
  }

  const netTone = totals.netProfit >= 0 ? 'emerald' : 'rose'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Lifetime rollups — every rupee in, every rupee out, per-employee salary, expense spread, and month-by-month totals."
      />

      {/* ───────── Section 1: Lifetime headline totals ───────── */}
      <section className="space-y-3">
        <SectionHeader
          icon={Layers}
          title="Lifetime totals"
          subtitle="All-time cash and record counts since day one."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatTile icon={ArrowDownLeft} tone="emerald" label="Revenue" value={formatLKR(totals.revenue)} hint={`${totals.paidInvoiceCount} paid invoice${totals.paidInvoiceCount === 1 ? '' : 's'}`} />
          <StatTile icon={ArrowUpRight}  tone="rose"    label="Expenses" value={formatLKR(totals.expenses)} hint={`${totals.expenseCount} record${totals.expenseCount === 1 ? '' : 's'}`} />
          <StatTile icon={totals.netProfit >= 0 ? TrendingUp : TrendingDown} tone={netTone} label="Net profit" value={formatLKR(totals.netProfit)} emphasize />
          <StatTile icon={Wallet} tone="indigo" label="Salaries paid" value={formatLKR(totals.salariesPaid)} hint={`${totals.salaryPaymentCount} payment${totals.salaryPaymentCount === 1 ? '' : 's'}`} />
          <StatTile icon={HandCoins} tone={totals.advancesOutstanding > 0 ? 'amber' : 'default'} label="Outstanding advances" value={formatLKR(totals.advancesOutstanding)} />
          <StatTile icon={Wallet} tone="amber" label="Salaries pending" value={formatLKR(totals.salariesPending)} />
          <StatTile icon={Users} tone="indigo" label="Customers" value={totals.customers} hint={`${totals.paidInvoiceCount} paid inv.`} />
          <StatTile icon={FolderKanban} tone="indigo" label="Projects" value={totals.projects} />
          <StatTile icon={UserCog} tone="indigo" label="Employees" value={totals.employees} hint={`${totals.activeEmployees} active`} />
          <StatTile icon={FileText} tone="indigo" label="Invoices" value={totals.invoiceCount} hint={`${totals.paidInvoiceCount} paid`} />
          <StatTile icon={Receipt} tone="indigo" label="Expense entries" value={totals.expenseCount} />
        </div>
      </section>

      {/* ───────── Section 2: Salary report per employee ───────── */}
      <section className="space-y-3">
        <SectionHeader
          icon={UserCog}
          title="Lifetime salary per employee"
          subtitle="Total each teammate has taken home + their outstanding advance."
          action={
            <DownloadPdfButton
              disabled={salary.length === 0}
              data={() => ({
                title: 'Lifetime salary per employee',
                subtitle: `${salary.length} employee${salary.length === 1 ? '' : 's'} · Total net paid ${formatLKR(salary.reduce((s, r) => s + r.totalNet, 0))}`,
                orientation: 'landscape',
                columns: [
                  { header: 'Employee', dataKey: 'name' },
                  { header: 'Role', dataKey: 'role' },
                  { header: 'Status', dataKey: 'status' },
                  { header: 'Months paid', dataKey: 'months', align: 'right' },
                  { header: 'Total base (LKR)', dataKey: 'base', align: 'right' },
                  { header: 'Total bonus (LKR)', dataKey: 'bonus', align: 'right' },
                  { header: 'Total deductions (LKR)', dataKey: 'ded', align: 'right' },
                  { header: 'Total net paid (LKR)', dataKey: 'net', align: 'right' },
                  { header: 'Avg / month (LKR)', dataKey: 'avg', align: 'right' },
                  { header: 'Outstanding advance (LKR)', dataKey: 'adv', align: 'right' },
                  { header: 'Last paid', dataKey: 'last' }
                ],
                rows: salary.map(r => ({
                  name: r.full_name,
                  role: r.role || '—',
                  status: r.active ? 'Active' : 'Inactive',
                  months: String(r.monthsPaid),
                  base: formatNumber(r.totalBase),
                  bonus: formatNumber(r.totalBonus),
                  ded: formatNumber(r.totalDeductions),
                  net: formatNumber(r.totalNet),
                  avg: formatNumber(r.avgNet),
                  adv: r.outstandingAdvance > 0 ? formatNumber(r.outstandingAdvance) : '—',
                  last: r.lastPaidPeriod ? formatMonth(r.lastPaidPeriod.year, r.lastPaidPeriod.month) : '—'
                })),
                summary: [
                  { label: 'Total base',         value: formatLKR(salary.reduce((s, r) => s + r.totalBase, 0)) },
                  { label: 'Total bonus',        value: formatLKR(salary.reduce((s, r) => s + r.totalBonus, 0)) },
                  { label: 'Total deductions',   value: formatLKR(salary.reduce((s, r) => s + r.totalDeductions, 0)) },
                  { label: 'Total net paid',     value: formatLKR(salary.reduce((s, r) => s + r.totalNet, 0)) },
                  { label: 'Outstanding advances', value: formatLKR(salary.reduce((s, r) => s + r.outstandingAdvance, 0)) }
                ]
              })}
            />
          }
        />
        {salary.length === 0 ? (
          <EmptyState icon={UserCog} title="No employees yet" description="Add employees on the Employees page to see per-person salary rollups." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH align="right">Months paid</TH>
                <TH align="right">Base</TH>
                <TH align="right">Bonus</TH>
                <TH align="right">Deductions</TH>
                <TH align="right">Total net</TH>
                <TH align="right">Avg / mo</TH>
                <TH align="right">Outstanding advance</TH>
                <TH>Last paid</TH>
              </TR>
            </THead>
            <tbody>
              {salary.map(r => (
                <TR key={r.employee_id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-100">{r.full_name}</span>
                      {!r.active && <Badge tone="rose" size="sm">Inactive</Badge>}
                    </div>
                    {r.role && <div className="text-xs text-zinc-500 mt-0.5">{r.role}</div>}
                  </TD>
                  <TD align="right" className="tabular-nums">{r.monthsPaid}</TD>
                  <TD align="right">{formatLKR(r.totalBase)}</TD>
                  <TD align="right">{formatLKR(r.totalBonus)}</TD>
                  <TD align="right">{formatLKR(r.totalDeductions)}</TD>
                  <TD align="right" className="font-semibold text-zinc-100">{formatLKR(r.totalNet)}</TD>
                  <TD align="right" className="text-zinc-400">{formatLKR(r.avgNet)}</TD>
                  <TD align="right" className={r.outstandingAdvance > 0 ? 'text-amber-300 font-medium' : 'text-zinc-500'}>
                    {r.outstandingAdvance > 0 ? formatLKR(r.outstandingAdvance) : '—'}
                  </TD>
                  <TD className="text-zinc-400">
                    {r.lastPaidPeriod ? formatMonth(r.lastPaidPeriod.year, r.lastPaidPeriod.month) : '—'}
                  </TD>
                </TR>
              ))}
              <TR className="!bg-white/[0.03] font-semibold">
                <TD className="text-zinc-100">Total</TD>
                <TD align="right" className="tabular-nums text-zinc-300">{salary.reduce((s, r) => s + r.monthsPaid, 0)}</TD>
                <TD align="right">{formatLKR(salary.reduce((s, r) => s + r.totalBase, 0))}</TD>
                <TD align="right">{formatLKR(salary.reduce((s, r) => s + r.totalBonus, 0))}</TD>
                <TD align="right">{formatLKR(salary.reduce((s, r) => s + r.totalDeductions, 0))}</TD>
                <TD align="right" className="text-zinc-100">{formatLKR(salary.reduce((s, r) => s + r.totalNet, 0))}</TD>
                <TD align="right" className="text-zinc-500">—</TD>
                <TD align="right" className="text-amber-300">{formatLKR(salary.reduce((s, r) => s + r.outstandingAdvance, 0))}</TD>
                <TD className="text-zinc-500">—</TD>
              </TR>
            </tbody>
          </Table>
        )}
      </section>

      {/* ───────── Section 3: Expense spread by category ───────── */}
      <section className="space-y-3">
        <SectionHeader
          icon={Receipt}
          title="Expense spread by category"
          subtitle={`${expense.entryCount} expense record${expense.entryCount === 1 ? '' : 's'} across ${expense.rows.length} categor${expense.rows.length === 1 ? 'y' : 'ies'}.`}
          action={
            <DownloadPdfButton
              disabled={expense.rows.length === 0}
              data={() => ({
                title: 'Expense spread by category',
                subtitle: `${expense.entryCount} record${expense.entryCount === 1 ? '' : 's'} · Total ${formatLKR(expense.total)}`,
                columns: [
                  { header: 'Category', dataKey: 'cat' },
                  { header: 'Entries', dataKey: 'count', align: 'right' },
                  { header: 'Total (LKR)', dataKey: 'total', align: 'right' },
                  { header: 'Avg (LKR)', dataKey: 'avg', align: 'right' },
                  { header: '% of total', dataKey: 'pct', align: 'right' }
                ],
                rows: expense.rows.map(r => ({
                  cat: r.category,
                  count: String(r.count),
                  total: formatNumber(r.total),
                  avg: formatNumber(r.avg),
                  pct: `${r.pct}%`
                })),
                summary: [{ label: `Total (${expense.entryCount})`, value: formatLKR(expense.total) }]
              })}
            />
          }
        />
        {expense.rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No expenses yet" description="Recorded expenses will be broken down here by category." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH align="right">Entries</TH>
                <TH align="right">Total</TH>
                <TH align="right">Avg / entry</TH>
                <TH>Share</TH>
              </TR>
            </THead>
            <tbody>
              {expense.rows.map(r => (
                <TR key={r.category}>
                  <TD className="font-medium text-zinc-100">{r.category}</TD>
                  <TD align="right" className="tabular-nums">{r.count}</TD>
                  <TD align="right" className="font-semibold text-zinc-100">{formatLKR(r.total)}</TD>
                  <TD align="right" className="text-zinc-400">{formatLKR(r.avg)}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden max-w-[220px]">
                        <div className="h-full bg-indigo-400/80" style={{ width: `${Math.min(100, r.pct)}%` }} />
                      </div>
                      <span className="text-xs text-zinc-400 tabular-nums w-12 text-right">{r.pct}%</span>
                    </div>
                  </TD>
                </TR>
              ))}
              <TR className="!bg-white/[0.03] font-semibold">
                <TD className="text-zinc-100">Total</TD>
                <TD align="right" className="tabular-nums text-zinc-300">{expense.entryCount}</TD>
                <TD align="right" className="text-zinc-100">{formatLKR(expense.total)}</TD>
                <TD align="right" className="text-zinc-500">—</TD>
                <TD className="text-zinc-500">100%</TD>
              </TR>
            </tbody>
          </Table>
        )}
      </section>

      {/* ───────── Section 4: Monthly financial summary ───────── */}
      <section className="space-y-3">
        <SectionHeader
          icon={ClipboardList}
          title="Monthly financial summary"
          subtitle="Every month with activity, newest first."
          action={
            <DownloadPdfButton
              disabled={monthly.length === 0}
              data={() => ({
                title: 'Monthly financial summary',
                subtitle: `${monthly.length} month${monthly.length === 1 ? '' : 's'} with activity`,
                columns: [
                  { header: 'Month', dataKey: 'm' },
                  { header: 'Revenue (LKR)', dataKey: 'rev', align: 'right' },
                  { header: 'Expenses (LKR)', dataKey: 'exp', align: 'right' },
                  { header: 'Salaries (LKR)', dataKey: 'sal', align: 'right' },
                  { header: 'Net (LKR)', dataKey: 'net', align: 'right' }
                ],
                rows: monthly.map(m => ({
                  m: labelMonth(m.month),
                  rev: formatNumber(m.revenue),
                  exp: formatNumber(m.expenses),
                  sal: formatNumber(m.salaries),
                  net: formatNumber(m.net)
                })),
                summary: [
                  { label: 'Lifetime revenue',  value: formatLKR(monthly.reduce((s, m) => s + m.revenue, 0)) },
                  { label: 'Lifetime expenses', value: formatLKR(monthly.reduce((s, m) => s + m.expenses, 0)) },
                  { label: 'Lifetime net',      value: formatLKR(monthly.reduce((s, m) => s + m.net, 0)) }
                ]
              })}
            />
          }
        />
        {monthly.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No activity yet" description="Once you have paid invoices or expenses, the monthly rollup will appear here." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH align="right">Revenue</TH>
                <TH align="right">Expenses</TH>
                <TH align="right">Salaries (of expenses)</TH>
                <TH align="right">Net</TH>
              </TR>
            </THead>
            <tbody>
              {monthly.map(m => (
                <TR key={m.month}>
                  <TD className="font-medium text-zinc-100">{labelMonth(m.month)}</TD>
                  <TD align="right" className="text-emerald-300 font-medium">{m.revenue > 0 ? formatLKR(m.revenue) : <span className="text-zinc-600">—</span>}</TD>
                  <TD align="right" className="text-rose-300 font-medium">{m.expenses > 0 ? formatLKR(m.expenses) : <span className="text-zinc-600">—</span>}</TD>
                  <TD align="right" className="text-zinc-400">{m.salaries > 0 ? formatLKR(m.salaries) : <span className="text-zinc-600">—</span>}</TD>
                  <TD align="right" className={cn('font-semibold tabular-nums', m.net >= 0 ? 'text-zinc-100' : 'text-rose-300')}>{formatLKR(m.net)}</TD>
                </TR>
              ))}
              <TR className="!bg-white/[0.03] font-semibold">
                <TD className="text-zinc-100">Lifetime</TD>
                <TD align="right" className="text-emerald-300">{formatLKR(monthly.reduce((s, m) => s + m.revenue, 0))}</TD>
                <TD align="right" className="text-rose-300">{formatLKR(monthly.reduce((s, m) => s + m.expenses, 0))}</TD>
                <TD align="right" className="text-zinc-400">{formatLKR(monthly.reduce((s, m) => s + m.salaries, 0))}</TD>
                <TD align="right" className={cn('tabular-nums', monthly.reduce((s, m) => s + m.net, 0) >= 0 ? 'text-zinc-100' : 'text-rose-300')}>
                  {formatLKR(monthly.reduce((s, m) => s + m.net, 0))}
                </TD>
              </TR>
            </tbody>
          </Table>
        )}
      </section>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
          <Icon className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function StatTile({ icon: Icon, tone = 'default', label, value, hint, emphasize }) {
  const toneText = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    indigo: 'text-zinc-100',
    amber: 'text-amber-300',
    default: 'text-zinc-100'
  }[tone] ?? 'text-zinc-100'
  const toneBg = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    rose:    'bg-rose-500/10 border-rose-500/20 text-rose-300',
    indigo:  'bg-indigo-500/10 border-indigo-500/20 text-indigo-300',
    amber:   'bg-amber-500/10 border-amber-500/20 text-amber-300',
    default: 'bg-white/5 border-white/10 text-zinc-300'
  }[tone] ?? 'bg-white/5 border-white/10 text-zinc-300'

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-md border', toneBg)}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      </div>
      <div className={cn('tabular-nums font-semibold leading-tight', emphasize ? 'text-2xl' : 'text-xl', toneText)}>
        {typeof value === 'number' ? value.toLocaleString('en-LK') : value}
      </div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
    </Card>
  )
}

function labelMonth(key) {
  // key is "YYYY-MM"
  const [y, m] = key.split('-').map(n => Number(n))
  return formatMonth(y, m)
}
