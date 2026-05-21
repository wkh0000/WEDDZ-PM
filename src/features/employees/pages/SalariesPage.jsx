import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, Sparkles, Wallet, MoreHorizontal, Pencil, Trash2, CheckCircle2, RotateCcw, HandCoins, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import DownloadPdfButton from '@/components/ui/DownloadPdfButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatMonth, formatDate, formatNumber } from '@/lib/format'
import {
  listSalaries, deleteSalary, paySalary, unpaySalary, generateMonthlySalaries,
  listAdvances, cancelAdvance, outstandingAdvanceTotals
} from '../api'
import SalaryFormModal from '../components/SalaryFormModal'
import AdvanceFormModal from '../components/AdvanceFormModal'

export default function SalariesPage() {
  const toast = useToast()
  const formDisc = useDisclosure()
  const advanceDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const cancelAdvDisc = useDisclosure()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [items, setItems] = useState([])
  const [advances, setAdvances] = useState([])
  const [advanceTotals, setAdvanceTotals] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [cancelingAdv, setCancelingAdv] = useState(null)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { document.title = 'Salaries · WEDDZ PM'; load() }, [year, month])

  async function load() {
    setLoading(true)
    try {
      const [sal, adv, totals] = await Promise.all([
        listSalaries({ year, month }),
        listAdvances({ status: 'outstanding' }),
        outstandingAdvanceTotals()
      ])
      setItems(sal); setAdvances(adv); setAdvanceTotals(totals)
    }
    catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }

  function shiftMonth(delta) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1)
  }

  async function generate() {
    setGenerating(true)
    try {
      const created = await generateMonthlySalaries(year, month)
      if (created.length === 0) {
        toast.info('All active employees already have salaries for this month.')
      } else {
        toast.success(`Generated ${created.length} salary ${created.length === 1 ? 'row' : 'rows'} at base salary.`)
      }
      load()
    } catch (err) {
      toast.error(err.message || 'Generate failed')
    } finally {
      setGenerating(false)
    }
  }

  async function onPay(s) {
    try {
      await paySalary(s.id)
      toast.success(`${s.employee?.full_name} paid for ${formatMonth(s.period_year, s.period_month)}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Mark paid failed')
    }
  }

  async function onUnpay(s) {
    try {
      await unpaySalary(s.id)
      toast.success('Reverted to pending')
      load()
    } catch (err) {
      toast.error(err.message || 'Unpay failed')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      // If paid, unpay first to drop the linked expense (also un-settles
      // any advances back to outstanding).
      if (deleting.status === 'paid') await unpaySalary(deleting.id)
      await deleteSalary(deleting.id)
      toast.success('Salary removed')
      confirmDisc.onClose()
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCancelAdvance() {
    if (!cancelingAdv) return
    setBusy(true)
    try {
      await cancelAdvance(cancelingAdv.id)
      toast.success('Advance cancelled — its expense was reversed')
      cancelAdvDisc.onClose()
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to cancel advance')
    } finally {
      setBusy(false)
    }
  }

  const totals = useMemo(() => ({
    total: items.reduce((s, r) => s + Number(r.net_amount ?? 0), 0),
    paid:  items.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.net_amount ?? 0), 0),
    pending: items.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.net_amount ?? 0), 0)
  }), [items])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salaries"
        description="Run monthly salaries. Marking as paid creates a linked expense automatically."
        actions={
          <>
            <Link to="/employees"><Button variant="subtle">Employees →</Button></Link>
            <DownloadPdfButton
              disabled={loading || items.length === 0}
              data={() => ({
                title: `Salaries — ${formatMonth(year, month)}`,
                subtitle: `${items.length} ${items.length === 1 ? 'record' : 'records'}`,
                orientation: 'landscape',
                columns: [
                  { header: 'Employee', dataKey: 'emp' },
                  { header: 'Base (LKR)', dataKey: 'base', align: 'right' },
                  { header: 'Bonus (LKR)', dataKey: 'bonus', align: 'right' },
                  { header: 'Deductions (LKR)', dataKey: 'ded', align: 'right' },
                  { header: 'Net (LKR)', dataKey: 'net', align: 'right' },
                  { header: 'Status', dataKey: 'status' },
                  { header: 'Paid on', dataKey: 'paid' }
                ],
                rows: items.map(s => ({
                  emp: s.employee?.full_name ?? '—',
                  base: formatNumber(s.amount),
                  bonus: formatNumber(s.bonus),
                  ded: formatNumber(s.deductions),
                  net: formatNumber(s.net_amount),
                  status: s.status === 'paid' ? 'PAID' : 'PENDING',
                  paid: s.paid_on ? formatDate(s.paid_on) : '—'
                })),
                summary: [
                  { label: 'Total net', value: formatLKR(totals.total) },
                  { label: 'Pending', value: formatLKR(totals.pending) },
                  { label: 'Paid', value: formatLKR(totals.paid) }
                ]
              })}
            />
            <Button variant="subtle" leftIcon={<HandCoins className="w-4 h-4" />} onClick={advanceDisc.onOpen}>Give advance</Button>
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => { setEditing(null); formDisc.onOpen() }}>Add salary</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="flex-1 text-center">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Period</div>
            <div className="font-semibold text-zinc-100">{formatMonth(year, month)}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
        </Card>
        <SummaryTile label="Total"   value={formatLKR(totals.total)} />
        <SummaryTile label="Pending" value={formatLKR(totals.pending)} tone="amber" />
        <SummaryTile label="Paid"    value={formatLKR(totals.paid)}    tone="emerald" />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={generate} loading={generating} leftIcon={<Sparkles className="w-4 h-4" />} variant="subtle">
          Generate {formatMonth(year, month)} from base salaries
        </Button>
      </div>

      {/* Outstanding advances — money already paid out, waiting to be
          deducted from each employee's next paid salary. */}
      {advances.length > 0 && (
        <Card padded={false}>
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <HandCoins className="w-4 h-4 text-amber-300" />
              </span>
              <h3 className="text-sm font-semibold text-zinc-100">Outstanding advances</h3>
              <Badge tone="amber">{formatLKR(advances.reduce((s, a) => s + Number(a.amount ?? 0), 0))}</Badge>
            </div>
            <span className="text-xs text-zinc-500">Auto-deducted when each employee's salary is marked paid.</span>
          </div>
          <Table className="border-0">
            <THead>
              <TR><TH>Employee</TH><TH>Date</TH><TH>Notes</TH><TH align="right">Amount</TH><TH align="right">Actions</TH></TR>
            </THead>
            <tbody>
              {advances.map(a => (
                <TR key={a.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.employee?.full_name} size="sm" />
                      <span className="font-medium text-zinc-100">{a.employee?.full_name ?? '—'}</span>
                    </div>
                  </TD>
                  <TD className="text-zinc-400">{formatDate(a.advance_date)}</TD>
                  <TD className="text-zinc-400 max-w-[280px] truncate">{a.notes || <span className="text-zinc-600">—</span>}</TD>
                  <TD align="right" className="font-semibold text-amber-200">{formatLKR(a.amount)}</TD>
                  <TD align="right">
                    <Button size="xs" variant="subtle" leftIcon={<X className="w-3.5 h-3.5" />} onClick={() => { setCancelingAdv(a); cancelAdvDisc.onOpen() }}>
                      Cancel
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No salaries for this month"
          description="Generate from base salaries or add one manually."
        />
      ) : (
        <div>
          <Table>
            <THead>
              <TR>
                <TH>Employee</TH>
                <TH align="right">Base</TH><TH align="right">Bonus</TH>
                <TH align="right">Deductions</TH><TH align="right">Net</TH>
                <TH>Status</TH><TH>Paid on</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {items.map(s => (
                <TR key={s.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={s.employee?.full_name} size="sm" />
                      <div>
                        <div className="font-medium text-zinc-100">{s.employee?.full_name}</div>
                        {s.employee?.role && <div className="text-xs text-zinc-500">{s.employee.role}</div>}
                      </div>
                    </div>
                  </TD>
                  <TD align="right">{formatLKR(s.amount)}</TD>
                  <TD align="right">{formatLKR(s.bonus)}</TD>
                  <TD align="right">{formatLKR(s.deductions)}</TD>
                  <TD align="right" className="font-semibold text-zinc-100">
                    {formatLKR(s.net_amount)}
                    {/* Pending salaries: warn that an outstanding advance
                        will be subtracted at pay time. */}
                    {s.status === 'pending' && advanceTotals[s.employee_id] > 0 && (
                      <div className="text-[10px] font-normal text-amber-300/90 mt-0.5">
                        −{formatLKR(advanceTotals[s.employee_id])} advance on pay
                      </div>
                    )}
                  </TD>
                  <TD>{s.status === 'paid' ? <Badge tone="emerald" dot>Paid</Badge> : <Badge tone="amber" dot>Pending</Badge>}</TD>
                  <TD className="text-zinc-400">{formatDate(s.paid_on)}</TD>
                  <TD align="right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {s.status === 'pending' ? (
                        <Button size="xs" variant="success" leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />} onClick={() => onPay(s)}>Pay</Button>
                      ) : (
                        <Button size="xs" variant="subtle" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => onUnpay(s)}>Unpay</Button>
                      )}
                      <DropdownMenu
                        trigger={
                          <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        }
                        items={[
                          { label: 'Edit', icon: Pencil, onClick: () => { setEditing(s); formDisc.onOpen() } },
                          { separator: true },
                          { label: 'Delete', icon: Trash2, danger: true, onClick: () => { setDeleting(s); confirmDisc.onOpen() } }
                        ]}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <SalaryFormModal
        open={formDisc.open}
        onClose={formDisc.onClose}
        salary={editing}
        defaultPeriod={{ year, month }}
        onSaved={load}
      />
      <AdvanceFormModal
        open={advanceDisc.open}
        onClose={advanceDisc.onClose}
        onSaved={load}
      />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this salary record?"
        description={
          deleting
            ? deleting.status === 'paid'
              ? 'This will reverse the salary expense (and restore any settled advances to outstanding), then delete the salary record.'
              : 'The salary record will be permanently removed.'
            : ''
        }
        confirmLabel="Delete"
        loading={busy}
      />
      <ConfirmDialog
        open={cancelAdvDisc.open}
        onClose={cancelAdvDisc.onClose}
        onConfirm={confirmCancelAdvance}
        title="Cancel this advance?"
        description={
          cancelingAdv
            ? `The ${formatLKR(cancelingAdv.amount)} advance for ${cancelingAdv.employee?.full_name ?? 'this employee'} will be removed and its linked Salary expense reversed.`
            : ''
        }
        confirmLabel="Cancel advance"
        loading={busy}
      />
    </div>
  )
}

function SummaryTile({ label, value, tone }) {
  return (
    <Card className="text-center sm:text-left">
      <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${
        tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-zinc-100'
      }`}>{value}</div>
    </Card>
  )
}
