import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Calendar, Wallet, Users, KanbanSquare, FileText, Receipt } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate, formatLKR } from '@/lib/format'
import { getProject, deleteProject, listProjectInvoices, listProjectExpenses } from '../api'
import ProjectFormModal from '../components/ProjectFormModal'
import ProjectUpdatesLog from '../components/ProjectUpdatesLog'
import { projectStatusBadge } from '../components/ProjectStatusBadge'
import { invoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [project, setProject] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [id])
  useEffect(() => { document.title = `${project?.name ?? 'Project'} · WEDDZ PM` }, [project])

  async function load() {
    setLoading(true)
    try {
      const [p, inv, exp] = await Promise.all([
        getProject(id),
        listProjectInvoices(id),
        listProjectExpenses(id)
      ])
      setProject(p); setInvoices(inv); setExpenses(exp)
    } catch (err) {
      toast.error(err.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  async function onDelete() {
    setBusy(true)
    try {
      await deleteProject(id)
      toast.success('Project removed')
      navigate('/projects')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
      setBusy(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!project) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="Project not found"
        description="This project may have been deleted."
        action={<Link to="/projects"><Button leftIcon={<ArrowLeft className="w-4 h-4" />}>Back to projects</Button></Link>}
      />
    )
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const totalRevenue  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total ?? 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<Link to="/projects" className="hover:text-zinc-300 inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Projects</Link>}
        title={project.name}
        description={
          project.customer
            ? <>Customer: <Link to={`/customers/${project.customer.id}`} className="text-indigo-300 hover:text-indigo-200">{project.customer.company || project.customer.name}</Link></>
            : 'Internal project'
        }
        actions={
          <>
            <Link to={`/projects/${id}/board`}>
              <Button variant="primary" leftIcon={<KanbanSquare className="w-4 h-4" />}>Open board</Button>
            </Link>
            <Button variant="subtle" leftIcon={<Pencil className="w-4 h-4" />} onClick={editDisc.onOpen}>Edit</Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={confirmDisc.onOpen}>Delete</Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'updates',  label: 'Updates' },
          { value: 'invoices', label: 'Invoices', count: invoices.length },
          { value: 'expenses', label: 'Expenses', count: expenses.length }
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-semibold text-zinc-100">Details</h3>
              {projectStatusBadge(project.status)}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <Field icon={Wallet}   label="Budget" value={formatLKR(project.budget)} />
              <Field icon={Calendar} label="Start"  value={formatDate(project.start_date)} />
              <Field icon={Calendar} label="End"    value={formatDate(project.end_date)} />
              <Field icon={Users}    label="Customer" value={project.customer ? (project.customer.company || project.customer.name) : '—'} />
            </div>
            {project.description && (
              <>
                <h3 className="text-sm font-semibold text-zinc-100 mt-6 mb-2">Description</h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{project.description}</p>
              </>
            )}
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">Financials</h3>
            <div className="space-y-3 text-sm">
              <SummaryRow label="Budget"        value={formatLKR(project.budget)} />
              <SummaryRow label="Revenue (paid)" value={formatLKR(totalRevenue)} />
              <SummaryRow label="Expenses"      value={formatLKR(totalExpenses)} />
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-zinc-400">Net</span>
                <span className={`font-semibold tabular-nums ${totalRevenue - totalExpenses >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {formatLKR(totalRevenue - totalExpenses)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'updates' && <ProjectUpdatesLog projectId={id} />}

      {tab === 'invoices' && (
        invoices.length === 0
          ? <EmptyState icon={FileText} title="No invoices" description="Issue an invoice for this project." />
          : (
            <Table>
              <THead>
                <TR><TH>Invoice</TH><TH>Status</TH><TH align="right">Total</TH><TH>Issued</TH><TH>Due</TH></TR>
              </THead>
              <tbody>
                {invoices.map(i => (
                  <TR key={i.id} hover onClick={() => navigate(`/invoices/${i.id}`)}>
                    <TD className="font-mono text-sm text-zinc-100">{i.invoice_no}</TD>
                    <TD>{invoiceStatusBadge(i.status)}</TD>
                    <TD align="right">{formatLKR(i.total)}</TD>
                    <TD className="text-zinc-400">{formatDate(i.issue_date)}</TD>
                    <TD className="text-zinc-400">{formatDate(i.due_date)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
      )}

      {tab === 'expenses' && (
        expenses.length === 0
          ? <EmptyState icon={Receipt} title="No expenses" description="Project-linked expenses will appear here." />
          : (
            <Table>
              <THead>
                <TR><TH>Description</TH><TH>Category</TH><TH>Date</TH><TH align="right">Amount</TH></TR>
              </THead>
              <tbody>
                {expenses.map(e => (
                  <TR key={e.id}>
                    <TD className="text-zinc-100">{e.description}</TD>
                    <TD className="text-zinc-300">{e.category}</TD>
                    <TD className="text-zinc-400">{formatDate(e.expense_date)}</TD>
                    <TD align="right">{formatLKR(e.amount)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
      )}

      <ProjectFormModal open={editDisc.open} onClose={editDisc.onClose} project={project} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={onDelete}
        title="Delete this project?"
        description={`"${project.name}" and all its tasks, columns, and updates will be permanently removed. Linked invoices/expenses keep their records.`}
        confirmLabel="Delete project"
        loading={busy}
      />
    </div>
  )
}

function Field({ icon: Icon, label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5 flex items-center gap-1.5"><Icon className="w-3 h-3" />{label}</div>
      <div className="text-zinc-200 font-medium">{value || <span className="text-zinc-500">—</span>}</div>
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-100 font-medium tabular-nums">{value}</span>
    </div>
  )
}
