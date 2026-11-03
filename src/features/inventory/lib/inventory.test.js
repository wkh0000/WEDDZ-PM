import { describe, it, expect } from 'vitest'
import { amountInWords, formatAmount, formatRs } from './money.js'
import {
  computeStock, onHand, validateMoves, formatDocNo, nextDocNo, invoiceTotals,
  invoicePaid, invoiceBalance, replacementChain, splitPaid
} from './stock.js'
import { buildDeliveryNoteVM, buildInvoiceVM, buildReceiptVM, longDate } from './viewModel.js'
import * as seed from '../../../../scripts/inventory-seed/jmc-2026-11.mjs'
import dn03 from '../pdf/__fixtures__/dn03.json'
import inv06 from '../pdf/__fixtures__/inv06.json'
import r03 from '../pdf/__fixtures__/r03.json'
import { seedMovements } from '../../../../scripts/inventory-seed/movements.mjs'

describe('amount in words', () => {
  it.each([
    [1816450, 'One Million Eight Hundred Sixteen Thousand Four Hundred Fifty'],
    [466300, 'Four Hundred Sixty-Six Thousand Three Hundred'],
    [882230, 'Eight Hundred Eighty-Two Thousand Two Hundred Thirty'],
    [1726990, 'One Million Seven Hundred Twenty-Six Thousand Nine Hundred Ninety'],
    [419300, 'Four Hundred Nineteen Thousand Three Hundred'],
    [87000, 'Eighty-Seven Thousand'],
    [1266300, 'One Million Two Hundred Sixty-Six Thousand Three Hundred'],
    [15, 'Fifteen'],
    [0, 'Zero']
  ])('%d', (n, words) => {
    expect(amountInWords(n)).toBe(`Sri Lankan Rupees ${words} Only`)
  })
  it('handles cents', () => {
    expect(amountInWords(1234.5)).toBe('Sri Lankan Rupees One Thousand Two Hundred Thirty-Four and Cents Fifty Only')
  })
  it('formats amounts with 2 decimals', () => {
    expect(formatAmount(1816450)).toBe('1,816,450.00')
    expect(formatAmount(0.1 + 0.2)).toBe('0.30')
    expect(formatRs(230)).toBe('Rs. 230.00')
  })
})

describe('stock ledger', () => {
  const A = 'a', OFFICE = 'o', VAN = 'v', SITE = 's'
  const ctx = { products: [{ id: A, name: 'POS' }], locations: [{ id: OFFICE, name: 'Office' }, { id: VAN, name: 'Van 1' }, { id: SITE, name: 'Royal' }] }
  const moves = [
    { product_id: A, qty: 5, to_location_id: OFFICE },
    { product_id: A, qty: 3, from_location_id: OFFICE, to_location_id: VAN },
    { product_id: A, qty: 2, from_location_id: VAN, to_location_id: SITE },
    { product_id: A, qty: 1, from_location_id: VAN, to_location_id: OFFICE }
  ]
  it('computes on-hand per location from movements', () => {
    const s = computeStock(moves)
    expect(onHand(s, A, OFFICE)).toBe(3)
    expect(onHand(s, A, VAN)).toBe(0)
    expect(onHand(s, A, SITE)).toBe(2)
  })
  it('blocks moves that would go negative, in order', () => {
    const s = computeStock(moves.slice(0, 2))
    expect(validateMoves(s, [{ product_id: A, qty: 3, from_location_id: VAN, to_location_id: SITE }], ctx)).toEqual([])
    expect(validateMoves(s, [
      { product_id: A, qty: 2, from_location_id: VAN, to_location_id: SITE },
      { product_id: A, qty: 2, from_location_id: VAN, to_location_id: SITE }
    ], ctx)).toEqual(['Not enough stock: Van 1 has 1 × POS (tried to move 2).'])
    expect(validateMoves(s, [{ product_id: A, qty: 0, to_location_id: OFFICE }], ctx)).toHaveLength(1)
  })
  it('seed ledger never goes negative and leaves the counted office stock', () => {
    const { rows } = seedMovements(seed)
    const ctx2 = { products: seed.products, locations: seed.locations }
    expect(validateMoves(new Map(), rows, ctx2)).toEqual([])
    const s = computeStock(rows)
    for (const line of seed.countSheet.lines) {
      for (const [sku, left] of Object.entries(line.left)) {
        expect(onHand(s, seed.P[sku].id, seed.office.id), sku).toBe(left)
      }
    }
    expect(onHand(s, seed.P['TAB-A11-SET'].id, seed.sites.owner.id)).toBe(1)
    expect(onHand(s, seed.P['POS-I5-5G'].id, seed.sites.kumb.id)).toBe(2)
  })
})

