import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, ArrowRightLeft } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listMovements } from '../api'
import { MOVEMENT_TYPES } from '../lib/stock'
import { useInventory } from './InventoryLayout'
import MovementFormModal from '../components/MovementFormModal'

const TONE = { OPENING: 'zinc', PURCHASE: 'emerald', TRANSFER_TO_VEHICLE: 'sky', RETURN_TO_OFFICE: 'violet', DELIVERED_TO_SITE: 'indigo', ADJUSTMENT: 'amber', DAMAGED: 'rose' }

export default function MovementsPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { products, locations } = useInventory()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const disc = useDisclosure()
  const productId = params.get('product') ?? ''
  const locationId = params.get('location') ?? ''
  const type = params.get('type') ?? ''

  useEffect(() => { document.title = 'Stock movements · WEDDZ PM' }, [])
  useEffect(() => { load() }, [productId, locationId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try { setRows(await listMovements({ productId: productId || undefined, locationId: locationId || undefined, type: type || undefined })) }
    catch (err) { toast.error(err.message || 'Failed to load movements') }
    finally { setLoading(false) }
  }

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock movements"
        description="The append-only ledger. Every change in stock is a row here; mistakes are corrected with an adjustment, never by editing."
        actions={<Button leftIcon={<Plus className="w-4 h-4" />} onClick={disc.onOpen}>Record movement</Button>}
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select value={productId} onChange={e => setFilter('product', e.target.value)}
          options={[{ value: '', label: 'All products' }, ...products.filter(p => p.is_stock).map(p => ({ value: p.id, label: p.name }))]} />
        <Select value={locationId} onChange={e => setFilter('location', e.target.value)}
          options={[{ value: '', label: 'All locations' }, ...locations.map(l => ({ value: l.id, label: l.name }))]} />
        <Select value={type} onChange={e => setFilter('type', e.target.value)}
          options={[{ value: '', label: 'All types' }, ...Object.entries(MOVEMENT_TYPES).map(([k, t]) => ({ value: k, label: t.label }))]} />
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="No movements" description="Nothing matches these filters yet." />
      ) : (
        <Table>
          <THead>
            <TR><TH>Date</TH><TH>Type</TH><TH>Product</TH><TH align="right">Qty</TH><TH>From</TH><TH>To</TH><TH>Reference / note</TH></TR>
          </THead>
          <tbody>
            {rows.map(m => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap text-zinc-400">{formatDate(m.moved_on)}</TD>
                <TD><Badge tone={TONE[m.type]} size="sm">{MOVEMENT_TYPES[m.type]?.label ?? m.type}</Badge></TD>
                <TD className="text-zinc-100">{m.product?.name}</TD>
                <TD align="right" className="tabular-nums font-medium">{m.qty}</TD>
                <TD className="text-zinc-400">{m.from?.name ?? '—'}</TD>
                <TD className="text-zinc-400">{m.to?.name ?? '—'}</TD>
                <TD className="text-xs text-zinc-400 max-w-xs">
                  <div className="text-zinc-300">{m.document?.doc_no ?? m.reference}</div>
                  {(m.reason || m.note) && <div className="truncate" title={m.reason || m.note}>{m.reason || m.note}</div>}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <MovementFormModal open={disc.open} onClose={disc.onClose} initialProductId={productId} onSaved={load} />
    </div>
  )
}
