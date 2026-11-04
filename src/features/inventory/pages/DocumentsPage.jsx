import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, MoreHorizontal, FileDown, RefreshCw, History, Banknote, CheckCircle2, XCircle, Truck, Upload } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import DropdownMenu from '@/components/ui/DropdownMenu'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listDocuments, listPayments, listDocumentVersions, setChequeStatus } from '../api'
import { formatAmount } from '../lib/money'
import { invoiceBalance } from '../lib/stock'
import { downloadDocument, regenerateDocument, downloadVersion, attachOriginal } from '../docs'
import { useInventory } from './InventoryLayout'
import DeliverModal from '../components/DeliverModal'
import RecordPaymentModal from '../components/RecordPaymentModal'

const TYPE = { DELIVERY_NOTE: ['Delivery note', 'sky'], INVOICE: ['Invoice', 'indigo'], RECEIPT: ['Receipt', 'emerald'], QUOTATION: ['Quotation', 'zinc'] }
const STATUS = { issued: 'default', open: 'amber', paid: 'emerald', replaced: 'zinc', cancelled: 'rose' }

export default function DocumentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { clients, locations, can, reload } = useInventory()
  const [docs, setDocs] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [paying, setPaying] = useState(null)
  const [versionsOf, setVersionsOf] = useState(null)
  const deliverDisc = useDisclosure()

  useEffect(() => { document.title = 'Documents · WEDDZ PM'; load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const [d, p] = await Promise.all([listDocuments(), can.finance ? listPayments() : Promise.resolve([])])
      setDocs(d); setPayments(p)
    } catch (err) { toast.error(err.message || 'Failed to load documents') } finally { setLoading(false) }
  }

  const invoices = docs.filter(d => d.type === 'INVOICE')
  const ctx = { clients, locations }
  const siteName = id => locations.find(l => l.id === id)?.name

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter(d =>
      (!clientId || d.client_id === clientId) && (!type || d.type === type) && (!status || d.status === status) &&
      (!siteId || d.site_ids.includes(siteId)) &&
      (!q || d.doc_no.toLowerCase().includes(q) || d.title?.toLowerCase().includes(q) || d.site_ids.some(id => siteName(id)?.toLowerCase().includes(q))))
  }, [docs, search, clientId, siteId, type, status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn, ok) {
    try { await fn(); if (ok) toast.success(ok) } catch (err) { toast.error(err.message || 'Something went wrong') }
  }

  function actions(d) {
    const pay = payments.find(p => p.receipt_id === d.id)
    const items = [
      { label: 'Download PDF', icon: FileDown, onClick: () => run(async () => { await downloadDocument(d, ctx); await load() }) },
      { label: 'Regenerate PDF', icon: RefreshCw, onClick: () => run(async () => {
        const { changed } = await regenerateDocument(d, ctx)
        toast.info(changed ? 'New PDF version saved' : 'No changes — the stored PDF is identical')
        await load()
      }) },
      { label: 'Versions…', icon: History, onClick: () => setVersionsOf(d) }
    ]
    if (can.finance && d.type === 'INVOICE' && d.status === 'open') {
      items.push({ separator: true }, { label: 'Record payment', icon: Banknote, onClick: () => setPaying(d) })
    }
    if (can.finance && pay?.method === 'cheque' && pay.cheque_status === 'pending') {
      items.push({ separator: true },
        { label: 'Cheque cleared', icon: CheckCircle2, onClick: () => run(async () => { await setChequeStatus(pay.id, 'cleared'); await load() }, 'Cheque marked cleared') },
        { label: 'Cheque bounced', icon: XCircle, danger: true, onClick: () => run(async () => { await setChequeStatus(pay.id, 'bounced'); await load() }, 'Cheque marked bounced — the invoice is open again') })
    }
    return items
  }

  const sites = locations.filter(l => l.kind === 'site' && (!clientId || l.client_id === clientId))

  return (
    <div className="space-y-6">
      <PageHeader
        title={can.finance ? 'Documents' : 'Delivery notes'}
        description={can.finance ? 'Delivery notes, invoices and receipts with every stored PDF version.' : 'Delivery notes for the branch managers to sign.'}
        actions={<>
          <Button variant="subtle" leftIcon={<Truck className="w-4 h-4" />} onClick={deliverDisc.onOpen}>New delivery note</Button>
          {can.finance && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => navigate('/inventory/invoices/new')}>New invoice</Button>}
        </>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Number, title, outlet…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={clientId} onChange={e => { setClientId(e.target.value); setSiteId('') }} options={[{ value: '', label: 'All clients' }, ...clients.map(c => ({ value: c.id, label: c.company || c.contact_name }))]} />
        <Select value={siteId} onChange={e => setSiteId(e.target.value)} options={[{ value: '', label: 'All outlets' }, ...sites.map(s => ({ value: s.id, label: s.name }))]} />
        {can.finance && <Select value={type} onChange={e => setType(e.target.value)} options={[{ value: '', label: 'All types' }, ...Object.entries(TYPE).map(([k, [l]]) => ({ value: k, label: l }))]} />}
        <Select value={status} onChange={e => setStatus(e.target.value)} options={[{ value: '', label: 'Any status' }, ...Object.keys(STATUS).map(s => ({ value: s, label: s }))]} />
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Nothing matches these filters." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Number</TH><TH>Type</TH><TH>Date</TH><TH>Outlets / title</TH>
              {can.finance && <TH align="right">Amount (Rs.)</TH>}
              <TH>Status</TH><TH align="right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map(d => {
              const bal = d.type === 'INVOICE' && d.status === 'open' ? invoiceBalance(d, invoices, payments) : null
              const pay = payments.find(p => p.receipt_id === d.id)
              return (
                <TR key={d.id}>
                  <TD className="font-medium text-zinc-100 whitespace-nowrap">{d.doc_no}</TD>
                  <TD><Badge tone={TYPE[d.type][1]} size="sm" className="whitespace-nowrap">{TYPE[d.type][0]}</Badge></TD>
                  <TD className="text-zinc-400 whitespace-nowrap">{formatDate(d.doc_date)}</TD>
                  <TD className="text-sm max-w-sm">
                    <div className="text-zinc-300 truncate">{d.site_ids.map(siteName).filter(Boolean).join(', ') || d.title}</div>
                    {d.site_ids.length > 0 && d.title && <div className="text-xs text-zinc-500 truncate">{d.title}</div>}
                  </TD>
                  {can.finance && (
                    <TD align="right" className="tabular-nums">
                      {d.type === 'DELIVERY_NOTE' ? <span className="text-zinc-600">—</span> : formatAmount(d.total)}
                      {bal != null && bal < Number(d.total) && <div className="text-xs text-amber-300">due {formatAmount(bal)}</div>}
                    </TD>
                  )}
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={STATUS[d.status]} size="sm">{d.status}</Badge>
                      {pay?.cheque_status === 'pending' && <Badge tone="amber" size="sm">cheque pending</Badge>}
                      {pay?.cheque_status === 'bounced' && <Badge tone="rose" size="sm">bounced</Badge>}
                    </div>
                  </TD>
                  <TD align="right">
                    <DropdownMenu
                      trigger={<button className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-200"><MoreHorizontal className="w-4 h-4" /></button>}
                      items={actions(d)}
                    />
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      )}

      <DeliverModal open={deliverDisc.open} onClose={deliverDisc.onClose} onDelivered={() => { load(); reload() }} />
      <RecordPaymentModal open={!!paying} onClose={() => setPaying(null)} invoice={paying} invoices={invoices} payments={payments} onSaved={load} />
      <VersionsModal doc={versionsOf} onClose={() => setVersionsOf(null)} onChanged={load} />
    </div>
  )
}