describe('document numbering', () => {
  it('formats per project', () => {
    expect(formatDocNo('INVOICE', '2026-085', 6)).toBe('WIT-INV-2026-085-06')
    expect(formatDocNo('RECEIPT', '2026-085', 3)).toBe('WIT-R-2026-085-03')
    expect(formatDocNo('DELIVERY_NOTE', '2026-085', 12)).toBe('WIT-DN-2026-085-12')
  })
  it('never reuses a number', () => {
    expect(nextDocNo('INVOICE', '2026-085', [1, 2, 3, 4, 5, 6]).doc_no).toBe('WIT-INV-2026-085-07')
    expect(nextDocNo('INVOICE', '2026-085', [1, 3], 5).seq).toBe(6)
    expect(nextDocNo('RECEIPT', '2026-086', []).doc_no).toBe('WIT-R-2026-086-01')
  })
})

describe('invoice totals and replacement', () => {
  const { inv } = seed
  it.each([
    [1, 0, 419300], [2, 0, 87000], [3, 760000, 506300], [4, 0, 690300], [5, 0, 882230], [6, 600000, 1216450]
  ])('invoice 085-0%d', (n, software, hardware) => {
    expect(invoiceTotals(inv[n].lines)).toEqual({ software, hardware, total: software + hardware })
  })
  const docs = Object.values(inv).map(d => ({ ...d, total: invoiceTotals(d.lines).total }))
  it('follows the replacement chain', () => {
    expect([...replacementChain(inv[6].id, docs)].sort()).toEqual([inv[4].id, inv[5].id, inv[6].id].sort())
    expect([...replacementChain(inv[3].id, docs)].sort()).toEqual([inv[1].id, inv[2].id, inv[3].id].sort())
  })
  it('085-03 is paid in full, 085-06 is fully open', () => {
    expect(invoicePaid(inv[3].id, docs, seed.payments)).toBe(1266300)
    expect(invoiceBalance(docs.find(d => d.id === inv[3].id), docs, seed.payments)).toBe(0)
    expect(invoiceBalance(docs.find(d => d.id === inv[6].id), docs, seed.payments)).toBe(1816450)
  })
  it('payments on a replaced invoice carry to its replacement; bounced cheques do not count', () => {
    const pays = [{ invoice_id: inv[4].id, amount: 100000 }, { invoice_id: inv[6].id, amount: 50000, cheque_status: 'bounced' }]
    expect(invoicePaid(inv[6].id, docs, pays)).toBe(100000)
  })
})

describe('receipt balances', () => {
  it('splits software and hardware for 085-03', () => {
    const t = invoiceTotals(seed.inv[3].lines)
    const s = splitPaid({ software_total: t.software, hardware_total: t.hardware }, seed.payments)
    expect(s).toEqual({ softwarePaid: 760000, hardwarePaid: 506300, softwareBalance: 0, hardwareBalance: 0 })
  })
  it('applies unsplit payments to software first', () => {
    const s = splitPaid({ software_total: 760000, hardware_total: 506300 }, [{ amount: 800000 }])
    expect(s).toMatchObject({ softwareBalance: 0, hardwareBalance: 466300 })
  })
})

describe('PDF view models match the reference documents', () => {
  const site = id => Object.values(seed.sites).find(s => s.id === id)
  it('dates', () => expect(longDate('2026-11-01')).toBe('1 November 2026'))
  it('delivery note 085-03', () => {
    expect(buildDeliveryNoteVM({ doc: seed.dn[3], client: seed.client, site: site(seed.dn[3].site_ids[0]) })).toEqual(dn03)
  })
  it('invoice 085-06', () => {
    const doc = { ...seed.inv[6], ...invoiceTotals(seed.inv[6].lines) }
    expect(buildInvoiceVM({ doc, client: seed.client, replacedNos: [seed.inv[4].doc_no, seed.inv[5].doc_no] })).toEqual(inv06)
  })
  it('regenerating the same data gives identical PDF bytes', async () => {
    const { renderPdf } = await import('../pdf/render.js')
    const a = await renderPdf(inv06)
    const b = await renderPdf(JSON.parse(JSON.stringify(inv06)))
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  }, 30000)
  it('receipt 085-03', () => {
    const t = invoiceTotals(seed.inv[3].lines)
    const invoice = { ...seed.inv[3], total: t.total, software_total: t.software, hardware_total: t.hardware }
    const payments = seed.payments.map(p => ({ ...p, receipt_no: p.receipt.doc_no, receipt_seq: p.receipt.seq }))
    const payment = payments.find(p => p.receipt_id === seed.rc[3].id)
    expect(buildReceiptVM({ receipt: seed.rc[3], payment, invoice, client: seed.client, payments })).toEqual(r03)
  })
})
