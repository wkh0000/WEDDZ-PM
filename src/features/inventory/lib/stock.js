// Pure stock / document / balance maths shared by the UI and tests.
// The database enforces the same rules (013_inventory_module.sql);
// these mirror them so the UI can explain problems before posting.

export const MOVEMENT_TYPES = {
  OPENING:             { label: 'Opening stock',      from: [],                   to: ['office', 'vehicle'], admin: true },
  PURCHASE:            { label: 'Purchase',           from: [],                   to: ['office'],            manage: true },
  TRANSFER_TO_VEHICLE: { label: 'Loaded on vehicle',  from: ['office'],           to: ['vehicle'] },
  RETURN_TO_OFFICE:    { label: 'Returned to office', from: ['vehicle'],          to: ['office'] },
  DELIVERED_TO_SITE:   { label: 'Delivered to site',  from: ['office', 'vehicle'], to: ['site'] },
  ADJUSTMENT:          { label: 'Adjustment',         admin: true, reason: true },
  DAMAGED:             { label: 'Damaged / written off', from: ['office', 'vehicle'], to: [], admin: true, reason: true }
}

const key = (productId, locationId) => `${productId}|${locationId}`

/** movements → Map("product|location" → qty) */
export function computeStock(movements) {
  const map = new Map()
  for (const m of movements) {
    if (m.to_location_id) map.set(key(m.product_id, m.to_location_id), (map.get(key(m.product_id, m.to_location_id)) ?? 0) + m.qty)
    if (m.from_location_id) map.set(key(m.product_id, m.from_location_id), (map.get(key(m.product_id, m.from_location_id)) ?? 0) - m.qty)
  }
  return map
}

export function onHand(stock, productId, locationId) {
  return stock.get(key(productId, locationId)) ?? 0
}

/** inv_stock view rows → Map */
export function stockFromRows(rows) {
  const map = new Map()
  for (const r of rows) map.set(key(r.product_id, r.location_id), r.qty)
  return map
}

/**
 * Check a batch of planned movements against current stock, in order.
 * Returns a list of human-readable problems (empty when OK).
 */
export function validateMoves(stock, moves, { products, locations }) {
  const working = new Map(stock)
  const problems = []
  const pName = id => products.find(p => p.id === id)?.name ?? 'item'
  const lName = id => locations.find(l => l.id === id)?.name ?? 'location'
  for (const m of moves) {
    if (!(m.qty > 0)) { problems.push(`${pName(m.product_id)}: quantity must be at least 1`); continue }
    if (m.from_location_id) {
      const k = key(m.product_id, m.from_location_id)
      const have = working.get(k) ?? 0
      if (have < m.qty) {
        problems.push(`Not enough stock: ${lName(m.from_location_id)} has ${have} × ${pName(m.product_id)} (tried to move ${m.qty}).`)
        continue
      }
      working.set(k, have - m.qty)
    }
    if (m.to_location_id) {
      const k = key(m.product_id, m.to_location_id)
      working.set(k, (working.get(k) ?? 0) + m.qty)
    }
  }
  return problems
}

const PREFIX = { INVOICE: 'WIT-INV', RECEIPT: 'WIT-R', DELIVERY_NOTE: 'WIT-DN', QUOTATION: 'WIT-Q' }

/** ('INVOICE', '2026-085', 6) → "WIT-INV-2026-085-06" */
export function formatDocNo(type, docRef, seq) {
  if (!PREFIX[type]) throw new Error(`Unknown document type ${type}`)
  return `${PREFIX[type]}-${docRef}-${String(seq).padStart(2, '0')}`
}

/** Next number: one above the highest used, never reusing a number. */
export function nextDocNo(type, docRef, usedSeqs, counter = 0) {
  const seq = Math.max(counter, ...usedSeqs, 0) + 1
  return { seq, doc_no: formatDocNo(type, docRef, seq) }
}

export function lineAmount(line) {
  if (line.is_free) return 0
  return Math.round((Number(line.qty) || 0) * (Number(line.unit_price) || 0) * 100) / 100
}

export function invoiceTotals(lines) {
  let software = 0, hardware = 0
  for (const l of lines) {
    const a = lineAmount(l)
    if (l.kind === 'software') software += a
    else hardware += a
  }
  software = Math.round(software * 100) / 100
  hardware = Math.round(hardware * 100) / 100
  return { software, hardware, total: Math.round((software + hardware) * 100) / 100 }
}

/** Group invoice lines into sections, preserving first-seen order. */
export function groupInvoiceLines(lines) {
  const groups = []
  const byKey = new Map()
  for (const l of lines) {
    const k = l.group ?? '_items'
    if (!byKey.has(k)) {
      const g = { key: k, label: l.group_label ?? 'Items', kind: l.group_kind ?? 'other', dn_no: l.dn_no ?? null, lines: [] }
      byKey.set(k, g); groups.push(g)
    }
    byKey.get(k).lines.push(l)
  }
  return groups.map(g => ({ ...g, ...invoiceTotals(g.lines) }))
}

/** Invoice ids whose payments count towards `invoiceId` (itself + everything it replaced, recursively). */
export function replacementChain(invoiceId, documents) {
  const ids = new Set([invoiceId])
  let grew = true
  while (grew) {
    grew = false
    for (const d of documents) {
      if (d.replaced_by_id && ids.has(d.replaced_by_id) && !ids.has(d.id)) { ids.add(d.id); grew = true }
    }
  }
  return ids
}

export function invoicePaid(invoiceId, documents, payments) {
  const chain = replacementChain(invoiceId, documents)
  return Math.round(payments
    .filter(p => chain.has(p.invoice_id) && p.cheque_status !== 'bounced')
    .reduce((s, p) => s + Number(p.amount), 0) * 100) / 100
}

export function invoiceBalance(invoice, documents, payments) {
  return Math.round((Number(invoice.total) - invoicePaid(invoice.id, documents, payments)) * 100) / 100
}

/**
 * Split what's been paid between software and hardware. Payments with an
 * explicit split use it; the rest is applied to software first.
 */
export function splitPaid(invoice, payments) {
  let sw = 0, hw = 0, loose = 0
  for (const p of payments) {
    if (p.cheque_status === 'bounced') continue
    const s = Number(p.software_amount ?? 0), h = Number(p.hardware_amount ?? 0)
    sw += s; hw += h; loose += Number(p.amount) - s - h
  }
  const swRoom = Math.max(Number(invoice.software_total) - sw, 0)
  const toSw = Math.min(loose, swRoom)
  sw += toSw; hw += loose - toSw
  const r = n => Math.round(n * 100) / 100
  return {
    softwarePaid: r(sw), hardwarePaid: r(hw),
    softwareBalance: r(Number(invoice.software_total) - sw),
    hardwareBalance: r(Number(invoice.hardware_total) - hw)
  }
}
