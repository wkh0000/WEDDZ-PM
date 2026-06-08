import { Trash2, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatLKR } from '@/lib/format'

// Shared visible-field styling so the user can immediately tell a cell
// is editable. The old `bg-transparent` look made qty/unit_price feel
// like static text, and Amount was a `<span>` so it couldn't be
// changed at all — both reported as confusing.
const FIELD = 'bg-white/[0.04] border border-white/10 rounded px-1.5 py-1 text-sm text-zinc-100 ' +
  'hover:border-white/20 focus:border-indigo-400/60 focus:bg-white/[0.06] focus:outline-none ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export default function InvoiceLineItems({ items, onChange, taxRate, onTaxRateChange, readOnly = false }) {
  /** Patch qty/unit_price/description → amount = qty × unit_price. */
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

  /**
   * Set the line's amount directly. Derives unit_price from the typed
   * amount and the current quantity (qty defaults to 1 if zero), so
   * amount = qty × unit_price stays consistent. This lets the user
   * enter "1500" once for a flat-fee line instead of being forced to
   * pick a qty and unit price.
   */
  function setAmount(index, raw) {
    const next = items.map((it, i) => {
      if (i !== index) return it
      const a = Number(raw)
      if (!Number.isFinite(a)) return { ...it, amount: 0 }
      const q = Number(it.quantity ?? 0) > 0 ? Number(it.quantity) : 1
      const u = +(a / q).toFixed(2)
      return { ...it, quantity: q, unit_price: u, amount: +a.toFixed(2) }
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
        {/* Outer scroll wrapper — keeps the 12-col grid usable on
            phones without collapsing the schema. min-w on rows sets
            the breakpoint where horizontal scroll kicks in. */}
        <div className="overflow-x-auto">
        <div className="min-w-[480px] grid grid-cols-12 gap-2 px-3 py-2 bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
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
            <div key={i} className="min-w-[480px] grid grid-cols-12 gap-2 px-3 py-2 items-center">
              <input
                disabled={readOnly}
                value={it.description ?? ''}
                onChange={e => update(i, { description: e.target.value })}
                placeholder="Service / item"
                className={`col-span-6 ${FIELD} placeholder:text-zinc-500`}
              />
              <input
                disabled={readOnly}
                type="number" step="1" min="0"
                value={it.quantity ?? ''}
                onChange={e => update(i, { quantity: e.target.value })}
                className={`col-span-2 ${FIELD} text-right tabular-nums`}
              />
              <input
                disabled={readOnly}
                type="number" step="0.01" min="0"
                value={it.unit_price ?? ''}
                onChange={e => update(i, { unit_price: e.target.value })}
                className={`col-span-2 ${FIELD} text-right tabular-nums`}
              />
              <div className="col-span-2 flex items-center justify-end gap-1.5">
                <input
                  disabled={readOnly}
                  type="number" step="0.01" min="0"
                  value={it.amount ?? ''}
                  onChange={e => setAmount(i, e.target.value)}
                  title="Editable — sets unit price = amount / qty"
                  className={`flex-1 min-w-0 ${FIELD} text-right tabular-nums font-medium`}
                />
                {!readOnly && (
                  <button onClick={() => remove(i)} aria-label="Remove line"
                    className="text-zinc-500 hover:text-rose-400 p-1 rounded shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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
