import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, X, Eye, Send, Layers } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listDocuments, getDocuments, createInvoice, getDocument } from '../api'
import { amountInWords, formatAmount, formatRs } from '../lib/money'
import { invoiceTotals, lineAmount } from '../lib/stock'
import { buildInvoiceVM } from '../lib/viewModel'
import { renderVM, regenerateDocument, saveBytes } from '../docs'
import { useInventory } from './InventoryLayout'
import { Check } from '../components/ProductFormModal'

let seq = 0
const nid = () => `l${++seq}`
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function lineFromProduct(p, qty = 1) {
  return { id: nid(), product_id: p.id, description: p.name, detail: p.invoice_detail ?? '', qty, unit_price: p.is_free ? 0 : p.price, is_free: !!p.is_free, kind: p.kind }
}

export default function InvoiceBuilderPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { clients, locations, products, can } = useInventory()
  const [clientId, setClientId] = useState('')
  const [docs, setDocs] = useState([])
  const [pickedDns, setPickedDns] = useState([])
  const [groups, setGroups] = useState([])
  const [replaces, setReplaces] = useState([])
  const today = new Date().toISOString().slice(0, 10)
  const [head, setHead] = useState({ title: '', intro: '', date: today, due: addDays(today, 7), terms: '' })
  const [addProduct, setAddProduct] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { document.title = 'New invoice · WEDDZ PM' }, [])
  useEffect(() => { if (!clientId && clients[0]) setClientId(clients[0].id) }, [clients]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clientId) return
    setGroups([]); setPickedDns([]); setReplaces([])
    listDocuments({ clientId }).then(setDocs).catch(err => toast.error(err.message))
    const c = clients.find(x => x.id === clientId)
    setHead(h => ({ ...h, title: c?.company ? `Software & Hardware — ${c.company} Outlets` : 'Software & Hardware' }))
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const client = clients.find(c => c.id === clientId)
  const dns = docs.filter(d => d.type === 'DELIVERY_NOTE' && d.status === 'issued')
  const openInvoices = docs.filter(d => d.type === 'INVOICE' && d.status === 'open')
  const invoicedOn = id => docs.find(d => d.type === 'INVOICE' && d.status !== 'replaced' && d.status !== 'cancelled' && d.source_dn_ids.includes(id))
  const swProduct = products.find(p => p.kind === 'software' && p.active)
  const site = id => locations.find(l => l.id === id)

  if (!can.finance) return <p className="text-zinc-400">Only staff can issue invoices.</p>

  async function addDeliveryNotes() {
    const full = await getDocuments(pickedDns.filter(id => !groups.some(g => g.dn_id === id)))
    const add = full.sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.seq - b.seq).map(dn => {
      const s = site(dn.site_ids[0])
      return {
        key: dn.id, dn_id: dn.id, dn_no: dn.doc_no, site_id: s?.id, label: s?.name ?? dn.doc_no, kind: s?.is_outlet === false ? 'other' : 'outlet',
        lines: dn.lines.map(l => {
          const p = products.find(x => x.id === l.product_id)
          return p ? lineFromProduct(p, l.qty) : { id: nid(), product_id: null, description: l.name, detail: '', qty: l.qty, unit_price: null, is_free: false, kind: 'hardware' }
        })
      }
    })
    setGroups(g => [...g, ...add])
    setPickedDns([])
  }

  const updGroup = (key, fn) => setGroups(gs => gs.map(g => g.key === key ? fn(g) : g))
  const updLine = (key, id, patch) => updGroup(key, g => ({ ...g, lines: g.lines.map(l => l.id === id ? { ...l, ...patch } : l) }))

  function addSoftwareEverywhere() {
    if (!swProduct) { toast.error('Add a software product first'); return }
    setGroups(gs => gs.map(g => g.kind !== 'outlet' || g.lines.some(l => l.product_id === swProduct.id) ? g : { ...g, lines: [lineFromProduct(swProduct), ...g.lines] }))
  }

  const flatLines = groups.flatMap(g => g.lines.map(l => ({
    group: g.key, group_label: g.label, group_kind: g.kind, ...(g.dn_no ? { dn_no: g.dn_no } : {}),
    product_id: l.product_id, description: l.description.trim(), ...(l.detail?.trim() ? { detail: l.detail.trim() } : {}),
    qty: Number(l.qty), unit_price: l.is_free ? 0 : (l.unit_price === null || l.unit_price === '' ? null : Number(l.unit_price)),
    is_free: l.is_free, kind: l.kind
  })))
  const totals = invoiceTotals(flatLines)
  const unpriced = flatLines.filter(l => !l.is_free && l.unit_price == null)
  const replacedNos = openInvoices.filter(d => replaces.includes(d.id)).sort((a, b) => a.seq - b.seq).map(d => d.doc_no)

  function draftDoc(docNo) {
    return {
      doc_no: docNo, doc_date: head.date, due_date: head.due || null, title: head.title.trim(), intro: head.intro.trim() || null,
      lines: flatLines.map(l => ({ ...l, amount: lineAmount(l) })),
      meta: head.terms.trim() ? { terms_extra: head.terms.split('\n').map(s => s.trim()).filter(Boolean) } : {}
    }
  }

  async function preview() {
    try {
      const bytes = await renderVM(buildInvoiceVM({ doc: draftDoc('DRAFT — not issued'), client, replacedNos }))
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank', 'noopener')
    } catch (err) { toast.error(err.message) }
  }

  async function issue() {
    if (!flatLines.length || unpriced.length || !head.title.trim()) return
    setBusy(true)
    try {
      const d = draftDoc(null)
      const id = await createInvoice({
        clientId, docDate: d.doc_date, dueDate: d.due_date, title: d.title, intro: d.intro,
        siteIds: [...new Set(groups.map(g => g.site_id).filter(Boolean))], lines: flatLines, meta: d.meta,
        replacesIds: replaces, sourceDnIds: groups.map(g => g.dn_id).filter(Boolean)
      })
      const doc = await getDocument(id)
      try {
        const { bytes } = await regenerateDocument(doc, { clients, locations })
        saveBytes(bytes, `${doc.doc_no}.pdf`)
      } catch (err) { toast.error(`PDF failed: ${err.message}`) }
      toast.success(`${doc.doc_no} issued`)
      navigate('/inventory/documents')
    } catch (err) { toast.error(err.message || 'Could not issue the invoice') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <Link to="/inventory/documents" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"><ArrowLeft className="w-4 h-4" /> Documents</Link>
      <PageHeader title="New invoice" description="Start from delivery notes — items are grouped by outlet at default prices; every line stays editable."
        actions={<>
          <Button variant="subtle" leftIcon={<Eye className="w-4 h-4" />} disabled={!flatLines.length} onClick={preview}>Preview PDF</Button>
          <Button leftIcon={<Send className="w-4 h-4" />} loading={busy} disabled={!flatLines.length || unpriced.length > 0 || !head.title.trim()} onClick={issue}>Issue invoice</Button>
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select label="Client" value={clientId} onChange={e => setClientId(e.target.value)} options={clients.map(c => ({ value: c.id, label: c.company || c.contact_name }))} />
            <Input label="Invoice date" type="date" value={head.date} onChange={e => setHead(h => ({ ...h, date: e.target.value }))} />
            <Input label="Due date" type="date" value={head.due} onChange={e => setHead(h => ({ ...h, due: e.target.value }))} />
          </div>
          <Input label="Heading" value={head.title} onChange={e => setHead(h => ({ ...h, title: e.target.value }))} />
          <Input label="Intro line (optional)" value={head.intro} onChange={e => setHead(h => ({ ...h, intro: e.target.value }))} placeholder="e.g. Outlet software and the hardware delivered to four outlets, as signed for on each outlet's delivery note." />
          <Textarea label="Extra terms — one per line (optional)" rows={2} value={head.terms} onChange={e => setHead(h => ({ ...h, terms: e.target.value }))} />
        </Card>

        <Card className="space-y-3">
          <div className="text-sm font-semibold text-zinc-100">Delivery notes</div>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {dns.map(d => {
              const on = invoicedOn(d.id)
              const added = groups.some(g => g.dn_id === d.id)
              return (
                <div key={d.id} className="flex items-start gap-2">
                  <Check checked={pickedDns.includes(d.id) || added} onChange={v => !added && setPickedDns(s => v ? [...s, d.id] : s.filter(x => x !== d.id))}
                    label={<span className="text-sm">{d.doc_no} <span className="text-zinc-500">· {site(d.site_ids[0])?.name} · {formatDate(d.doc_date)}</span></span>}
                    hint={on ? `On ${on.doc_no}` : added ? 'Added' : undefined} />
                </div>
              )
            })}
            {!dns.length && <p className="text-sm text-zinc-500">No delivery notes for this client.</p>}
          </div>
          <Button size="sm" variant="subtle" leftIcon={<Layers className="w-4 h-4" />} disabled={!pickedDns.length} onClick={addDeliveryNotes}>Add to invoice</Button>
          {openInvoices.length > 0 && (
            <div className="pt-3 border-t border-white/10 space-y-1.5">
              <div className="text-sm font-semibold text-zinc-100">Replaces open invoices</div>
              {openInvoices.map(d => (
                <Check key={d.id} checked={replaces.includes(d.id)} onChange={v => setReplaces(s => v ? [...s, d.id] : s.filter(x => x !== d.id))}
                  label={<span className="text-sm">{d.doc_no} <span className="text-zinc-500">· {formatRs(d.total)}</span></span>} />
              ))}
              <p className="text-xs text-zinc-500">Replaced invoices are marked “Replaced”; payments on them carry over.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="subtle" leftIcon={<Plus className="w-4 h-4" />} onClick={addSoftwareEverywhere} disabled={!groups.some(g => g.kind === 'outlet')}>Add outlet software to each outlet</Button>
        <Button size="sm" variant="subtle" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setGroups(g => [...g, { key: nid(), label: 'Other items', kind: 'other', lines: [] }])}>Add section</Button>
      </div>

      {groups.map((g, gi) => {
        const t = invoiceTotals(g.lines.map(l => ({ ...l, unit_price: l.unit_price ?? 0 })))
        return (
          <Card key={g.key} padded={false}>
            <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-indigo-300">{String.fromCharCode(65 + gi)}.</span>
              <input value={g.label} onChange={e => updGroup(g.key, x => ({ ...x, label: e.target.value }))}
                className="flex-1 min-w-[12rem] bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none" />
              {g.dn_no && <Badge size="sm" tone="sky">{g.dn_no}</Badge>}
              <select value={g.kind} onChange={e => updGroup(g.key, x => ({ ...x, kind: e.target.value }))} className="bg-zinc-900 border border-white/10 rounded-md text-xs text-zinc-300 px-1.5 py-1">
                <option value="outlet">Outlet</option><option value="other">Other</option>
              </select>
              <button className="p-1 text-zinc-500 hover:text-rose-300" onClick={() => setGroups(gs => gs.filter(x => x.key !== g.key))}><X className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-white/5">
              {g.lines.map(l => (
                <div key={l.id} className="px-4 py-2 grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <input value={l.description} onChange={e => updLine(g.key, l.id, { description: e.target.value })} className="w-full bg-transparent text-sm text-zinc-100 focus:outline-none" />
                    <input value={l.detail} onChange={e => updLine(g.key, l.id, { detail: e.target.value })} placeholder="Sub-line (optional)" className="w-full bg-transparent text-xs text-zinc-400 focus:outline-none" />
                  </div>
                  <input type="number" min="0" value={l.qty} onChange={e => updLine(g.key, l.id, { qty: e.target.value })} className="col-span-3 sm:col-span-1 text-right rounded-md bg-white/[0.04] border border-white/10 px-2 py-1 text-sm" />
                  <input type="number" min="0" step="0.01" disabled={l.is_free} value={l.is_free ? '' : (l.unit_price ?? '')} placeholder={l.is_free ? 'Free' : 'Price'}
                    onChange={e => updLine(g.key, l.id, { unit_price: e.target.value })}
                    className={`col-span-4 sm:col-span-2 text-right rounded-md bg-white/[0.04] border px-2 py-1 text-sm ${!l.is_free && (l.unit_price === null || l.unit_price === '') ? 'border-amber-500/60' : 'border-white/10'}`} />
                  <label className="col-span-3 sm:col-span-1 flex items-center gap-1 text-xs text-zinc-400 pt-1.5"><input type="checkbox" className="accent-indigo-500" checked={l.is_free} onChange={e => updLine(g.key, l.id, { is_free: e.target.checked })} /> Free</label>
                  <div className="col-span-1 sm:col-span-2 text-right text-sm tabular-nums pt-1 text-zinc-200">{l.is_free ? 'Free' : formatAmount(lineAmount({ ...l, unit_price: l.unit_price ?? 0 }))}</div>
                  <button className="col-span-1 justify-self-end p-1 text-zinc-500 hover:text-rose-300" title="Remove line" onClick={() => updGroup(g.key, x => ({ ...x, lines: x.lines.filter(y => y.id !== l.id) }))}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-t border-white/10">
              <select value={addProduct[g.key] ?? ''} onChange={e => setAddProduct(s => ({ ...s, [g.key]: e.target.value }))} className="bg-zinc-900 border border-white/10 rounded-md text-xs text-zinc-300 px-2 py-1.5 max-w-xs">
                <option value="">Add a product…</option>
                {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button size="sm" variant="ghost" disabled={!addProduct[g.key]} onClick={() => { const p = products.find(x => x.id === addProduct[g.key]); updGroup(g.key, x => ({ ...x, lines: [...x.lines, lineFromProduct(p)] })); setAddProduct(s => ({ ...s, [g.key]: '' })) }}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => updGroup(g.key, x => ({ ...x, lines: [...x.lines, { id: nid(), product_id: null, description: 'Service', detail: '', qty: 1, unit_price: null, is_free: false, kind: 'software' }] }))}>Custom line</Button>
              <span className="ml-auto text-sm text-zinc-300">{g.kind === 'outlet' ? 'Outlet total' : 'Total'} <span className="font-semibold tabular-nums text-zinc-100">{formatRs(t.total)}</span></span>
            </div>
          </Card>
        )
      })}

      {groups.length > 0 && (
        <Card className="border-l-4 border-l-rose-500">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">Total amount due</div>
              <div className="text-2xl font-semibold tabular-nums text-zinc-100">{formatRs(totals.total)}</div>
              <div className="text-xs text-zinc-400 mt-1">{amountInWords(totals.total)}</div>
            </div>
            <div className="text-sm text-zinc-400 text-right">
              <div>Software {formatRs(totals.software)}</div>
              <div>Hardware {formatRs(totals.hardware)}</div>
              {replacedNos.length > 0 && <div className="text-xs mt-1">Replaces {replacedNos.join(', ')}</div>}
            </div>
          </div>
          {unpriced.length > 0 && <p className="text-sm text-amber-300 mt-3">Set a price (or mark free) for: {[...new Set(unpriced.map(l => l.description))].join(', ')}</p>}
        </Card>
      )}
    </div>
  )
}