function VersionsModal({ doc, onClose, onChanged }) {
  const toast = useToast()
  const fileRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [uploading, setUploading] = useState(false)
  const loadRows = () => listDocumentVersions(doc.id).then(setRows).catch(err => toast.error(err.message))
  useEffect(() => {
    setRows(null)
    if (doc) loadRows()
  }, [doc]) // eslint-disable-line react-hooks/exhaustive-deps

  async function attach(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await attachOriginal(doc, file)
      toast.success('PDF attached as the latest version')
      await loadRows(); onChanged?.()
    } catch (err) { toast.error(err.message || 'Upload failed') } finally { setUploading(false) }
  }

  return (
    <Modal open={!!doc} onClose={onClose} title={`PDF versions — ${doc?.doc_no ?? ''}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-zinc-500">Attach the issued original or a signed copy. Download PDF always gives the latest version.</p>
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={attach} />
        <Button size="sm" variant="subtle" className="shrink-0 whitespace-nowrap" leftIcon={<Upload className="w-4 h-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>Attach PDF</Button>
      </div>
      {!rows ? <div className="flex justify-center py-6"><Spinner /></div> : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No PDF stored yet. Download or regenerate to create one.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {rows.map(v => (
            <li key={v.id} className="py-2 flex items-center gap-3 text-sm">
              <span className="font-medium text-zinc-100">v{v.version}</span>
              <Badge size="sm" tone={v.source === 'original' ? 'violet' : 'default'}>{v.source}</Badge>
              <span className="text-zinc-500 flex-1">{formatDate(v.created_at)}</span>
              <button className="text-indigo-300 hover:text-indigo-200" onClick={() => downloadVersion(v, doc.doc_no).catch(err => toast.error(err.message))}>Download</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
