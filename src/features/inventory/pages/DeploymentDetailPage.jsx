import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, X, Truck, PackageCheck, Undo2, FileDown, CheckCircle2, Printer } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { getDeployment, saveDeployment, postMovements, listDeploymentMovements, listDocuments } from '../api'
import { onHand, validateMoves } from '../lib/stock'
import { buildLoadingListVM } from '../lib/viewModel'
import { renderVM, saveBytes, downloadDocument } from '../docs'
import { useInventory } from './InventoryLayout'
import { STATUS_TONE } from './DeploymentsPage'
import DeliverModal from '../components/DeliverModal'

export default function DeploymentDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { products, locations, clients, stock, reload } = useInventory()
  const [dep, setDep] = useState(null)
  const [moves, setMoves] = useState([])
  const [dns, setDns] = useState([])
  const [plan, setPlan] = useState([])
  const [addId, setAddId] = useState('')
  const [busy, setBusy] = useState(false)
  const [deliverSite, setDeliverSite] = useState(null)
  const deliverDisc = useDisclosure()
  const returnDisc = useDisclosure()

  async function load() {
    try {
      const d = await getDeployment(id)
      const [m, docs] = await Promise.all([listDeploymentMovements(id), listDocuments({ clientId: d.client_id, type: 'DELIVERY_NOTE' })])
      setDep(d); setPlan(d.planned_lines ?? []); setMoves(m); setDns(docs.filter(x => x.deployment_id === id))
    } catch (err) { toast.error(err.message) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (dep) document.title = `Deployment ${formatDate(dep.deploy_date)} · WEDDZ PM` }, [dep])

  const vehicle = locations.find(l => l.id === dep?.vehicle_id)
  const office = locations.find(l => l.kind === 'office' && l.active)
  const client = clients.find(c => c.id === dep?.client_id)
  const sites = locations.filter(l => dep?.site_ids.includes(l.id))
  const pName = pid => products.find(p => p.id === pid)?.name ?? 'Item'

  const loaded = useMemo(() => {
    const map = new Map()
    for (const m of moves) if (m.type === 'TRANSFER_TO_VEHICLE') map.set(m.product_id, (map.get(m.product_id) ?? 0) + m.qty)
    return map
  }, [moves])
  const onVehicle = products.filter(p => p.is_stock && vehicle && onHand(stock, p.id, vehicle.id) > 0)

  if (!dep) return <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>

  async function savePlan(next) {
    setPlan(next)
    try { setDep(await saveDeployment({ id: dep.id, planned_lines: next })) } catch (err) { toast.error(err.message) }
  }

  async function loadVehicle() {
    const rows = plan.filter(l => l.qty > 0).map(l => ({
      moved_on: dep.deploy_date, product_id: l.product_id, qty: l.qty, type: 'TRANSFER_TO_VEHICLE',
      from_location_id: office.id, to_location_id: vehicle.id, deployment_id: dep.id, reference: `Deployment ${dep.deploy_date}`
    }))
    const problems = validateMoves(stock, rows, { products, locations })
    if (problems.length) { toast.error(problems[0]); return }
    setBusy(true)
    try {
      await postMovements(rows)
      setDep(await saveDeployment({ id: dep.id, status: dep.status === 'planned' ? 'loaded' : dep.status }))
      await Promise.all([reload(), load()])
      toast.success(`Loaded ${rows.reduce((s, r) => s + r.qty, 0)} items onto ${vehicle.name}`)
    } catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  async function printLoadingList() {
    const source = loaded.size ? [...loaded.entries()].map(([product_id, qty]) => ({ product_id, qty })) : plan
    const items = []
    for (const l of source) {
      const p = products.find(x => x.id === l.product_id)
      if (!p || !(l.qty > 0)) continue
      items.push({ name: p.dn_name || p.name, ...(p.dn_detail ? { detail: p.dn_detail } : {}), qty: l.qty })
      for (const c of p.dn_components ?? []) items.push({ name: c.name, qty: l.qty })
    }
    if (!items.length) { toast.info('Nothing planned or loaded yet'); return }
    const bytes = await renderVM(buildLoadingListVM({ deployment: dep, client, vehicle, sites, items }))
    saveBytes(bytes, `Loading-list-${vehicle.name.replace(/\s+/g, '-')}-${dep.deploy_date}.pdf`)
  }

  async function setStatus(status) {
    try { setDep(await saveDeployment({ id: dep.id, status })) } catch (err) { toast.error(err.message) }
  }

  const productOptions = products.filter(p => p.is_stock && p.active && !plan.some(l => l.product_id === p.id))

  return (
    <div className="space-y-6">
      <Link to="/inventory/deployments" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="w-4 h-4" /> Deployments</Link>
      <PageHeader
        title={`${client?.company ?? 'Deployment'} — ${formatDate(dep.deploy_date)}`}
        description={[vehicle?.name, dep.staff, sites.map(s => s.name).join(', ')].filter(Boolean).join(' · ')}
        actions={<>
          <Badge tone={STATUS_TONE[dep.status]}>{dep.status}</Badge>
          <Button variant="subtle" leftIcon={<Printer className="w-4 h-4" />} onClick={printLoadingList}>Loading list</Button>
          {dep.status !== 'closed' && <Button variant="subtle" leftIcon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setStatus('closed')}>Close trip</Button>}
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-zinc-100 flex items-center gap-2"><Truck className="w-4 h-4 text-indigo-300" /> 1 · Plan & load</h3>
            <Button size="sm" leftIcon={<PackageCheck className="w-4 h-4" />} loading={busy} disabled={!plan.some(l => l.qty > 0) || dep.status === 'closed'} onClick={loadVehicle}>
              {loaded.size ? 'Load more' : 'Load vehicle'}
            </Button>
          </div>
          <div className="space-y-1.5">
            {plan.map((l, i) => (
              <div key={l.product_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate text-zinc-200">{pName(l.product_id)}</span>
                <span className="text-xs text-zinc-500 w-24 text-right">office {office ? onHand(stock, l.product_id, office.id) : 0}</span>
                <input type="number" min="0" value={l.qty} onChange={e => savePlan(plan.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                  className="w-20 text-right rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1 text-sm text-zinc-100" />
                <button className="p-1 text-zinc-500 hover:text-zinc-200" onClick={() => savePlan(plan.filter((_, j) => j !== i))}><X className="w-4 h-4" /></button>
              </div>
            ))}
            {!plan.length && <p className="text-sm text-zinc-500">Add the items to take on this trip.</p>}
          </div>
          <div className="flex items-end gap-2 mt-3">
            <div className="flex-1"><Select value={addId} onChange={e => setAddId(e.target.value)} options={[{ value: '', label: 'Add item…' }, ...productOptions.map(p => ({ value: p.id, label: p.name }))]} /></div>
            <Button variant="subtle" leftIcon={<Plus className="w-4 h-4" />} disabled={!addId} onClick={() => { savePlan([...plan, { product_id: addId, qty: 1 }]); setAddId('') }}>Add</Button>
          </div>
          {loaded.size > 0 && (
            <p className="text-xs text-zinc-500 mt-3">Loaded so far: {[...loaded.entries()].map(([pid, q]) => `${q} × ${pName(pid)}`).join(', ')}</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-zinc-100">On {vehicle?.name} now</h3>
            <Button size="sm" variant="subtle" leftIcon={<Undo2 className="w-4 h-4" />} disabled={!onVehicle.length} onClick={returnDisc.onOpen}>Return to office</Button>
          </div>
          {onVehicle.length ? (
            <ul className="text-sm space-y-1">
              {onVehicle.map(p => <li key={p.id} className="flex justify-between"><span className="text-zinc-300">{p.name}</span><span className="tabular-nums text-zinc-100">{onHand(stock, p.id, vehicle.id)}</span></li>)}
            </ul>
          ) : <p className="text-sm text-zinc-500">The vehicle is empty.</p>}
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-zinc-100 mb-3">2 · Deliver to outlets</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sites.map(s => {
            const notes = dns.filter(d => d.site_ids.includes(s.id))
            return (
              <div key={s.id} className="rounded-xl border border-white/10 p-3 space-y-2">
                <div className="font-medium text-zinc-100">{s.name}</div>
                {s.manager_name && <div className="text-xs text-zinc-500">{s.manager_name}{s.manager_mobile ? ` · ${s.manager_mobile}` : ''}</div>}
                {notes.map(d => (
                  <button key={d.id} onClick={() => downloadDocument(d, { clients, locations }).catch(err => toast.error(err.message))}
                    className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200"><FileDown className="w-3.5 h-3.5" /> {d.doc_no}</button>
                ))}
                <Button size="sm" variant={notes.length ? 'subtle' : 'primary'} disabled={!onVehicle.length && !notes.length}
                  onClick={() => { setDeliverSite(s.id); deliverDisc.onOpen() }}>
                  {notes.length ? 'Deliver more' : 'Deliver'}
                </Button>
              </div>
            )
          })}
        </div>
      </Card>

      <DeliverModal open={deliverDisc.open} onClose={deliverDisc.onClose} clientId={dep.client_id} siteIds={deliverSite ? [deliverSite] : dep.site_ids}
        fromLocationId={dep.vehicle_id} deploymentId={dep.id} defaultDate={dep.deploy_date}
        onDelivered={async () => { if (dep.status !== 'closed') await setStatus('delivered'); load() }} />
      <ReturnModal open={returnDisc.open} onClose={returnDisc.onClose} dep={dep} vehicle={vehicle} office={office} items={onVehicle}
        onDone={async () => { await Promise.all([reload(), load()]) }} />
    </div>
  )
}

function ReturnModal({ open, onClose, dep, vehicle, office, items, onDone }) {
  const toast = useToast()
  const { stock } = useInventory()
  const [qty, setQty] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setQty(Object.fromEntries(items.map(p => [p.id, onHand(stock, p.id, vehicle.id)]))) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const rows = items.filter(p => Number(qty[p.id]) > 0).map(p => ({
      moved_on: new Date().toISOString().slice(0, 10), product_id: p.id, qty: Number(qty[p.id]), type: 'RETURN_TO_OFFICE',
      from_location_id: vehicle.id, to_location_id: office.id, deployment_id: dep.id, reference: `Deployment ${dep.deploy_date}`
    }))
    if (!rows.length) return
    setBusy(true)
    try { await postMovements(rows); toast.success('Returned to the office'); await onDone(); onClose() }
    catch (err) { toast.error(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Return unused items to ${office?.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Return</Button></>}>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 text-zinc-200">{p.name}</span>
            <span className="text-xs text-zinc-500">on vehicle {onHand(stock, p.id, vehicle.id)}</span>
            <input type="number" min="0" max={onHand(stock, p.id, vehicle.id)} value={qty[p.id] ?? 0} onChange={e => setQty(s => ({ ...s, [p.id]: e.target.value }))}
              className="w-20 text-right rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1 text-sm text-zinc-100" />
          </div>
        ))}
      </div>
    </Modal>
  )
}
