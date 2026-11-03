import { formatAmount, stableHash, isBlank } from './format.js'
import {
  C, PAGE, SCALE, BANK_LINES, font, fillRect, hline, vline, put, wrap, putSegments,
  drawFirstHeader, drawContHeader, drawInfoBand, drawFooter
} from './letterhead.js'

const L = PAGE.left
const R = PAGE.right
const W = R - L
const CENTER = PAGE.w / 2

export function pdfFileName(vm) {
  return String(vm.docNo || vm.docTitle || 'document').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') + '.pdf'
}

export async function renderPdf(vm) {
  const mod = await import('jspdf')
  const JsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default
  const doc = new JsPDF({ unit: 'pt', format: 'a4', compress: true, putOnlyUsedFonts: true })
  const created = /^\d{4}-\d{2}-\d{2}$/.test(vm.createdAt || '') ? new Date(vm.createdAt + 'T00:00:00Z') : new Date(Date.UTC(2026, 0, 1))
  doc.setCreationDate(created)
  doc.setFileId(stableHash(JSON.stringify(vm)))
  doc.setProperties({ title: vm.docNo || vm.docTitle, subject: vm.docTitle, author: 'WEDDZ IT', creator: 'WEDDZ PM', keywords: '' })

  const flow = new Flow(doc, vm)
  const scale = vm.kind === 'invoice' ? SCALE.large : SCALE.compact
  drawFirstHeader(doc, vm)
  const bandBottom = drawInfoBand(doc, vm, scale)
  flow.y = drawHeadingIntro(doc, vm, scale, bandBottom)

  if (vm.kind === 'invoice') renderInvoice(flow)
  else if (vm.kind === 'receipt') renderReceipt(flow)
  else if (vm.kind === 'delivery_note' || vm.kind === 'loading_list') renderDeliveryNote(flow)
  else throw new Error(`Unknown document kind: ${vm.kind}`)

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    drawFooter(doc, vm, i, pages)
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

class Flow {
  constructor(doc, vm) { this.doc = doc; this.vm = vm; this.y = 0 }
  fits(h) { return this.y + h <= PAGE.bottom }
  newPage() {
    this.doc.addPage()
    drawContHeader(this.doc, this.vm)
    this.y = PAGE.contTop
  }
  ensure(h) { if (!this.fits(h)) this.newPage() }
}

const FULL_PAGE = PAGE.bottom - PAGE.contTop

function drawHeadingIntro(doc, vm, s, bandBottom) {
  let y = bandBottom + s.headingDy
  let last = bandBottom
  if (!isBlank(vm.heading)) {
    font(doc, 'bold', s.heading, C.blue)
    const lines = wrap(doc, vm.heading, W)
    lines.forEach((l, i) => put(doc, l, L, y + i * s.heading * 1.2))
    y += (lines.length - 1) * s.heading * 1.2
    last = y
  }
  if (!isBlank(vm.intro)) {
    font(doc, 'italic', s.intro, C.grey)
    const lines = wrap(doc, vm.intro, W + 3)
    let iy = (isBlank(vm.heading) ? bandBottom + s.headingDy : y + s.introDy)
    lines.forEach((l, i) => put(doc, l, L, iy + i * s.introPitch))
    last = iy + (lines.length - 1) * s.introPitch
  }
  return last
}

// ================= INVOICE =================
const SEC = { band: 15.1, head: 15.0, descW: 330, base: 10.6, descPitch: 11.2, detailDy: 11.7, detailPitch: 9.6, tail: 4.7, totalDy: 10.7, gapAfter: 20.7 }

function measureInvoiceRow(doc, row) {
  font(doc, 'normal', 9.1)
  const desc = wrap(doc, row.description, SEC.descW)
  font(doc, 'normal', 8.0)
  const detail = wrap(doc, row.detail, SEC.descW)
  const h = SEC.base + (Math.max(1, desc.length) - 1) * SEC.descPitch +
    (detail.length ? SEC.detailDy + (detail.length - 1) * SEC.detailPitch : 0) + SEC.tail
  return { desc, detail, h }
}

function drawSectionBand(doc, y, title, note) {
  fillRect(doc, L, y, W, SEC.band, C.navy)
  font(doc, 'bold', 9.1, C.white)
  const tw = put(doc, title, 47.7, y + 10.6, { cs: 1.3 })
  if (!isBlank(note)) {
    font(doc, 'normal', 7.6, C.white)
    put(doc, note, 47.7 + tw + 6, y + 10.6)
  }
}

function drawItemsHeader(doc, y) {
  fillRect(doc, L, y, W, SEC.head, C.band)
  font(doc, 'bold', 7.4, C.navy)
  const by = y + 10.5
  put(doc, 'DESCRIPTION', 47.5, by, { cs: 0.87 })
  put(doc, 'QTY', 398.1, by, { align: 'center', cs: 0.87 })
  put(doc, 'UNIT PRICE', 471.8, by, { align: 'right', cs: 0.87 })
  put(doc, 'AMOUNT (RS.)', 547.8, by, { align: 'right', cs: 0.87 })
}

function renderInvoice(flow) {
  const { doc, vm } = flow
  const sections = (vm.sections || []).filter(s => (s.rows || []).length)
  flow.y += 20
  sections.forEach((sec, i) => {
    const title = `${String.fromCharCode(65 + i)}. ${String(sec.label || '').toUpperCase()}`
    const rows = sec.rows.map(r => ({ ...r, m: measureInvoiceRow(doc, r) }))
    const total = SEC.band + SEC.head + rows.reduce((a, r) => a + r.m.h, 0) + SEC.totalDy + 4
    // Keep a section together when it fits on a fresh page; otherwise start here and break between rows.
    if (!flow.fits(total) && (total <= FULL_PAGE || !flow.fits(SEC.band + SEC.head + rows.slice(0, 2).reduce((a, r) => a + r.m.h, 0)))) flow.newPage()
    drawSectionBand(doc, flow.y, title, sec.note)
    drawItemsHeader(doc, flow.y + SEC.band)
    flow.y += SEC.band + SEC.head
    rows.forEach((row, ri) => {
      const isLast = ri === rows.length - 1
      const need = row.m.h + (isLast ? SEC.totalDy + 4 : 0)
      if (!flow.fits(need)) {
        flow.newPage()
        drawSectionBand(doc, flow.y, title, [sec.note, 'continued'].filter(Boolean).join(' · '))
        drawItemsHeader(doc, flow.y + SEC.band)
        flow.y += SEC.band + SEC.head
      }
      drawInvoiceRow(doc, flow.y, row)
      flow.y += row.m.h
      hline(doc, L, R, flow.y, isLast ? C.navy : C.rule, 0.4)
    })
    const by = flow.y + SEC.totalDy
    font(doc, 'bold', 9.1, C.navy)
    put(doc, sec.totalLabel, 471.8, by, { align: 'right' })
    put(doc, formatAmount(sec.total), 548.2, by, { align: 'right' })
    flow.y = by + SEC.gapAfter
  })

  // Summary + total box are kept together
  const sum = vm.summary && (vm.summary.rows || []).length ? vm.summary : null
  const sumH = sum ? 13.8 + 15.3 + sum.rows.length * 15.6 + 15.3 + 17.2 : 0
  const boxH = 54.1
  if (!flow.fits(sumH + boxH)) flow.newPage()
  if (sum) drawSummary(doc, flow, sum)
  if (vm.totalDue) drawTotalBox(doc, flow.y, vm.totalDue, { h: boxH, labelDy: 24.7, amountDy: 25, wordsDy: 40.7, amountSize: 18.9 })
  flow.y += boxH

  drawPaymentAndTerms(flow)

  if (!isBlank(vm.closing)) {
    flow.ensure(30)
    font(doc, 'normal', 8.0, C.grey)
    put(doc, vm.closing, CENTER, flow.y + 27, { align: 'center' })
    flow.y += 30
  }
}

function drawInvoiceRow(doc, top, row) {
  const by = top + SEC.base
  font(doc, 'normal', 9.1, C.text)
  row.m.desc.forEach((l, i) => put(doc, l, 47.1, by + i * SEC.descPitch))
  put(doc, String(row.qty ?? ''), 398.1, by, { align: 'center' })
  put(doc, row.free ? 'Free' : (row.unitPrice == null ? '' : formatAmount(row.unitPrice)), 471.8, by, { align: 'right' })
  put(doc, row.free ? 'Free' : formatAmount(row.amount), 548.2, by, { align: 'right' })
  if (row.m.detail.length) {
    font(doc, 'normal', 8.0, C.grey)
    const dy = by + (row.m.desc.length - 1) * SEC.descPitch + SEC.detailDy
    row.m.detail.forEach((l, i) => put(doc, l, 47.1, dy + i * SEC.detailPitch))
  }
}

function drawSummary(doc, flow, sum) {
  const top = flow.y
  font(doc, 'bold', 9.0, C.navy)
  put(doc, sum.heading || 'SUMMARY BY OUTLET', L, top + 7, { cs: 1.75 })
  const bandTop = top + 13.8
  fillRect(doc, L, bandTop, W, 15.3, C.navy)
  font(doc, 'bold', 9.1, C.white)
  const hy = bandTop + 10.7
  put(doc, 'OUTLET', 47.6, hy, { cs: 1.0 })
  put(doc, 'SOFTWARE', 392.7, hy, { align: 'right', cs: 1.0 })
  put(doc, 'HARDWARE', 469.3, hy, { align: 'right', cs: 1.0 })
  put(doc, 'TOTAL (RS.)', 547.7, hy, { align: 'right', cs: 1.0 })
  let y = bandTop + 15.3
  sum.rows.forEach((r, i) => {
    const by = y + 10.7
    font(doc, 'normal', 9.1, C.text)
    put(doc, r.label, 47.1, by)
    put(doc, formatAmount(r.software), 393.3, by, { align: 'right' })
    put(doc, formatAmount(r.hardware), 469.8, by, { align: 'right' })
    put(doc, formatAmount(r.total), 548.2, by, { align: 'right' })
    y += 15.6
    hline(doc, L, R, y, i === sum.rows.length - 1 ? C.navy : C.rule, 0.4)
  })
  fillRect(doc, L, y + 0.2, W, 15.3, C.band)
  const ty = y + 0.2 + 10.7
  font(doc, 'bold', 9.1, C.text)
  put(doc, 'Total', 47.1, ty)
  if (sum.total) {
    put(doc, formatAmount(sum.total.software), 393.3, ty, { align: 'right' })
    put(doc, formatAmount(sum.total.hardware), 469.8, ty, { align: 'right' })
    put(doc, formatAmount(sum.total.total), 548.2, ty, { align: 'right' })
  }
  flow.y = y + 15.5 + 17.2
}

function drawTotalBox(doc, top, box, g) {
  fillRect(doc, L, top, W, g.h, C.navy)
  vline(doc, L + 2.3, top, top + g.h, C.red, 4.54)
  font(doc, 'bold', g.labelSize || 8.0, C.footer)
  put(doc, box.label, 59.3, top + g.labelDy, { cs: 2.2 })
  font(doc, 'bold', g.amountSize, C.white)
  put(doc, 'Rs. ' + formatAmount(box.amount), 538.6, top + g.amountDy, { align: 'right' })
  if (!isBlank(box.words)) {
    font(doc, 'normal', 9.0, C.white)
    wrap(doc, box.words, 475).forEach((l, i) => put(doc, l, 59.5, top + g.wordsDy + i * 11))
  }
}

function drawPaymentAndTerms(flow) {
  const { doc, vm } = flow
  const pay = vm.payment
  const terms = vm.terms && (vm.terms.bullets || []).filter(b => !isBlank(b)).length ? vm.terms : null
  if (!pay && !terms) return
  const top = flow.y + 21
  const lx = 39.7, lw = 250.2, rx = 305.4, rw = 250.2

  const payBullets = []
  if (pay && !isBlank(pay.dueDate)) payBullets.push([['Payment due on or before ', false], [pay.dueDate, true]])
  if (pay && !isBlank(pay.quoteNo)) payBullets.push([['Please quote ', false], [pay.quoteNo, true], [' with your payment', false]])
  const leftLast = pay ? (31.6 + Math.max(0, payBullets.length - 1) * 11.7) + 6.1 + 11.4 + (BANK_LINES.length - 1) * 11.75 : 0

  font(doc, 'normal', 9.1)
  const termLines = terms ? terms.bullets.filter(b => !isBlank(b)).map(b => wrap(doc, b, 221)) : []
  let rightLast = 0
  if (terms) {
    let y = 33.5
    termLines.forEach((lines, i) => { y += (lines.length - 1) * 11.8; rightLast = y; if (i < termLines.length - 1) y += 14.0 })
  }
  const h = Math.max(leftLast, rightLast) + 9.5
  flow.y = top
  if (!flow.fits(h)) { flow.newPage() }
  const t = flow.y

  const box = (x, w) => {
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(201, 211, 227)
    doc.setLineWidth(0.6)
    doc.rect(x, t, w, h, 'FD')
    hline(doc, x, x + w, t + 1.3, C.blue, 2.55)
  }
  if (pay) {
    box(lx, lw)
    font(doc, 'bold', 8.0, C.navy)
    put(doc, 'PAYMENT DETAILS', 51.3, t + 15.8, { cs: 1.8 })
    let y = t + 31.6
    payBullets.forEach((segs, i) => {
      font(doc, 'normal', 9.1, C.red)
      put(doc, '•', 51.3, y)
      putSegments(doc, segs, 59.0, y, 9.1, C.text)
      if (i < payBullets.length - 1) y += 11.7
    })
    const ry = y + 6.1
    hline(doc, 51.3, 278.3, ry, C.rule, 0.4)
    let by = ry + 11.4
    BANK_LINES.forEach(segs => { putSegments(doc, segs, 51.3, by, 9.1, C.text); by += 11.75 })
  }
  if (terms) {
    box(rx, rw)
    font(doc, 'bold', 8.0, C.navy)
    put(doc, terms.heading || 'WARRANTY & TERMS', 316.6, t + 15.8, { cs: 1.8 })
    let y = t + 33.5
    termLines.forEach((lines, i) => {
      font(doc, 'normal', 9.1, C.red)
      put(doc, '•', 318.4, y)
      font(doc, 'normal', 9.1, C.text)
      lines.forEach((l, li) => put(doc, l, 326.1, y + li * 11.8))
      y += (lines.length - 1) * 11.8 + (i < termLines.length - 1 ? 14.0 : 0)
    })
  }
  flow.y = t + h
}

// ================= DELIVERY NOTE / LOADING LIST =================
const DN = { band: 13.4, base: 9.3, nameW: 440, namePitch: 10, detailDy: 10.9, detailPitch: 9, tail: 4.3 }

function measureDnRow(doc, item) {
  font(doc, 'normal', 8.5)
  const name = wrap(doc, item.name, DN.nameW)
  font(doc, 'normal', 7.2)
  const detail = wrap(doc, item.detail, DN.nameW)
  const h = DN.base + (Math.max(1, name.length) - 1) * DN.namePitch +
    (detail.length ? DN.detailDy + (detail.length - 1) * DN.detailPitch : 0) + DN.tail
  return { name, detail, h }
}

function drawDnHeader(doc, y) {
  fillRect(doc, L, y, W, DN.band, C.navy)
  font(doc, 'bold', 8.5, C.white)
  const by = y + 9.3
  put(doc, 'No.', 47.1, by)
  put(doc, 'DEVICE / ITEM', 76.1, by, { cs: 0.9 })
  put(doc, 'QTY', 537.7, by, { align: 'center', cs: 0.9 })
}

function measureConfirmation(doc, conf) {
  font(doc, 'normal', 8.5)
  const lines = wrap(doc, conf.text, 484.7)
  const lastText = 32.3 + Math.max(0, lines.length - 1) * 11
  const nameDy = Math.max(83.6, lastText + 28)
  return { lines, nameDy, h: nameDy + 12.1 + 12.9 }
}

function renderDeliveryNote(flow) {
  const { doc, vm } = flow
  const items = (vm.items || []).filter(it => !isBlank(it.name)).map(it => ({ ...it, m: measureDnRow(doc, it) }))
  const conf = vm.kind === 'delivery_note' && vm.confirmation && !isBlank(vm.confirmation.text) ? vm.confirmation : null
  const cm = conf ? measureConfirmation(doc, conf) : null
  font(doc, 'normal', 7.2)
  const noteLines = wrap(doc, vm.note, W)

  const tableH = 11.3 + DN.band + items.reduce((a, r) => a + r.m.h, 0) + DN.band
  const noteH = noteLines.length ? 9.1 + (noteLines.length - 1) * 9.5 : 0
  const free = PAGE.bottom - flow.y - tableH - noteH - (cm ? cm.h : 0)
  const gap1 = Math.min(70, Math.max(14, free * 0.37))
  const gap2 = Math.min(65.5, Math.max(20, free * 0.35))

  flow.y += gap1
  font(doc, 'bold', 8.0, C.navy)
  put(doc, vm.itemsHeading || (vm.kind === 'loading_list' ? 'ITEMS LOADED' : 'DEVICES DELIVERED'), L, flow.y + 6.2, { cs: 1.6 })
  flow.y += 11.3
  drawDnHeader(doc, flow.y)
  flow.y += DN.band
  items.forEach((it, i) => {
    const isLast = i === items.length - 1
    if (!flow.fits(it.m.h + (isLast ? DN.band : 0))) {
      flow.newPage()
      drawDnHeader(doc, flow.y)
      flow.y += DN.band
    }
    const by = flow.y + DN.base
    font(doc, 'normal', 8.5, C.text)
    put(doc, String(i + 1), 53.9, by, { align: 'center' })
    it.m.name.forEach((l, li) => put(doc, l, 75.5, by + li * DN.namePitch))
    put(doc, String(it.qty ?? ''), 537.7, by, { align: 'center' })
    if (it.m.detail.length) {
      font(doc, 'normal', 7.2, C.grey)
      const dy = by + (it.m.name.length - 1) * DN.namePitch + DN.detailDy
      it.m.detail.forEach((l, li) => put(doc, l, 75.5, dy + li * DN.detailPitch))
    }
    flow.y += it.m.h
    hline(doc, L, R, flow.y, isLast ? C.navy : C.rule, 0.4)
  })
  fillRect(doc, L, flow.y + 0.2, W, DN.band, C.band)
  font(doc, 'bold', 8.5, C.text)
  const ty = flow.y + 0.2 + 9.4
  put(doc, 'Total items', 75.5, ty)
  const totalItems = vm.totalItems ?? items.reduce((a, it) => a + Number(it.qty || 0), 0)
  put(doc, String(totalItems), 537.7, ty, { align: 'center' })
  flow.y += 0.2 + DN.band

  if (noteLines.length) {
    flow.ensure(noteH + 3)
    font(doc, 'normal', 7.2, C.grey)
    noteLines.forEach((l, i) => put(doc, l, L, flow.y + 9.1 + i * 9.5))
    flow.y += noteH
  }

  if (conf) {
    flow.y += gap2
    if (!flow.fits(cm.h)) flow.newPage()
    const top = flow.y
    fillRect(doc, L, top, W, cm.h, C.band)
    vline(doc, L + 2, top, top + cm.h, C.red, 3.97)
    font(doc, 'bold', 7.6, C.navy)
    put(doc, conf.heading || 'BRANCH MANAGER CONFIRMATION', 56.7, top + 17, { cs: 1.55 })
    font(doc, 'normal', 8.5, C.text)
    cm.lines.forEach((l, i) => put(doc, l, 56.7, top + 32.3 + i * 11))
    const ny = top + cm.nameDy
    if (!isBlank(conf.name)) { font(doc, 'bold', 8.5, C.navy); put(doc, conf.name, 56.7, ny) }
    hline(doc, 223.9, 374.2, ny - 0.3, C.navy, 0.6)
    hline(doc, 391.2, 541.4, ny - 0.3, C.navy, 0.6)
    font(doc, 'normal', 7.1, C.grey)
    if (!isBlank(conf.sub)) put(doc, conf.sub, 56.7, ny + 12.1)
    put(doc, 'Signature', 223.9, ny + 12.1)
    put(doc, 'Date', 391.2, ny + 12.1)
    flow.y = top + cm.h
  }
}

// ================= RECEIPT =================
function measureRows(doc, rows, textW) {
  return rows.map(r => {
    font(doc, 'normal', 8.5)
    const main = wrap(doc, r.description ?? r.label, textW)
    font(doc, 'normal', 7.2)
    const detail = wrap(doc, r.detail, textW)
    const h = 9.9 + (Math.max(1, main.length) - 1) * 10 + (detail.length ? 11 + (detail.length - 1) * 9 : 0) + 4.5
    return { ...r, main, detailLines: detail, h }
  })
}

function drawReceiptTable(flow, heading, firstLabel, split, rows, { boldAmount = false, balance = null, gap = 34 } = {}) {
  const { doc } = flow
  const mrows = measureRows(doc, rows, split - 49.3 - 10)
  const headH = 11.5 + 14.3
  const firstNeed = headH + (mrows[0]?.h || 0)
  flow.ensure(firstNeed + gap)
  flow.y += gap
  const drawHead = () => {
    fillRect(doc, L, flow.y, W, 14.3, C.navy)
    font(doc, 'bold', 8.5, C.white)
    put(doc, firstLabel, 49.9, flow.y + 9.9, { cs: 0.9 })
    put(doc, 'AMOUNT (RS.)', 545.4, flow.y + 9.9, { align: 'right', cs: 0.9 })
    flow.y += 14.3
  }
  font(doc, 'bold', 8.0, C.navy)
  put(doc, heading, L, flow.y + 6.2, { cs: 1.6 })
  flow.y += 11.5
  drawHead()
  mrows.forEach((r, i) => {
    const isLast = i === mrows.length - 1
    if (!flow.fits(r.h + (isLast && balance ? 14.4 : 0))) { flow.newPage(); drawHead() }
    const by = flow.y + 9.9
    font(doc, 'normal', 8.5, C.text)
    r.main.forEach((l, li) => put(doc, l, 49.3, by + li * 10))
    if (!isBlank(r.amountText)) {
      font(doc, boldAmount && i === 0 ? 'bold' : 'normal', 8.5, C.text)
      put(doc, r.amountText, 546, by, { align: 'right' })
    }
    if (r.detailLines.length) {
      font(doc, 'normal', 7.2, C.grey)
      const dy = by + (r.main.length - 1) * 10 + 11
      r.detailLines.forEach((l, li) => put(doc, l, 49.3, dy + li * 9))
    }
    flow.y += r.h
    hline(doc, L, R, flow.y, isLast ? C.navy : C.rule, 0.4)
  })
  if (balance) {
    fillRect(doc, L, flow.y + 0.2, W, 14.2, C.band)
    font(doc, 'bold', 8.5, C.text)
    put(doc, balance.label, 49.3, flow.y + 0.2 + 9.9)
    put(doc, balance.amountText, 546, flow.y + 0.2 + 9.9, { align: 'right' })
    flow.y += 14.4
  }
}

function measureReceiptBody(doc, vm) {
  let h = vm.amountBox ? 61.6 : 0
  const table = (rows, split, balance, gap) => gap + 11.5 + 14.3 +
    measureRows(doc, rows, split - 49.3 - 10).reduce((a, r) => a + r.h, 0) + (balance ? 14.4 : 0)
  if (vm.paymentDetails?.rows?.length) h += table(vm.paymentDetails.rows, 463.2, null, 34)
  if (vm.accountSummary?.rows?.length) h += table(vm.accountSummary.rows.map(r => ({ ...r, description: r.label })), 430.6, vm.accountSummary.balance, 28.2)
  if (vm.breakdown?.rows?.length) h += 11.9 + 10.4 + (vm.breakdown.rows.length - 1) * 10.6 + (vm.breakdown.total ? 10.9 : 0)
  if (vm.thanksBox) {
    font(doc, 'bold', 8.5); const tl = wrap(doc, vm.thanksBox.title, 485)
    font(doc, 'normal', 7.6); const bl = wrap(doc, vm.thanksBox.body, 485)
    h += 15.8 + 14.6 + Math.max(0, tl.length - 1) * 10.5 + (bl.length ? 13.3 + (bl.length - 1) * 11 : 0) + 10.1
  }
  if (!isBlank(vm.footnote)) { font(doc, 'normal', 7.2); h += 13.1 + (wrap(doc, vm.footnote, W).length - 1) * 11 }
  if (!isBlank(vm.closing)) h += 30
  return h
}

function renderReceipt(flow) {
  const { doc, vm } = flow
  // Amount box, spaced from the intro like the original
  if (vm.amountBox) {
    const gap = Math.min(41.8, Math.max(16, PAGE.bottom - flow.y - measureReceiptBody(doc, vm)))
    flow.y += gap
    flow.ensure(61.6)
    drawTotalBox(doc, flow.y, vm.amountBox, { h: 61.6, labelDy: 29, amountDy: 29.5, wordsDy: 45.5, amountSize: 20.8, labelSize: 7.6 })
    flow.y += 61.6
  }
  const pd = vm.paymentDetails
  if (pd && (pd.rows || []).length) {
    drawReceiptTable(flow, pd.heading || 'PAYMENT DETAILS', 'DESCRIPTION', 463.2, pd.rows, { boldAmount: true })
  }
  const as = vm.accountSummary
  if (as && (as.rows || []).length) {
    drawReceiptTable(flow, as.heading || 'ACCOUNT SUMMARY', 'ITEM', 430.6, as.rows.map(r => ({ ...r, description: r.label })), { balance: as.balance, gap: 28.2 })
  }
  const bd = vm.breakdown
  if (bd && (bd.rows || []).length) {
    const h = 11.9 + 10.4 + (bd.rows.length - 1) * 10.6 + 3.4 + 7.5 + 3
    flow.ensure(h)
    let y = flow.y + 11.9
    font(doc, 'bold', 7.2, C.navy)
    put(doc, bd.heading || 'BALANCE BREAKDOWN', 49.9, y, { cs: 0.6 })
    y += 10.4
    bd.rows.forEach((r, i) => {
      font(doc, 'normal', 7.2, C.grey)
      put(doc, r.label, 49.3, y)
      put(doc, r.amountText, 546, y, { align: 'right' })
      if (i < bd.rows.length - 1) y += 10.6
    })
    hline(doc, L, R, y + 3.4, C.rule, 0.4)
    if (bd.total) {
      font(doc, 'bold', 7.2, C.navy)
      put(doc, bd.total.label, 49.3, y + 10.9)
      put(doc, bd.total.amountText, 546, y + 10.9, { align: 'right' })
      y += 10.9
    }
    flow.y = y
  }
  const tb = vm.thanksBox
  if (tb && (!isBlank(tb.title) || !isBlank(tb.body))) {
    font(doc, 'bold', 8.5)
    const tl = wrap(doc, tb.title, 485)
    font(doc, 'normal', 7.6)
    const bl = wrap(doc, tb.body, 485)
    const h = 14.6 + (tl.length - 1) * 10.5 + (bl.length ? 13.3 + (bl.length - 1) * 11 : 0) + 10.1
    flow.y += 15.8
    flow.ensure(h)
    const top = flow.y
    fillRect(doc, L, top, W, h, C.band)
    vline(doc, L + 2, top, top + h, C.red, 3.97)
    let y = top + 14.6
    font(doc, 'bold', 8.5, C.navy)
    tl.forEach((l, i) => put(doc, l, 56.4, y + i * 10.5))
    y += (tl.length - 1) * 10.5
    font(doc, 'normal', 7.6, C.grey)
    bl.forEach((l, i) => put(doc, l, 56.5, y + 13.3 + i * 11))
    flow.y = top + h
  }
  if (!isBlank(vm.footnote)) {
    font(doc, 'normal', 7.2, C.grey)
    const lines = wrap(doc, vm.footnote, W)
    const h = 13.1 + (lines.length - 1) * 11
    flow.ensure(h + 2)
    lines.forEach((l, i) => put(doc, l, L, flow.y + 13.1 + i * 11))
    flow.y += h
  }
  if (!isBlank(vm.closing)) {
    flow.ensure(30)
    font(doc, 'normal', 7.6, C.grey)
    put(doc, vm.closing, CENTER, flow.y + 28.8, { align: 'center' })
    flow.y += 30
  }
}

