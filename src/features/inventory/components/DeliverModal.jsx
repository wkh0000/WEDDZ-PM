import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/context/ToastContext'
import { deliver, getDocument, addSerials } from '../api'
import { onHand, validateMoves } from '../lib/stock'
import { regenerateDocument, saveBytes } from '../docs'
import { useInventory } from '../pages/InventoryLayout'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Hand items over at a client site → delivery note + ledger rows.
 * `fromLocationId` fixes the source (a deployment's vehicle); otherwise the
 * user picks the office or a vehicle.
 */
export default function DeliverModal({ open, onClose, clientId, siteIds, fromLocationId, deploymentId, defaultDate, onDelivered }) {
  const toast = useToast()
  const { products, locations, clients, stock, reload } = useInventory()
  const [siteId, setSiteId] = useState('')
  const [fromId, setFromId] = useState('')
  const [date, setDate] = useState(today())
  const [billing, setBilling] = useState('Invoice to follow')
  const [qty, setQty] = useState({})
  const [extra, setExtra] = useState({})
  const [contents, setContents] = useState({})
  const [serials, setSerials] = useState({})
  const [addId, setAddId] = useState('')
  const [busy, setBusy] = useState(false)

  const sites = locations.filter(l => l.kind === 'site' && l.active && (!clientId || l.client_id === clientId) && (!siteIds?.length || siteIds.includes(l.id)))
  const sources = locations.filter(l => (l.kind === 'office' || l.kind === 'vehicle') && l.active)

  useEffect(() => {
    if (!open) return
    setSiteId(sites[0]?.id ?? ''); setFromId(fromLocationId ?? sources.find(s => s.kind === 'office')?.id ?? '')
    setDate(defaultDate ?? today()); setBilling('Invoice to follow'); setQty({}); setExtra({}); setContents({}); setSerials({}); setAddId('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const available = useMemo(() => products
    .filter(p => p.active && p.is_stock && onHand(stock, p.id, fromId) > 0)
    .map(p => ({ ...p, have: onHand(stock, p.id, fromId) })), [products, stock, fromId])
  const nonStock = products.filter(p => p.active && !p.is_stock && p.kind !== 'software')

  const lines = [
    ...available.filter(p => Number(qty[p.id]) > 0).map(p => ({ product: p, qty: Number(qty[p.id]) })),
    ...Object.entries(extra).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ product: products.find(p => p.id === id), qty: Number(q) }))
  ]
  const problems = validateMoves(stock, lines.filter(l => l.product.is_stock).map(l => ({
    product_id: l.product.id, qty: l.qty, from_location_id: fromId, to_location_id: siteId
  })), { products, locations })
  for (const l of lines) {
    const s = (serials[l.product.id] ?? '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean)
    if (s.length > l.qty) problems.push(`${l.product.name}: more serial numbers than items`)
  }

  async function submit() {
    if (!siteId || !fromId || !lines.length || problems.length) return
    setBusy(true)
    try {
      const payload = []
      for (const l of lines) {
        const p = l.product
        const sn = (serials[p.id] ?? '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean)
        const serialRows = sn.length ? await addSerials(p.id, fromId, sn) : []
        const parts = contents[p.id]
        payload.push({
          product_id: p.id, qty: l.qty,
          ...(serialRows.length ? { serial_ids: serialRows.map(s => s.id) } : {}),
          ...(parts !== undefined ? { components: parts.split('\n').map(s => s.trim()).filter(Boolean).map(name => ({ name })) } : {})
        })
      }
      const docId = await deliver({ siteId, fromLocationId: fromId, date, lines: payload, deploymentId, meta: billing.trim() ? { billing: billing.trim() } : {} })
      const doc = await getDocument(docId)
      await reload()
      try {
        const { bytes } = await regenerateDocument(doc, { clients, locations })
        saveBytes(bytes, `${doc.doc_no}.pdf`)
        toast.success(`${doc.doc_no} issued — PDF downloaded`)
      } catch (err) {
        toast.error(`${doc.doc_no} issued, but the PDF failed: ${err.message}`)
      }
      onDelivered?.(doc)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Delivery failed')
    } finally { setBusy(false) }
  }

  const kitRow = p => (p.dn_components ?? []).length > 0 && (
    <textarea
      className="mt-1.5 w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-xs text-zinc-300"
      rows={(p.dn_components ?? []).length}
      value={contents[p.id] ?? p.dn_components.map(c => c.name).join('\n')}
      onChange={e => setContents(s => ({ ...s, [p.id]: e.target.value }))}
      title="Set contents printed on the delivery note (one per line)"
    />
  )

  return (
    <Modal open={open} onClose={onClose} width="xl" title="Deliver to site" description="Creates a delivery note for the branch manager to sign."
      footer={<>
        <span className="mr-auto text-xs text-zinc-500">{lines.reduce((s, l) => s + l.qty, 0)} items</span>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={!siteId || !lines.length || problems.length > 0}>Issue delivery note</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select label="Deliver to" value={siteId} onChange={e => setSiteId(e.target.value)} options={sites.map(s => ({ value: s.id, label: s.name }))} />
          <Select label="From" value={fromId} disabled={!!fromLocationId} onChange={e => { setFromId(e.target.value); setQty({}) }} options={sources.map(s => ({ value: s.id, label: s.name }))} />
          <Input label="Delivery date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Input label="Billing line" value={billing} onChange={e => setBilling(e.target.value)} hint="Leave blank to omit" />
        </div>

        <div className="rounded-xl border border-white/10 divide-y divide-white/5">
          <div className="px-3 py-2 text-[11px] uppercase tracking-widest text-zinc-500 flex"><span className="flex-1">Item</span><span className="w-20 text-right">Available</span><span className="w-24 text-right">Deliver</span></div>
          {available.length === 0 && <div className="px-3 py-4 text-sm text-zinc-500">Nothing in stock at this location.</div>}
          {available.map(p => (
            <div key={p.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-100 truncate">{p.dn_name || p.name}</div>
                  {p.dn_detail && <div className="text-xs text-zinc-500">{p.dn_detail}</div>}
                </div>
                <span className="w-20 text-right tabular-nums text-zinc-400">{p.have}</span>
                <input type="number" min="0" max={p.have} value={qty[p.id] ?? ''} placeholder="0"
                  onChange={e => setQty(s => ({ ...s, [p.id]: e.target.value }))}
                  className="w-24 text-right rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-sm text-zinc-100" />
              </div>
              {Number(qty[p.id]) > 0 && kitRow(p)}
              {Number(qty[p.id]) > 0 && p.track_serials && (
                <input className="mt-1.5 w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-xs text-zinc-300"
                  placeholder="Serial numbers (optional, comma-separated)" value={serials[p.id] ?? ''}
                  onChange={e => setSerials(s => ({ ...s, [p.id]: e.target.value }))} />
              )}
            </div>
          ))}
          {Object.keys(extra).map(id => {
            const p = products.find(x => x.id === id)
            return (
              <div key={id} className="px-3 py-2 flex items-center gap-2">
                <div className="flex-1 text-sm text-zinc-100">{p.dn_name || p.name} <span className="text-xs text-zinc-500">(not stocked)</span></div>
                <input type="number" min="1" value={extra[id]} onChange={e => setExtra(s => ({ ...s, [id]: e.target.value }))}
                  className="w-24 text-right rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-sm text-zinc-100" />
                <button className="p-1 text-zinc-500 hover:text-zinc-200" onClick={() => setExtra(s => { const n = { ...s }; delete n[id]; return n })}><X className="w-4 h-4" /></button>
              </div>
            )
          })}
        </div>

        {nonStock.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select label="Add a non-stock item (e.g. staff ID cards)" value={addId} onChange={e => setAddId(e.target.value)}
                options={[{ value: '', label: 'Choose…' }, ...nonStock.filter(p => !(p.id in extra)).map(p => ({ value: p.id, label: p.name }))]} />
            </div>
            <Button variant="subtle" leftIcon={<Plus className="w-4 h-4" />} disabled={!addId} onClick={() => { setExtra(s => ({ ...s, [addId]: '1' })); setAddId('') }}>Add</Button>
          </div>
        )}
        {problems.map(p => <p key={p} className="text-sm text-rose-300">{p}</p>)}
      </div>
    </Modal>
  )
}
