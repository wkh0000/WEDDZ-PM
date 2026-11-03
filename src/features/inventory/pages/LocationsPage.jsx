import { useEffect, useState } from 'react'
import { Plus, Building2, Truck, Store, UserRound } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Modal from '@/components/ui/Modal'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { saveLocation, saveClient, listPmCustomersAndProjects } from '../api'
import { useInventory } from './InventoryLayout'
import { Check } from '../components/ProductFormModal'

const ICON = { office: Building2, vehicle: Truck, site: Store }

export default function LocationsPage() {
  const { locations, clients, can, reload } = useInventory()
  const locDisc = useDisclosure()
  const clientDisc = useDisclosure()
  const [editing, setEditing] = useState(null)
  const [editingClient, setEditingClient] = useState(null)

  useEffect(() => { document.title = 'Locations · WEDDZ PM' }, [])

  const stores = locations.filter(l => l.kind !== 'site')
  function editLoc(l) { setEditing(l); locDisc.onOpen() }
  function editClient(c) { setEditingClient(c); clientDisc.onOpen() }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        description="The office, vehicles and client sites (outlets) that stock moves between."
        actions={<>
          {can.finance && <Button variant="subtle" leftIcon={<UserRound className="w-4 h-4" />} onClick={() => editClient(null)}>New client</Button>}
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => editLoc(null)}>New location</Button>
        </>}
      />

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500">Office & vehicles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stores.map(l => <LocationCard key={l.id} loc={l} onEdit={() => editLoc(l)} />)}
        </div>
      </section>

      {clients.map(c => (
        <section key={c.id} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs uppercase tracking-widest text-zinc-500">
              {c.company || c.contact_name} <span className="normal-case tracking-normal text-zinc-600">· {c.contact_name} · ref {c.doc_ref}</span>
            </h2>
            {can.finance && <Button size="sm" variant="ghost" onClick={() => editClient(c)}>Edit client</Button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {locations.filter(l => l.client_id === c.id).map(l => <LocationCard key={l.id} loc={l} onEdit={() => editLoc(l)} />)}
          </div>
        </section>
      ))}

      <LocationFormModal open={locDisc.open} onClose={locDisc.onClose} location={editing} clients={clients} onSaved={reload} />
      {can.finance && <ClientFormModal open={clientDisc.open} onClose={clientDisc.onClose} client={editingClient} onSaved={reload} />}
    </div>
  )
}

function LocationCard({ loc, onEdit }) {
  const Icon = ICON[loc.kind]
  return (
    <Card hover className="cursor-pointer" onClick={onEdit}>
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-zinc-300 shrink-0"><Icon className="w-4 h-4" /></span>
        <div className="min-w-0">
          <div className="font-medium text-zinc-100 flex items-center gap-2">
            <span className="truncate">{loc.name}</span>
            {!loc.active && <Badge size="sm">Inactive</Badge>}
            {loc.kind === 'site' && !loc.is_outlet && <Badge size="sm" tone="violet">Not an outlet</Badge>}
          </div>
          {loc.address && <div className="text-xs text-zinc-400 mt-0.5">{loc.address}</div>}
          {loc.manager_name && <div className="text-xs text-zinc-500 mt-1">{loc.manager_name}{loc.manager_mobile ? ` · ${loc.manager_mobile}` : ''}</div>}
        </div>
      </div>
    </Card>
  )
}

