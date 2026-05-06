import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users, Building2, Mail, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'
import DropdownMenu from '@/components/ui/DropdownMenu'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listCustomers, deleteCustomer } from '../api'
import CustomerFormModal from '../components/CustomerFormModal'

export default function CustomersListPage() {
  const toast = useToast()
  const formDisc = useDisclosure()
  const confirmDisc = useDisclosure()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const debouncedSearch = useDebounce(search, 200)

  useEffect(() => { document.title = 'Customers · WEDDZ PM'; load() }, [])

  async function load() {
    setLoading(true)
    try { setItems(await listCustomers()) }
    catch (err) { toast.error(err.message || 'Failed to load customers') }
    finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return items
    return items.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    )
  }, [items, debouncedSearch])

  function openAdd() { setEditing(null); formDisc.onOpen() }
  function openEdit(c) { setEditing(c); formDisc.onOpen() }
  function askDelete(c) { setDeleting(c); confirmDisc.onOpen() }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await deleteCustomer(deleting.id)
      toast.success('Customer removed')
      setItems(arr => arr.filter(x => x.id !== deleting.id))
      confirmDisc.onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="People and companies you do work for."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add customer</Button>}
      />

      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-md">
          <Input
            leftIcon={<Search className="w-4 h-4" />}
            placeholder="Search by name, company, email, phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto text-xs text-zinc-500">
          {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex items-center justify-center"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'No matches' : 'No customers yet'}
          description={search ? 'Try a different query.' : 'Add your first customer to get started.'}
          action={!search && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={openAdd}>Add customer</Button>}
        />
      ) : (
        <div>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Company</TH>
                <TH>Contact</TH>
                <TH>Added</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {filtered.map(c => (
                <TR key={c.id}>
                  <TD>
                    <Link to={`/customers/${c.id}`} className="font-medium text-zinc-100 hover:text-indigo-300 transition-colors">
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-zinc-300">
                    {c.company ? (
                      <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-zinc-500" />{c.company}</span>
                    ) : <span className="text-zinc-500">—</span>}
                  </TD>
                  <TD className="text-zinc-400 text-sm">
                    {c.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{c.email}</div>}
                    {c.phone && <div className="text-zinc-500">{c.phone}</div>}
                    {!c.email && !c.phone && <span className="text-zinc-500">—</span>}
                  </TD>
                  <TD className="text-zinc-400">{formatDate(c.created_at)}</TD>
                  <TD align="right">
                    <DropdownMenu
                      trigger={
                        <button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => openEdit(c) },
                        { separator: true },
                        { label: 'Delete', icon: Trash2, danger: true, onClick: () => askDelete(c) }
                      ]}
                    />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <CustomerFormModal open={formDisc.open} onClose={formDisc.onClose} customer={editing} onSaved={load} />
      <ConfirmDialog
        open={confirmDisc.open}
        onClose={confirmDisc.onClose}
        onConfirm={confirmDelete}
        title="Delete this customer?"
        description={deleting ? `"${deleting.name}" will be removed. Linked projects/invoices will keep their data but lose the customer link.` : ''}
        confirmLabel="Delete"
        loading={busy}
      />
    </div>
  )
}
