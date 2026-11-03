import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackagePlus, Search, AlertTriangle, Truck, SlidersHorizontal, Boxes } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { formatAmount } from '../lib/money'
import { onHand } from '../lib/stock'
import { useInventory } from './InventoryLayout'
import MovementFormModal from '../components/MovementFormModal'

export default function StockPage() {
  const navigate = useNavigate()
  const { products, locations, stock, loading, can } = useInventory()
  const [search, setSearch] = useState('')
  const [movementType, setMovementType] = useState('PURCHASE')
  const moveDisc = useDisclosure()

  useEffect(() => { document.title = 'Inventory · WEDDZ PM' }, [])

  const office = locations.filter(l => l.kind === 'office' && l.active)
  const vehicles = locations.filter(l => l.kind === 'vehicle' && l.active)
  const sites = locations.filter(l => l.kind === 'site')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products
      .filter(p => p.is_stock && p.active)
      .filter(p => !q || [p.name, p.sku, p.category, p.brand_model].some(v => v?.toLowerCase().includes(q)))
      .map(p => {
        const officeQty = office.reduce((s, l) => s + onHand(stock, p.id, l.id), 0)
        return {
          ...p,
          officeQty,
          vehicleQty: vehicles.map(v => onHand(stock, p.id, v.id)),
          siteQty: sites.reduce((s, l) => s + onHand(stock, p.id, l.id), 0),
          low: p.low_stock_threshold > 0 && officeQty < p.low_stock_threshold
        }
      })
  }, [products, office, vehicles, sites, stock, search])

  const low = rows.filter(r => r.low)
  const unpriced = products.filter(p => p.active && p.price == null)

  function openMove(type) { setMovementType(type); moveDisc.onOpen() }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Hardware on hand at the office and in vehicles, and what's been delivered to client sites."
        actions={<>
          {can.admin && <Button variant="subtle" leftIcon={<SlidersHorizontal className="w-4 h-4" />} onClick={() => openMove('ADJUSTMENT')}>Adjust</Button>}
          <Button variant="subtle" leftIcon={<Truck className="w-4 h-4" />} onClick={() => navigate('/inventory/deployments')}>Deployments</Button>
          {can.manage && <Button leftIcon={<PackagePlus className="w-4 h-4" />} onClick={() => openMove('PURCHASE')}>Receive stock</Button>}
        </>}
      />

      {(low.length > 0 || unpriced.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {low.length > 0 && (
            <Card className="border-amber-500/30">
              <div className="flex items-center gap-2 mb-2 text-amber-300 text-sm font-semibold">
                <AlertTriangle className="w-4 h-4" /> Low stock in the office
              </div>
              <ul className="text-sm text-zinc-300 space-y-1">
                {low.map(r => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums text-amber-200 shrink-0">{r.officeQty} / min {r.low_stock_threshold}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {unpriced.length > 0 && (
            <Card>
              <div className="text-sm font-semibold text-zinc-200 mb-2">Not priced yet</div>
              <p className="text-sm text-zinc-400">{unpriced.map(p => p.name).join(', ')}. Set a price on the Products tab before invoicing these.</p>
            </Card>
          )}
        </div>
      )}

      <div className="max-w-md">
        <Input leftIcon={<Search className="w-4 h-4" />} placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Boxes} title="No stock items" description="Add products on the Products tab." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH align="right">Price (Rs.)</TH>
              {office.map(l => <TH key={l.id} align="right">{l.name}</TH>)}
              {vehicles.map(v => <TH key={v.id} align="right">{v.name}</TH>)}
              <TH align="right">At client sites</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map(r => (
              <TR key={r.id} hover onClick={() => navigate(`/inventory/movements?product=${r.id}`)}>
                <TD>
                  <div className="text-zinc-100">{r.name}</div>
                  <div className="text-xs text-zinc-500">{[r.sku, r.category].filter(Boolean).join(' · ')}</div>
                </TD>
                <TD align="right" className="tabular-nums">
                  {r.is_free ? <span className="text-zinc-400">Free</span> : r.price == null ? <Badge tone="amber" size="sm">Not priced</Badge> : formatAmount(r.price)}
                </TD>
                {office.map(l => (
                  <TD key={l.id} align="right" className="tabular-nums">
                    <span className={r.low ? 'text-amber-300 font-semibold' : 'text-zinc-100 font-medium'}>{onHand(stock, r.id, l.id)}</span>
                  </TD>
                ))}
                {r.vehicleQty.map((q, i) => <TD key={vehicles[i].id} align="right" className="tabular-nums text-zinc-300">{q || <span className="text-zinc-600">0</span>}</TD>)}
                <TD align="right" className="tabular-nums text-zinc-400">{r.siteQty}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <MovementFormModal open={moveDisc.open} onClose={moveDisc.onClose} initialType={movementType} />
    </div>
  )
}
