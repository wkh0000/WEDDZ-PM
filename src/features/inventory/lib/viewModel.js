// DB rows → PDF view models (see pdf/__fixtures__ for the shape).
import { amountInWords, formatRs } from './money.js'
import { groupInvoiceLines, invoiceTotals, splitPaid } from './stock.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-11-01' → '1 November 2026' */
export function longDate(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function joinList(items) {
  const xs = items.filter(Boolean)
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`
}

function joinAnd(items) {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function clientBlock(heading, client) {
  return {
    heading,
    strong: client.contact_name,
    lines: [client.company, client.mobile && `Mobile: ${client.mobile}`].filter(Boolean)
  }
}

const rows = list => list.filter(r => r[1] != null && r[1] !== '')

export const DN_NOTE = 'Hardware carries a 1-year warranty and the tablet a 1-year guarantee, from the delivery date. Prices are shown on the related invoice.'
export const WARRANTY_BULLETS = [
  'POS hardware carries a 1-year warranty and each tablet a 1-year guarantee, from the date of delivery.',
  'Cover is for manufacturing defects. It does not cover physical damage, liquid damage, power surges or misuse.'
]

/** Expand delivery-note lines (kits list their contents as extra lines). */
export function deliveryItems(lines) {
  const items = []
  for (const l of lines) {
    const serials = (l.serials ?? []).length ? `S/N: ${l.serials.join(', ')}` : null
    const detail = [l.detail, serials].filter(Boolean).join(' · ')
    items.push({ name: l.name, ...(detail ? { detail } : {}), qty: l.qty })
    for (const c of l.components ?? []) {
      items.push({ name: c.name, ...(c.detail ? { detail: c.detail } : {}), qty: l.qty * (c.qty ?? 1) })
    }
  }
  return items
}

export function buildDeliveryNoteVM({ doc, client, site }) {
  const date = longDate(doc.doc_date)
  const meta = doc.meta ?? {}
  const items = deliveryItems(doc.lines ?? [])
  const project = client.project_title
  const manager = site.manager_name
  const isOutlet = site.is_outlet !== false
  return {
    kind: 'delivery_note',
    docTitle: 'DELIVERY NOTE',
    docNo: doc.doc_no,
    createdAt: doc.doc_date,
    info: {
      fromHeading: 'DELIVERED BY',
      col2: [clientBlock('CLIENT', client), { heading: 'DELIVERED TO', strong: site.name }],
      col3: [
        { heading: 'DELIVERY DETAILS', rows: rows([['Delivery note:', doc.doc_no, true], ['Delivery date:', date, true], ['Billing:', meta.billing]]) },
        ...(site.address ? [{ heading: isOutlet ? 'OUTLET ADDRESS' : 'ADDRESS', lines: [site.address] }] : [])
      ]
    },
    heading: doc.title || `Devices Handed Over — ${site.name}`,
    intro: doc.intro || (project
      ? `Hardware and devices delivered for the ${project} at ${site.name} on ${date}.`
      : `Hardware and devices delivered to ${site.name} on ${date}.`),
    itemsHeading: 'DEVICES DELIVERED',
    items,
    totalItems: items.reduce((s, i) => s + i.qty, 0),
    note: meta.note ?? DN_NOTE,
    confirmation: {
      heading: isOutlet ? 'BRANCH MANAGER CONFIRMATION' : 'RECIPIENT CONFIRMATION',
      text: manager
        ? (isOutlet
          ? `I, ${manager}, branch manager of ${site.name}, confirm that I have checked all the devices listed above and received them in good condition.`
          : `I, ${manager}, confirm that I have checked all the devices listed above and received them in good condition.`)
        : 'I confirm that I have checked all the devices listed above and received them in good condition.',
      ...(manager ? { name: manager } : {}),
      sub: [isOutlet && manager ? 'Branch manager' : null, site.manager_mobile].filter(Boolean).join(' · ') || undefined
    },
    footerThanks: 'Thank you for your business!'
  }
}

export function buildLoadingListVM({ deployment, client, vehicle, sites, items }) {
  const date = longDate(deployment.deploy_date)
  return {
    kind: 'loading_list',
    docTitle: 'LOADING LIST',
    docNo: `${vehicle.name} · ${date}`,
    createdAt: deployment.deploy_date,
    info: {
      fromHeading: 'FROM',
      col2: [clientBlock('CLIENT', client), ...(sites.length ? [{ heading: sites.length > 1 ? 'OUTLETS' : 'OUTLET', lines: [joinList(sites.map(s => s.name))] }] : [])],
      col3: [{ heading: 'TRIP DETAILS', rows: rows([['Vehicle:', vehicle.name, true], ['Date:', date, true], ['Staff:', deployment.staff]]) }]
    },
    heading: `Loading List — ${vehicle.name}`,
    intro: `Items loaded from the office for delivery on ${date}.`,
    itemsHeading: 'ITEMS LOADED',
    items,
    totalItems: items.reduce((s, i) => s + i.qty, 0),
    note: 'Unused items must be returned to the office at the end of the trip.',
    footerThanks: 'Thank you for your business!'
  }
}

function outletsText(groups) {
  const outlets = groups.filter(g => g.kind === 'outlet').map(g => g.label)
  if (!outlets.length) return null
  const strip = outlets.every(o => o.endsWith(' Wine Stores')) && outlets.length > 1
  return joinList(strip ? outlets.map(o => o.slice(0, -' Wine Stores'.length)) : outlets)
}

export function buildInvoiceVM({ doc, client, replacedNos = [] }) {
  const meta = doc.meta ?? {}
  const groups = groupInvoiceLines(doc.lines ?? [])
  const outlets = meta.outlets_text ?? outletsText(groups)
  const outletCount = groups.filter(g => g.kind === 'outlet').length
  const sections = groups.map(g => ({
    label: g.label,
    ...(g.dn_no ? { note: `delivery note ${g.dn_no}` } : {}),
    rows: g.lines.map(l => ({
      description: l.description,
      ...(l.detail ? { detail: l.detail } : {}),
      qty: Number(l.qty),
      unitPrice: l.is_free ? null : Number(l.unit_price),
      amount: l.is_free ? 0 : Number(l.amount ?? Math.round(l.qty * l.unit_price * 100) / 100),
      free: !!l.is_free
    })),
    totalLabel: (g.kind === 'outlet' ? 'Outlet total — ' : 'Total — ') + g.label,
    total: g.total
  }))
  const totals = invoiceTotals(doc.lines ?? [])
  const hasHardware = (doc.lines ?? []).some(l => l.kind !== 'software' && !l.is_free)
  const replaces = replacedNos.length
    ? [`This invoice replaces ${replacedNos.length > 1 ? 'invoices' : 'invoice'} ${joinAnd(replacedNos)}.`]
    : []
  return {
    kind: 'invoice',
    docTitle: 'INVOICE',
    docNo: doc.doc_no,
    createdAt: doc.doc_date,
    info: {
      fromHeading: 'FROM',
      col2: [clientBlock('BILL TO', client), ...(outlets ? [{ heading: outletCount > 1 ? 'OUTLETS' : 'OUTLET', lines: [outlets] }] : [])],
      col3: [{ heading: 'INVOICE DETAILS', rows: rows([
        ['Invoice No:', doc.doc_no, true],
        ['Invoice date:', longDate(doc.doc_date), true],
        ['Due date:', longDate(doc.due_date), true],
        ['Currency:', 'Sri Lankan Rupees (Rs.)'],
        ['Project:', client.quotation_no && `Quotation ${client.quotation_no}`]
      ]) }]
    },
    heading: doc.title,
    ...(doc.intro ? { intro: doc.intro } : {}),
    sections,
    summary: sections.length > 1 ? {
      heading: outletCount ? 'SUMMARY BY OUTLET' : 'SUMMARY',
      rows: groups.map(g => ({ label: g.label, software: g.software, hardware: g.hardware, total: g.total })),
      total: totals
    } : null,
    totalDue: { label: 'TOTAL AMOUNT DUE', amount: totals.total, words: amountInWords(totals.total) },
    payment: { dueDate: longDate(doc.due_date), quoteNo: doc.doc_no },
    terms: { heading: 'WARRANTY & TERMS', bullets: [...replaces, ...(hasHardware ? WARRANTY_BULLETS : []), ...(meta.terms_extra ?? [])] },
    closing: 'This is a computer-generated invoice and does not require a signature.',
    footerThanks: 'Thank you for your business!'
  }
}

const METHOD = { cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque' }

function methodText(p) {
  if (!p.method) return null
  return [
    `Payment method: ${METHOD[p.method]}`,
    p.method === 'cheque' && p.cheque_no ? `Cheque no.: ${p.cheque_no}` : null,
    p.method === 'cheque' && p.cheque_status === 'pending' ? 'Subject to realisation' : null
  ].filter(Boolean).join(' · ')
}

/**
 * payments: every payment on the invoice chain, each with `receipt_no`
 * and `receipt_seq`. Only those up to this receipt are shown, so
 * regenerating an old receipt reproduces it.
 */
export function buildReceiptVM({ receipt, payment, invoice, client, payments }) {
  const meta = receipt.meta ?? {}
  const invNo = invoice.doc_no
  const counted = payments
    .filter(p => p.cheque_status !== 'bounced' && p.receipt_seq <= receipt.seq)
    .sort((a, b) => a.receipt_seq - b.receipt_seq)
  const paid = counted.reduce((s, p) => s + Number(p.amount), 0)
  const balance = Math.round((Number(invoice.total) - paid) * 100) / 100
  const settled = balance <= 0
  const pendingCheque = counted.some(p => p.method === 'cheque' && p.cheque_status === 'pending')
  const thisPending = payment.method === 'cheque' && payment.cheque_status === 'pending'
  const split = splitPaid(invoice, counted)
  const bothKinds = Number(invoice.software_total) > 0 && Number(invoice.hardware_total) > 0

  const breakdownRow = (kind, label, total, bal) => ({
    label: `${kind} — ${label} (${formatRs(total)}): ${bal <= 0 ? 'fully paid' : `balance ${formatRs(bal)}`}`,
    amountText: formatRs(Math.max(bal, 0))
  })

  const thanksDefault = settled
    ? {
      title: pendingCheque
        ? `Thank you — Invoice ${invNo} will be fully settled once the cheque clears.`
        : `Thank you — Invoice ${invNo} is now fully paid.`,
      body: pendingCheque
        ? 'We will confirm with you once the payment has cleared. We truly appreciate your prompt payments.'
        : 'We truly appreciate your prompt payments.'
    }
    : { title: `Thank you — balance due on Invoice ${invNo}: ${formatRs(balance)}`, body: `Please quote ${invNo} with your next payment.` }

  const footStart = pendingCheque
    ? (settled
      ? '*Subject to realisation of the cheque: this receipt and the paid-in-full status take effect once the cheque has cleared.'
      : 'Subject to realisation of the cheque: this receipt takes effect once the cheque has cleared.')
    : null
  const footnote = [footStart, meta.footnote_extra].filter(Boolean).join(' ') || null

  return {
    kind: 'receipt',
    docTitle: 'PAYMENT RECEIPT',
    docNo: receipt.doc_no,
    createdAt: receipt.doc_date,
    info: {
      fromHeading: 'FROM',
      col2: [clientBlock('RECEIVED FROM', client)],
      col3: [{ heading: 'RECEIPT DETAILS', rows: rows([
        ['Receipt No:', receipt.doc_no, true],
        ['Receipt date:', longDate(receipt.doc_date), true],
        ['Payment received on:', longDate(payment.paid_on), true],
        ['Currency:', 'Sri Lankan Rupees (Rs.)'],
        ['Against:', `Invoice ${invNo}`]
      ]) }]
    },
    heading: receipt.title || client.project_title || 'Payment Received',
    intro: receipt.intro || `Received with thanks from ${client.contact_name} the sum stated below, as ${settled ? 'the final payment' : 'a part payment'} of Invoice ${invNo}.`,
    amountBox: { label: 'AMOUNT RECEIVED', amount: Number(payment.amount), words: amountInWords(payment.amount) },
    paymentDetails: {
      heading: 'PAYMENT DETAILS',
      rows: [
        {
          description: meta.payment_description || `${settled ? 'Final payment' : 'Part payment'} — Invoice ${invNo}`,
          ...(meta.payment_detail ? { detail: meta.payment_detail } : {}),
          amountText: formatRs(payment.amount)
        },
        { description: `Payment received on ${longDate(payment.paid_on)}`, ...(methodText(payment) ? { detail: methodText(payment) } : {}) }
      ]
    },
    accountSummary: {
      heading: 'ACCOUNT SUMMARY',
      rows: [
        { label: `Invoice ${invNo} total`, ...(meta.invoice_detail ? { detail: meta.invoice_detail } : {}), amountText: formatRs(invoice.total) },
        ...counted.map(p => ({
          label: `Received on ${longDate(p.paid_on)}`,
          detail: p.receipt_seq === receipt.seq
            ? `This receipt — ${receipt.doc_no}${thisPending ? ' (cheque, subject to clearance)' : ''}`
            : [p.method === 'cheque' && p.cheque_no ? `Cheque no. ${p.cheque_no}` : null, `Receipt ${p.receipt_no}`].filter(Boolean).join(' — '),
          amountText: `– ${formatRs(p.amount)}`
        }))
      ],
      balance: {
        label: `Balance due on Invoice ${invNo}`,
        amountText: settled ? `Rs. 0.00 — PAID IN FULL${pendingCheque ? '*' : ''}` : formatRs(balance)
      }
    },
    breakdown: bothKinds ? {
      heading: 'BALANCE BREAKDOWN',
      rows: [
        breakdownRow('Software', meta.software_label || 'software', invoice.software_total, split.softwareBalance),
        breakdownRow('Hardware', meta.hardware_label || 'hardware', invoice.hardware_total, split.hardwareBalance)
      ],
      total: { label: `Balance due on Invoice ${invNo}`, amountText: formatRs(Math.max(balance, 0)) }
    } : null,
    thanksBox: { title: meta.thanks_title || thanksDefault.title, body: meta.thanks_body || thanksDefault.body },
    footnote,
    closing: 'This is a computer-generated receipt and does not require a signature.',
    footerThanks: 'Thank you for your payment!'
  }
}
