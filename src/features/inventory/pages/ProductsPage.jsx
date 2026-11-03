import { useEffect, useState } from 'react'
import { Plus, Package } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useDisclosure } from '@/hooks/useDisclosure'
import { formatAmount } from '../lib/money'
import { useInventory } from './InventoryLayout'
import ProductFormModal from '../components/ProductFormModal'

export default function ProductsPage() {
  const { products, can, reload } = useInventory()
  const disc = useDisclosure()
  const [editing, setEditing] = useState(null)

  useEffect(() => { document.title = 'Products · WEDDZ PM' }, [])

  function open(p) { setEditing(p); disc.onOpen() }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Hardware, consumables and service lines with their default selling prices."
        actions={can.manage && <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => open(null)}>New product</Button>}
      />
      {products.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" />
      ) : (
        <Table>
          <THead>
            <TR><TH>Product</TH><TH>Category</TH><TH align="right">Price (Rs.)</TH><TH>Cover</TH><TH>Flags</TH><TH align="right">Low-stock</TH></TR>
          </THead>
          <tbody>
            {products.map(p => (
              <TR key={p.id} hover={can.manage} onClick={can.manage ? () => open(p) : undefined}>
                <TD>
                  <div className={p.active ? 'text-zinc-100' : 'text-zinc-500 line-through'}>{p.name}</div>
                  <div className="text-xs text-zinc-500">{[p.sku, p.brand_model].filter(Boolean).join(' · ')}</div>
                </TD>
                <TD className="text-zinc-400">{p.category}</TD>
                <TD align="right" className="tabular-nums">
                  {p.is_free ? 'Free' : p.price == null ? <Badge tone="amber" size="sm">Not priced</Badge> : formatAmount(p.price)}
                </TD>
                <TD className="text-zinc-400 text-xs">{p.warranty_months ? `${p.warranty_months / 12 === 1 ? '1 year' : `${p.warranty_months} months`} ${p.warranty_label}` : '—'}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {p.kind === 'software' && <Badge tone="indigo" size="sm">Software</Badge>}
                    {!p.is_stock && p.kind !== 'software' && <Badge size="sm">Not stocked</Badge>}
                    {p.track_serials && <Badge tone="sky" size="sm">Serials</Badge>}
                    {(p.dn_components ?? []).length > 0 && <Badge tone="violet" size="sm">Set of {p.dn_components.length + 1}</Badge>}
                  </div>
                </TD>
                <TD align="right" className="tabular-nums text-zinc-400">{p.low_stock_threshold || '—'}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <ProductFormModal open={disc.open} onClose={disc.onClose} product={editing} onSaved={reload} />
    </div>
  )
}
