import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Mail, Phone, Briefcase, Calendar, Wallet, UserCog } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate, formatMonth } from '@/lib/format'
import { isUuid } from '@/lib/slug'
import { getEmployee, getEmployeeBySlug, deleteEmployee, listEmployeeSalaries, EMPLOYMENT_TYPES } from '../api'
import EmployeeFormModal from '../components/EmployeeFormModal'

export default function EmployeeDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [employee, setEmployee] = useState(null)
  const [salaries, setSalaries] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => { load() }, [slug])
  useEffect(() => { document.title = `${employee?.full_name ?? 'Employee'} · WEDDZ PM` }, [employee])

  async function load() {
    setLoading(true)
    try {
      let e
      if (isUuid(slug)) {
        e = await getEmployee(slug)
        if (e?.slug) navigate(`/employees/${e.slug}`, { replace: true })
      } else {
        e = await getEmployeeBySlug(slug)
      }
      if (!e) { setEmployee(null); setSalaries([]); return }
      const s = await listEmployeeSalaries(e.id)
      setEmployee(e); setSalaries(s)
    } catch (err) {
      toast.error(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function onDelete() {
    if (!employee) return
    setBusy(true)
    try { await deleteEmployee(employee.id); toast.success('Employee removed'); navigate('/employees') }
    catch (err) { toast.error(err.message || 'Failed to delete'); setBusy(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!employee) {
    return (
      <EmptyState
        icon={UserCog}
        title="Employee not found"
        description="This employee may have been deleted."
        action={<Link to="/employees"><Button leftIcon={<ArrowLeft className="w-4 h-4" />}>Back</Button></Link>}
      />
    )
  }

  const totalPaid = salaries.filter(s => s.status === 'paid').reduce((sum, s) => sum + Number(s.net_amount ?? 0), 0)
  const empType = EMPLOYMENT_TYPES.find(t => t.value === employee.employment_type)?.label ?? employee.employment_type

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={<Link to="/employees" className="hover:text-zinc-300 inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Employees</Link>}
        title={employee.full_name}
        description={employee.role}
        actions={
          <>
            <Button variant="subtle" leftIcon={<Pencil className="w-4 h-4" />} onClick={editDisc.onOpen}>Edit</Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={confirmDisc.onOpen}>Delete</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-start gap-4 mb-5">
            <Avatar name={employee.full_name} src={employee.photo_url} size="xl" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-zinc-100">{employee.full_name}</h3>
                {employee.active ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="rose" dot>Inactive</Badge>}
              </div>
              <div className="text-sm text-zinc-400">{employee.role}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Field icon={Briefcase} label="Type" value={empType} />
            <Field icon={Wallet}    label="Base salary" value={formatLKR(employee.base_salary)} />
            <Field icon={Calendar}  label="Joined"  value={formatDate(employee.joined_on)} />
            <Field icon={Mail}      label="Email"   value={employee.email} mono />
            <Field icon={Phone}     label="Phone"   value={employee.phone} mono />
          </div>
          {employee.notes && (
            <>
              <h3 className="text-sm font-semibold text-zinc-100 mt-6 mb-2">Notes</h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{employee.notes}</p>
            </>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-zinc-100 mb-4">Salary stats</h3>
          <div className="space-y-3 text-sm">
            <SummaryRow label="Periods recorded" value={salaries.length} />
            <SummaryRow label="Periods paid"     value={salaries.filter(s => s.status === 'paid').length} />
            <SummaryRow label="Total paid"       value={formatLKR(totalPaid)} />
          </div>
          <div className="mt-4 pt-4 border-t border-white/10">
            <Link to="/salaries"><Button variant="subtle" className="w-full">Open salaries page</Button></Link>
          </div>
        </Card>
      </div>

      <Card padded={false}>
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Salary history</h3>
        </div>
        {salaries.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">No salary records yet.</div>
        ) : (
          <Table className="border-0">
            <THead>
              <TR>
                <TH>Period</TH><TH align="right">Base</TH><TH align="right">Bonus</TH>
                <TH align="right">Deductions</TH><TH align="right">Net</TH>
                <TH>Status</TH><TH>Paid on</TH>
              </TR>
            </THead>
            <tbody>
              {salaries.map(s => (
                <TR key={s.id}>
                  <TD className="font-medium text-zinc-100">{formatMonth(s.period_year, s.period_month)}</TD>
                  <TD align="right">{formatLKR(s.amount)}</TD>
                  <TD align="right">{formatLKR(s.bonus)}</TD>
                  <TD align="right">{formatLKR(s.deductions)}</TD>
                  <TD align="right" className="font-semibold text-zinc-100">{formatLKR(s.net_amount)}</TD>
                  <TD>{s.status === 'paid' ? <Badge tone="emerald" dot>Paid</Badge> : <Badge tone="amber" dot>Pending</Badge>}</TD>
                  <TD className="text-zinc-400">{formatDate(s.paid_on)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <EmployeeFormModal open={editDisc.open} onClose={editDisc.onClose} employee={employee} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={onDelete}
        title="Delete this employee?"
        description={`"${employee.full_name}" and their salary history will be permanently removed.`}
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