function LocationFormModal({ open, onClose, location, clients, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (open) setF(location ?? { kind: 'site', name: '', client_id: clients[0]?.id ?? '', address: '', manager_name: '', manager_mobile: '', is_outlet: true, active: true, sort_order: 100 })
  }, [open, location, clients])

  async function submit(e) {
    e.preventDefault()
    if (!f.name?.trim()) { toast.error('Name is required'); return }
    if (f.kind === 'site' && !f.client_id) { toast.error('Choose the client this site belongs to'); return }
    setBusy(true)
    try {
      await saveLocation({
        ...(location ? { id: location.id } : {}),
        kind: f.kind, name: f.name.trim(), client_id: f.kind === 'site' ? f.client_id : null,
        address: f.address?.trim() || null, manager_name: f.manager_name?.trim() || null, manager_mobile: f.manager_mobile?.trim() || null,
        is_outlet: f.kind === 'site' ? f.is_outlet : true, active: f.active, sort_order: Number(f.sort_order) || 100
      })
      toast.success('Location saved'); onSaved?.(); onClose()
    } catch (err) { toast.error(err.message || 'Could not save') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={location ? 'Edit location' : 'New location'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Kind" value={f.kind} disabled={!!location} onChange={e => set('kind', e.target.value)}
            options={[{ value: 'site', label: 'Client site' }, { value: 'vehicle', label: 'Vehicle' }, { value: 'office', label: 'Office' }]} />
          {f.kind === 'site' && (
            <Select label="Client" value={f.client_id} onChange={e => set('client_id', e.target.value)}
              options={clients.map(c => ({ value: c.id, label: c.company || c.contact_name }))} />
          )}
        </div>
        <Input label="Name" value={f.name ?? ''} onChange={e => set('name', e.target.value)} placeholder={f.kind === 'vehicle' ? 'e.g. Van 2' : 'e.g. Royal Wine Stores'} />
        <Input label="Address" value={f.address ?? ''} onChange={e => set('address', e.target.value)} />
        {f.kind === 'site' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Manager name" value={f.manager_name ?? ''} onChange={e => set('manager_name', e.target.value)} placeholder="Mr. …" />
            <Input label="Manager mobile" value={f.manager_mobile ?? ''} onChange={e => set('manager_mobile', e.target.value)} />
          </div>
        )}
        <div className="flex flex-wrap gap-5">
          {f.kind === 'site' && <Check label="Outlet (branch)" checked={!!f.is_outlet} onChange={v => set('is_outlet', v)} />}
          <Check label="Active" checked={!!f.active} onChange={v => set('active', v)} />
        </div>
      </form>
    </Modal>
  )
}

function ClientFormModal({ open, onClose, client, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState({})
  const [pm, setPm] = useState({ customers: [], projects: [] })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (!open) return
    setF(client ?? { contact_name: '', company: '', mobile: '', doc_ref: `${new Date().getFullYear()}-`, quotation_no: '', project_title: '', notes: '', customer_id: '', project_id: '' })
    listPmCustomersAndProjects().then(setPm).catch(() => {})
  }, [open, client])

  async function submit(e) {
    e.preventDefault()
    if (!f.contact_name?.trim()) { toast.error('Contact name is required'); return }
    if (!/^\d{4}-\d{3}$/.test(f.doc_ref ?? '')) { toast.error('Document reference must look like 2026-085'); return }
    setBusy(true)
    try {
      await saveClient({
        ...(client ? { id: client.id } : {}),
        contact_name: f.contact_name.trim(), company: f.company?.trim() || null, mobile: f.mobile?.trim() || null,
        doc_ref: f.doc_ref, quotation_no: f.quotation_no?.trim() || null, project_title: f.project_title?.trim() || null,
        notes: f.notes?.trim() || null, customer_id: f.customer_id || null, project_id: f.project_id || null
      })
      toast.success('Client saved'); onSaved?.(); onClose()
    } catch (err) { toast.error(err.message || 'Could not save') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} width="lg" title={client ? 'Edit client' : 'New client'}
      description="Names and numbers printed on delivery notes, invoices and receipts."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Contact name (as printed)" value={f.contact_name ?? ''} onChange={e => set('contact_name', e.target.value)} placeholder="Mr. …" />
          <Input label="Company" value={f.company ?? ''} onChange={e => set('company', e.target.value)} />
          <Input label="Mobile" value={f.mobile ?? ''} onChange={e => set('mobile', e.target.value)} />
          <Input label="Document reference" value={f.doc_ref ?? ''} disabled={!!client} onChange={e => set('doc_ref', e.target.value)} hint="Year-project, e.g. 2026-085 → WIT-INV-2026-085-01" />
          <Input label="Quotation number" value={f.quotation_no ?? ''} onChange={e => set('quotation_no', e.target.value)} placeholder="WIT-Q-2026-085-R1" />
          <Input label="Project / system name" value={f.project_title ?? ''} onChange={e => set('project_title', e.target.value)} placeholder="Liquor Store Management System" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="PM customer (for cashflow)" value={f.customer_id ?? ''} onChange={e => set('customer_id', e.target.value)}
            options={[{ value: '', label: 'Not linked' }, ...pm.customers.map(c => ({ value: c.id, label: c.company ? `${c.name} — ${c.company}` : c.name }))]} />
          <Select label="PM project" value={f.project_id ?? ''} onChange={e => set('project_id', e.target.value)}
            options={[{ value: '', label: 'Not linked' }, ...pm.projects.filter(p => !f.customer_id || p.customer_id === f.customer_id).map(p => ({ value: p.id, label: p.name }))]} />
        </div>
        <Textarea label="Notes" rows={3} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} />
      </form>
    </Modal>
  )
}
