import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Mail, Phone, MapPin, Building2, FolderKanban, FileText } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate, formatLKR } from '@/lib/format'
import { isUuid } from '@/lib/slug'
import { getCustomer, getCustomerBySlug, deleteCustomer, listCustomerProjects, listCustomerInvoices } from '../api'
import CustomerFormModal from '../components/CustomerFormModal'
import { projectStatusBadge } from '@/features/projects/components/ProjectStatusBadge'
import { invoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge'

export default function CustomerDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [customer, setCustomer] = useState(null)
  const [projects, setProjects] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [slug])
  useEffect(() => { document.title = `${customer?.name ?? 'Customer'} · WEDDZ PM` }, [customer])

  async function load() {
    setLoading(true)
    try {
      let c
      if (isUuid(slug)) {
        c = await getCustomer(slug)
        if (c?.slug) navigate(`/customers/${c.slug}`, { replace: true })
      } else {
        c = await getCustomerBySlug(slug)
      }
      if (!c) { setCustomer(null); setProjects([]); setInvoices([]); return }
      const [ps, inv] = await Promise.all([
        listCustomerProjects(c.id),
        listCustomerInvoices(c.id)
      ])
      setCustomer(c); setProjects(ps); setInvoices(inv)
    } catch (err) {
      toast.error(err.message || 'Failed to load customer')
    } finally {
      setLoading(false)
    }
  }

  async function onDelete() {
    if (!customer) return
    setBusy(true)
    try {
      await deleteCustomer(customer.id)
      toast.success('Customer removed')
      navigate('/customers')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }
  if (!customer) {
    return (
      <EmptyState
        icon={Building2}
        title="Customer not found"
        description="This customer may have been deleted."
        action={<Link to="/customers"><Button leftIcon={<ArrowLeft className="w-4 h-4" />}>Back to customers</Button></Link>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<Link to="/customers" className="hover:text-zinc-300 inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Customers</Link>}
        title={customer.name}
        description={customer.company}
        actions={
          <>
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
          { value: 'projects', label: 'Projects', count: projects.length },
          { value: 'invoices', label: 'Invoices', count: invoices.length }
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <Field icon={Building2} label="Company" value={customer.company} />
              <Field icon={Mail} label="Email" value={customer.email} mono />
              <Field icon={Phone} label="Phone" value={customer.phone} mono />
              <Field icon={MapPin} label="Address" value={customer.address} />
            </div>
            {customer.notes && (
              <>
                <h3 className="text-sm font-semibold text-zinc-100 mt-6 mb-2">Notes</h3>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{customer.notes}</p>
              </>
            )}
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-zinc-100 mb-4">Summary</h3>
            <div className="space-y-3 text-sm">
              <SummaryRow label="Projects" value={projects.length} />
              <SummaryRow label="Active projects" value={projects.filter(p => p.status === 'active').length} />
              <SummaryRow label="Invoices" value={invoices.length} />
              <SummaryRow
                label="Unpaid total"
                value={formatLKR(invoices.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total ?? 0), 0))}
              />
              <SummaryRow label="Customer since" value={formatDate(customer.created_at)} />
            </div>
          </Card>
        </div>
      )}

      {tab === 'projects' && (
        projects.length === 0
          ? <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project and link it to this customer." />
          : (
            <Table>
              <THead>
                <TR>
                  <TH>Project</TH><TH>Status</TH><TH align="right">Budget</TH>
                  <TH>Start</TH><TH>End</TH>
                </TR>
              </THead>
              <tbody>
                {projects.map(p => (
                  <TR key={p.id} hover onClick={() => navigate(`/projects/${p.slug}`)}>
                    <TD className="font-medium text-zinc-100">{p.name}</TD>
                    <TD>{projectStatusBadge(p.status)}</TD>
                    <TD align="right">{formatLKR(p.budget)}</TD>
                    <TD className="text-zinc-400">{formatDate(p.start_date)}</TD>
                    <TD className="text-zinc-400">{formatDate(p.end_date)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
      )}

      {tab === 'invoices' && (
        invoices.length === 0
          ? <EmptyState icon={FileText} title="No invoices yet" description="Issue an invoice for this customer." />
          : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH><TH>Status</TH><TH align="right">Total</TH>
                  <TH>Issued</TH><TH>Due</TH>
                </TR>
              </THead>
              <tbody>
                {invoices.map(i => (
                  <TR key={i.id} hover onClick={() => navigate(`/invoices/${i.invoice_no}`)}>
                    <TD className="font-medium text-zinc-100 font-mono text-sm">{i.invoice_no}</TD>
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

      <CustomerFormModal open={editDisc.open} onClose={editDisc.onClose} customer={customer} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={onDelete}
        title="Delete this customer?"
        description={`"${customer.name}" will be removed. Projects/invoices keep their records but lose the link.`}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}

function Field({ icon: Icon, label, value, mono }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5 flex items-center gap-1.5"><Icon className="w-3 h-3" />{label}</div>
      <div className={`text-zinc-200 ${mono ? 'font-mono text-xs' : ''}`}>{value || <span className="text-zinc-500">—</span>}</div>
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
