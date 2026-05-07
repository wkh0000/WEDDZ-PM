import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, UserCog, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Avatar from '@/components/ui/Avatar'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatLKR, formatDate } from '@/lib/format'
import { listEmployees, deleteEmployee, EMPLOYMENT_TYPES } from '../api'
import EmployeeFormModal from '../components/EmployeeFormModal'

export default function EmployeesListPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Employees · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try { setItems(await listEmployees()) }
    catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(e =>
      e.full_name?.toLowerCase().includes(q) ||
      e.role?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q)
    )
  }, [items, debouncedSearch])

  function openAdd() { setEditing(null); formDisc.onOpen() }
  function openEdit(e) { setEditing(e); formDisc.onOpen() }
  function askDelete(e) { setDeleting(e); confirmDisc.onOpen() }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteEmployee(deleting.id)
      toast.success('Employee removed')
      setItems(arr => arr.filter(x => x.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  const labelOf = (v) => EMPLOYMENT_TYPES.find(t => t.value === v)?.label ?? v

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="HR records: titles, base salaries, employment type."
        actions={
          <>
            <Link to="/salaries"><Button variant="subtle">Salaries →</Button></Link>
            <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add employee</Button>
          </>
        }
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Search by name, title, email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ml-auto text-xs text-zinc-500">
          {filtered.length} {filtered.length === 1 ? 'employee' : 'employees'}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title={search ? 'No matches' : 'No employees yet'}
          description={search ? 'Try a different query.' : 'Add your first employee to start tracking salaries.'}
          action={!search && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add employee</Button>}
        />
      ) : (
        <div>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH><TH>Role</TH><TH>Type</TH>
                <TH align="right">Base salary</TH>
                <TH>Joined</TH><TH>Status</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map(e => (
                <TR key={e.id} hover onClick={() => navigate(`/employees/${e.slug}`)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                      <div className="font-medium text-zinc-100">{e.full_name}</div>
                    </div>
                  </TD>
                  <TD className="text-zinc-300">{e.role || '—'}</TD>
                  <TD className="text-zinc-400">{labelOf(e.employment_type)}</TD>
                  <TD align="right">{formatLKR(e.base_salary)}</TD>
                  <TD className="text-zinc-400">{formatDate(e.joined_on)}</TD>
                  <TD>{e.active ? <Badge tone="emerald" dot>Active</Badge> : <Badge tone="rose" dot>Inactive</Badge>}</TD>
                  <TD align="right" onClick={ev => ev.stopPropagation()}>
                    <DropdownMenu
                      trigger={
                        <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => openEdit(e) },
                        { separator: true },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(e) }
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <EmployeeFormModal open={formDisc.open} onClose={formDisc.onClose} employee={editing} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this employee?"
        description={deleting ? `"${deleting.full_name}" and their salary history will be permanently removed.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}
