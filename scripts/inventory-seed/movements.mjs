// Ordered ledger rows for the seed. Each historic delivery is preceded by
// an OPENING of exactly what it took out of the office (we have no purchase
// history), so the office nets to zero; the 3 Nov count is then posted as
// the real opening balance.
export function seedMovements(seed) {
  const rows = []
  for (const d of seed.deliveries) {
    for (const l of d.lines) {
      rows.push({ moved_on: d.date, product_id: l.product_id, qty: l.qty, from_location_id: null, to_location_id: seed.office.id,
        type: 'OPENING', reference: d.doc.doc_no, note: seed.historicNote })
    }
    for (const l of d.lines) {
      rows.push({ moved_on: d.date, product_id: l.product_id, qty: l.qty, from_location_id: seed.office.id, to_location_id: d.site.id,
        type: 'DELIVERED_TO_SITE', document_id: d.doc.id, reference: d.doc.doc_no, note: null })
    }
  }
  for (const line of seed.countSheet.lines) {
    for (const [sku, left] of Object.entries(line.left)) {
      if (left > 0) {
        rows.push({ moved_on: seed.countSheet.counted_on, product_id: seed.P[sku].id, qty: left, from_location_id: null, to_location_id: seed.office.id,
          type: 'OPENING', reference: 'Office count 3 Nov 2026', note: `Counted: ${line.label}${line.note ? ` (${line.note})` : ''}` })
      }
    }
  }
  return { rows }
}
