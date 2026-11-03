import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import { Table, THead, TR, TH, TD } from '@/components/ui/Table'
import { useToast } from '@/context/ToastContext'
import { formatDate } from '@/lib/format'
import { listCountSheets, listMovements } from '../api'
import { onHand } from '../lib/stock'
import { useInventory } from './InventoryLayout'

export default function ReconciliationPage() {
  const toast = useToast()
  const { locations, stock } = useInventory()
  const [sheets, setSheets] = useState(null)
  const [sheetId, setSheetId] = useState('')
  const [deliveries, setDeliveries] = useState([])

  useEffect(() => {
    document.title = 'Reconciliation · WEDDZ PM'
    Promise.all([listCountSheets(), listMovements({ type: 'DELIVERED_TO_SITE', limit: 5000 })])
      .then(([s, d]) => { setSheets(s); setSheetId(s[0]?.id ?? ''); setDeliveries(d) })
      .catch(err => toast.error(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheets) return <div className="glass rounded-2xl p-12 flex justify-center"><Spinner size="lg" /></div>
  const sheet = sheets.find(s => s.id === sheetId)
  if (!sheet) return <EmptyState icon={ClipboardCheck} title="No stock counts yet" description="Physical counts appear here to compare against the delivery records." />

  const loc = locations.find(l => l.id === sheet.location_id)
  const rows = sheet.lines.map(l => {
    const ids = new Set(l.product_ids)
    const moves = deliveries.filter(m => ids.has(m.product_id) && m.moved_on <= sheet.counted_on)
    const delivered = moves.reduce((s, m) => s + m.qty, 0)
    const docs = [...new Set(moves.map(m => m.document?.doc_no ?? m.reference).filter(Boolean))]
    const now = l.product_ids.reduce((s, id) => s + onHand(stock, id, sheet.location_id), 0)
    const diff = l.used == null ? null : l.used - delivered
    return { ...l, delivered, docs, now, diff }
  })
  const flagged = rows.filter(r => r.diff)

  return (
    <div className="space-y-6">
      <PageHeader title="Reconciliation" description="A physical stock count compared with what the delivery documents say was handed over." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-2">
          <div className="text-sm text-zinc-300">
            Count of <span className="text-zinc-100 font-medium">{loc?.name}</span> on <span className="text-zinc-100 font-medium">{formatDate(sheet.counted_on)}</span>
          </div>
          {sheet.notes && <p className="text-xs text-zinc-500">{sheet.notes}</p>}
          <p className="text-xs text-zinc-500">“Used” is from the count sheet; “Delivered” is the total on delivery notes/invoices up to the count date. A difference means usage that isn't documented yet (or a miscount). Nothing is posted to make them match.</p>
        </Card>
        <Card>
          {sheets.length > 1 && <Select value={sheetId} onChange={e => setSheetId(e.target.value)} options={sheets.map(s => ({ value: s.id, label: formatDate(s.counted_on) }))} />}
          <div className="text-3xl font-semibold text-zinc-100 tabular-nums">{flagged.length}</div>
          <div className="text-sm text-zinc-400">of {rows.length} items differ</div>
        </Card>
      </div>

      <Table>
        <THead>
          <TR><TH>Item</TH><TH align="right">Used (sheet)</TH><TH align="right">Delivered (documents)</TH><TH align="right">Difference</TH><TH align="right">Left (sheet)</TH><TH align="right">{loc?.name} now</TH><TH>Documents</TH></TR>
        </THead>
        <tbody>
          {rows.map(r => (
            <TR key={r.label}>
              <TD>
                <div className="text-zinc-100">{r.label}</div>
                {r.note && <div className="text-xs text-zinc-500">{r.note}</div>}
              </TD>
              <TD align="right" className="tabular-nums">{r.used ?? '—'}</TD>
              <TD align="right" className="tabular-nums">{r.delivered}</TD>
              <TD align="right">
                {r.diff == null ? <span className="text-zinc-600">—</span>
                  : r.diff === 0 ? <Badge tone="emerald" size="sm">matches</Badge>
                  : <Badge tone={r.diff > 0 ? 'amber' : 'rose'} size="sm">{r.diff > 0 ? `${r.diff} undocumented` : `${-r.diff} more delivered`}</Badge>}
              </TD>
              <TD align="right" className="tabular-nums">{r.left}</TD>
              <TD align="right" className="tabular-nums text-zinc-300">{r.now}</TD>
              <TD className="text-xs text-zinc-500 max-w-[16rem]">{r.docs.join(', ') || '—'}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
