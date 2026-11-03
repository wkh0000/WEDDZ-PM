import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Truck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listDeployments, saveDeployment } from '../api'
import { useInventory } from './InventoryLayout'
import { Check } from '../components/ProductFormModal'

export const STATUS_TONE = { planned: 'zinc', loaded: 'sky', delivered: 'indigo', closed: 'emerald' }

export default function DeploymentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { clients, locations } = useInventory()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const disc = useDisclosure()

  useEffect(() => { document.title = 'Deployments · WEDDZ PM'; load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try { setRows(await listDeployments()) } catch (err) { toast.error(err.message) } finally { setLoading(false) }
  }

  const name = id => locations.find(l => l.id === id)?.name
  return (
    <div className="space-y-6">
      <PageHeader
        title="Deployments"
        description="Trips to client sites: load the vehicle, deliver to each outlet, return what's left."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={disc.onOpen}>New deployment</Button>}
      />
      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Truck} title="No deployments yet" description="Plan a trip to load the vehicle and deliver to outlets."
          action={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={disc.onOpen}>New deployment</Button>} />
      ) : (
        <Table>
          <THead><TR><TH>Date</TH><TH>Client</TH><TH>Outlets</TH><TH>Vehicle</TH><TH>Staff</TH><TH>Status</TH></TR></THead>
          <tbody>
            {rows.map(d => (
              <TR key={d.id} hover onClick={() => navigate(`/inventory/deployments/${d.id}`)}>
                <TD className="whitespace-nowrap">{formatDate(d.deploy_date)}</TD>
                <TD>{clients.find(c => c.id === d.client_id)?.company ?? '—'}</TD>
                <TD className="text-zinc-400 text-sm">{d.site_ids.map(name).filter(Boolean).join(', ') || '—'}</TD>
                <TD className="text-zinc-400">{name(d.vehicle_id) ?? '—'}</TD>
                <TD className="text-zinc-400">{d.staff || '—'}</TD>
                <TD><Badge tone={STATUS_TONE[d.status]} size="sm">{d.status}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <NewDeploymentModal open={disc.open} onClose={disc.onClose} onCreated={d => navigate(`/inventory/deployments/${d.id}`)} />
    </div>
  )
}

function NewDeploymentModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const { clients, locations } = useInventory()
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const vehicles = locations.filter(l => l.kind === 'vehicle' && l.active)

  useEffect(() => {
    if (open) setF({ client_id: clients[0]?.id ?? '', deploy_date: new Date().toISOString().slice(0, 10), vehicle_id: vehicles[0]?.id ?? '', staff: '', site_ids: [] })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const sites = locations.filter(l => l.kind === 'site' && l.active && l.client_id === f.client_id)
  const toggle = id => setF(s => ({ ...s, site_ids: s.site_ids.includes(id) ? s.site_ids.filter(x => x !== id) : [...s.site_ids, id] }))

  async function submit() {
    if (!f.client_id || !f.vehicle_id || !f.site_ids.length) { toast.error('Choose a client, a vehicle and at least one outlet'); return }
    setBusy(true)
    try { const d = await saveDeployment({ ...f, staff: f.staff.trim() || null, status: 'planned' }); onClose(); onCreated(d) }
    catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="New deployment"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Create</Button></>}>
      <div className="space-y-4">
        <Select label="Client" value={f.client_id ?? ''} onChange={e => setF(s => ({ ...s, client_id: e.target.value, site_ids: [] }))}
          options={clients.map(c => ({ value: c.id, label: c.company || c.contact_name }))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={f.deploy_date ?? ''} onChange={e => setF(s => ({ ...s, deploy_date: e.target.value }))} />
          <Select label="Vehicle" value={f.vehicle_id ?? ''} onChange={e => setF(s => ({ ...s, vehicle_id: e.target.value }))} options={vehicles.map(v => ({ value: v.id, label: v.name }))} />
        </div>
        <Input label="Staff" value={f.staff ?? ''} onChange={e => setF(s => ({ ...s, staff: e.target.value }))} placeholder="e.g. Kasun, Tharindu" />
        <div>
          <div className="text-xs font-medium text-zinc-300 uppercase tracking-wide mb-2">Outlets</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sites.map(s => <Check key={s.id} label={s.name} checked={f.site_ids?.includes(s.id)} onChange={() => toggle(s.id)} />)}
          </div>
        </div>
      </div>
    </Modal>
  )
}
