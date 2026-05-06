import { useEffect, useState, useMemo } from 'react'
import { Plus, Search, Receipt, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate, formatMonth } from '@/lib/format'
import { listExpenses, deleteExpense, EXPENSE_CATEGORIES } from '../api'
import ExpenseFormModal from '../components/ExpenseFormModal'
import MonthlySummary from '../components/MonthlySummary'
import { cn } from '@/lib/cn'

export default function ExpensesListPage() {
  const toast = useToast()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const today = new Date()
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [scope, setScope] = useState('all') // all | general | project
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Expenses · WEDDZ PM'; load() }, [year, month, categoryFilter, scope])

  async function load() {
    setLoading(true)
    try {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
      const data = await listExpenses({
        from,
        to: shiftBack(to),
        category: categoryFilter === 'all' ? undefined : categoryFilter,
        projectScope: scope === 'all' ? undefined : scope
      })
      setItems(data)
    } catch (err) {
      toast.error(err.message || 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(e =>
      e.description?.toLowerCase().includes(q) ||
      e.category?.toLowerCase().includes(q) ||
      e.project?.name?.toLowerCase().includes(q)
    )
  }, [items, debouncedSearch])

  function openAdd() { setEditing(null); formDisc.onOpen() }
  function openEdit(e) {
    if (e.salary_id) { toast.info('Salary expenses are managed from the Salaries page.'); return }
    setEditing(e); formDisc.onOpen()
  }
  function askDelete(e) {
    if (e.salary_id) { toast.info('Reverse the salary payment from the Salaries page to remove this expense.'); return }
    setDeleting(e); confirmDisc.onOpen()
  }
  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteExpense(deleting.id)
      toast.success('Expense removed')
      setItems(arr => arr.filter(x => x.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  function shiftMonth(delta) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth() + 1)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track project-linked and general expenses with monthly breakdowns."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add expense</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex items-center gap-3 glass rounded-2xl p-3">
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)} leftIcon={<ChevronLeft className="w-4 h-4" />}>Prev</Button>
          <div className="flex-1 text-center">
            <div className="text-xs uppercase tracking-widest text-zinc-500">Month</div>
            <div className="font-semibold text-zinc-100">{formatMonth(year, month)}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)} rightIcon={<ChevronRight className="w-4 h-4" />}>Next</Button>
          <Button variant="subtle" size="sm" onClick={() => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth() + 1) }}>Today</Button>
        </div>
        <MonthlySummary year={year} month={month} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={scope === 'all'} onClick={() => setScope('all')}>All</FilterChip>
          <FilterChip active={scope === 'general'} onClick={() => setScope('general')}>General</FilterChip>
          <FilterChip active={scope === 'project'} onClick={() => setScope('project')}>Project</FilterChip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>All categories</FilterChip>
          {EXPENSE_CATEGORIES.map(c => (
            <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>{c}</FilterChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses for this period"
          description="Try a different month, scope, or category. Or add an expense."
          action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add expense</Button>}
        />
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Table>
            <THead>
              <TR>
                <TH>Description</TH><TH>Category</TH><TH>Date</TH>
                <TH>Project</TH><TH align="right">Amount</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map(e => (
                <TR key={e.id}>
                  <TD className="text-zinc-100">
                    <div className="flex items-center gap-2">
                      {e.salary_id && <Lock className="w-3.5 h-3.5 text-zinc-500" />}
                      <span>{e.description}</span>
                    </div>
                  </TD>
                  <TD><Badge tone={categoryTone(e.category)}>{e.category}</Badge></TD>
                  <TD className="text-zinc-400">{formatDate(e.expense_date)}</TD>
                  <TD className="text-zinc-300">
                    {e.project?.name || <span className="text-zinc-500 italic">General</span>}
                  </TD>
                  <TD align="right">{formatLKR(e.amount)}</TD>
                  <TD align="right">
                    <DropdownMenu
                      trigger={
                        <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => openEdit(e), disabled: !!e.salary_id },
                        { separator: true },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(e), disabled: !!e.salary_id }
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </motion.div>
      )}

      <ExpenseFormModal open={formDisc.open} onClose={formDisc.onClose} expense={editing} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this expense?"
        description={deleting ? `"${deleting.description}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function categoryTone(c) {
  return ({
    Software: 'indigo', Hardware: 'violet', Travel: 'sky',
    Subcontractor: 'emerald', Marketing: 'amber', Salary: 'rose',
    Other: 'default'
  })[c] || 'default'
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-full text-xs font-medium border transition-colors',
        active
          ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30'
          : 'bg-white/[0.04] text-zinc-400 border-white/10 hover:text-zinc-200 hover:border-white/20'
      )}
    >
      {children}
    </button>
  )
}

function shiftBack(isoDate) {
  // 'to' end-of-window comes in as next-month-1st; shift to last day of month
  const d = new Date(isoDate)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
