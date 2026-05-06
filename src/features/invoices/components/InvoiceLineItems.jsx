import { Trash2, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatLKR } from '@/lib/format'

export default function InvoiceLineItems({ items, onChange, taxRate, onTaxRateChange, readOnly = false }) {
  function update(index, patch) {
    const next = items.map((it, i) => {
      if (i !== index) return it
      const merged = { ...it, ...patch }
      const q = Number(merged.quantity ?? 0)
      const p = Number(merged.unit_price ?? 0)
      merged.amount = +(q * p).toFixed(2)
      return merged
    })
    onChange(next)
  }
  function remove(index) { onChange(items.filter((_, i) => i !== index)) }
  function add() { onChange([...items, { description: '', quantity: 1, unit_price: 0, amount: 0 }]) }

  const subtotal = items.reduce((s, it) => s + Number(it.amount ?? 0), 0)
  const taxAmount = +(subtotal * (Number(taxRate ?? 0) / 100)).toFixed(2)
  const total = subtotal + taxAmount

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit price</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>
        <div className="divide-y divide-white/5">
          {items.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-zinc-500">No items yet. Add one below.</div>
          )}
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
              <input
                disabled={readOnly}
                value={it.description ?? ''}
                onChange={e => update(i, { description: e.target.value })}
                placeholder="Service / item"
                className="col-span-6 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none px-1.5 py-1 rounded hover:bg-white/[0.03] focus:bg-white/[0.05]"
              />
              <input
                disabled={readOnly}
                type="number" step="1" min="0"
                value={it.quantity ?? ''}
                onChange={e => update(i, { quantity: e.target.value })}
                className="col-span-2 bg-transparent text-sm text-zinc-100 text-right focus:outline-none px-1.5 py-1 rounded hover:bg-white/[0.03] focus:bg-white/[0.05] tabular-nums"
              />
              <input
                disabled={readOnly}
                type="number" step="0.01" min="0"
                value={it.unit_price ?? ''}
                onChange={e => update(i, { unit_price: e.target.value })}
                className="col-span-2 bg-transparent text-sm text-zinc-100 text-right focus:outline-none px-1.5 py-1 rounded hover:bg-white/[0.03] focus:bg-white/[0.05] tabular-nums"
              />
              <div className="col-span-2 flex items-center justify-end gap-2">
                <span className="text-sm text-zinc-100 tabular-nums">{formatLKR(it.amount ?? 0)}</span>
                {!readOnly && (
                  <button onClick={() => remove(i)} className="text-zinc-500 hover:text-rose-400 p-1 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!readOnly && (
        <Button type="button" size="sm" variant="subtle" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={add}>Add line item</Button>
      )}

      <div className="flex justify-end">
        <div className="w-full sm:w-72 space-y-2 text-sm">
          <Row label="Subtotal" value={formatLKR(subtotal)} />
          <div className="flex items-center justify-between gap-2 pb-1">
            <label className="text-zinc-400">Tax</label>
            <div className="flex items-center gap-1.5">
              <input
                disabled={readOnly}
                type="number" step="0.01" min="0" max="100"
                value={taxRate ?? 0}
                onChange={e => onTaxRateChange(e.target.value)}
                className="w-16 bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-zinc-100 text-right focus:outline-none focus:border-indigo-400/60 tabular-nums"
              />
              <span className="text-zinc-500 text-xs">%</span>
              <span className="text-zinc-100 tabular-nums w-24 text-right">{formatLKR(taxAmount)}</span>
            </div>
          </div>
          <div className="border-t border-white/10 pt-2 flex items-center justify-between">
            <span className="font-semibold text-zinc-100">Total</span>
            <span className="text-lg font-semibold text-zinc-100 tabular-nums">{formatLKR(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-100 tabular-nums">{value}</span>
    </div>
  )
}
