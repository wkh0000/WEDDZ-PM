// node scripts/inventory-seed/render-samples.mjs <outDir>
// Regenerates DN 085-03, INV 085-06 and R 085-03 from the seed data, exactly as the app would.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as seed from './jmc-2026-11.mjs'
import { buildDeliveryNoteVM, buildInvoiceVM, buildReceiptVM } from '../../src/features/inventory/lib/viewModel.js'
import { invoiceTotals } from '../../src/features/inventory/lib/stock.js'
import { renderPdf } from '../../src/features/inventory/pdf/render.js'

const out = process.argv[2] ?? 'process/inventory-samples'
mkdirSync(out, { recursive: true })
const site = id => Object.values(seed.sites).find(s => s.id === id)
const withTotals = d => { const t = invoiceTotals(d.lines); return { ...d, total: t.total, software_total: t.software, hardware_total: t.hardware } }

const payments = seed.payments.map(p => ({ ...p, receipt_no: p.receipt.doc_no, receipt_seq: p.receipt.seq }))
const vms = {
  'WIT-DN-2026-085-03': buildDeliveryNoteVM({ doc: seed.dn[3], client: seed.client, site: site(seed.dn[3].site_ids[0]) }),
  'WIT-INV-2026-085-06': buildInvoiceVM({ doc: withTotals(seed.inv[6]), client: seed.client, replacedNos: [seed.inv[4].doc_no, seed.inv[5].doc_no] }),
  'WIT-R-2026-085-03': buildReceiptVM({ receipt: seed.rc[3], payment: payments[2], invoice: withTotals(seed.inv[3]), client: seed.client, payments })
}
for (const [name, vm] of Object.entries(vms)) {
  const bytes = await renderPdf(vm)
  writeFileSync(join(out, `${name}.pdf`), bytes)
  console.log(`${name}.pdf  ${bytes.length} bytes`)
}
