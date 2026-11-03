import { LOGO_PNG, LOGO_ASPECT } from './logo.js'
import { hexToRgb, isBlank } from './format.js'

export const C = {
  navy: '#162B54', red: '#D7263D', blue: '#2B6CE0', band: '#EDF1F7',
  text: '#1E293B', grey: '#5B6475', rule: '#C9D3E3', white: '#FFFFFF',
  muted: '#BEC4CF', footer: '#CCD0D9'
}

export const PAGE = {
  w: 595.28, h: 841.89, left: 39.7, right: 555.6,
  footerTop: 793.7, bottom: 774, contTop: 62.4
}

export const COMPANY = {
  name: 'WEDDZ IT',
  lines: [
    'No. 339/1/H, Kurunegala Road,',
    'Kandy 20800, Sri Lanka',
    'M: 071 359 0359 · O: 081 220 3273',
    'weddzit.com · info@weddzit.com',
    'Reg. No: PV00349189'
  ]
}

export const FOOTER_CONTACT = '071 359 0359 · 081 220 3273 · weddzit.com · info@weddzit.com'
export const FOOTER_ADDRESS = 'No. 339/1/H, Kurunegala Road, Kandy 20800, Sri Lanka'
export const FOOTER_ONE_LINE = FOOTER_CONTACT + ' · No. 339/1/H, Kurunegala Road, Kandy 20800'

// [segments] per line; each segment [text, bold]
export const BANK_LINES = [
  [['Bank:', true], [' NDB (National Development Bank)', false]],
  [['Account Name:', true], [' WEDDZ STUDIO PVT LTD', false]],
  [['Account No:', true], [' 111000354283', false]],
  [['Branch:', true], [' Kandy (002) · ', false], ['SWIFT:', true], [' NDBSLKLX', false]]
]

// Invoices use a slightly larger letterhead scale than delivery notes and receipts (as in the originals).
export const SCALE = {
  large: {
    infoHead: 7.1, info: 8.1, infoPitch: 10.4, headDy: 16.2, firstTextDy: 14.8, subHeadGap: 14.3, subTextDy: 13.8,
    bandBottom: 170.1, heading: 13.3, headingDy: 28.1, intro: 9.1, introDy: 14.6, introPitch: 11.5
  },
  compact: {
    infoHead: 6.6, info: 7.6, infoPitch: 9.6, headDy: 15.8, firstTextDy: 14.1, subHeadGap: 13.6, subTextDy: 13.0,
    bandBottom: 161.6, heading: 12.3, headingDy: 17.5, intro: 8.5, introDy: 13.7, introPitch: 11.1
  }
}

// ---------- primitives ----------
export function font(doc, style, size, color) {
  doc.setFont('helvetica', style)
  doc.setFontSize(size)
  if (color) doc.setTextColor(...hexToRgb(color))
}

export function fillRect(doc, x, y, w, h, color) {
  doc.setFillColor(...hexToRgb(color))
  doc.rect(x, y, w, h, 'F')
}

export function hline(doc, x1, x2, y, color, width = 0.4) {
  doc.setDrawColor(...hexToRgb(color))
  doc.setLineWidth(width)
  doc.line(x1, y, x2, y)
}

export function vline(doc, x, y1, y2, color, width) {
  doc.setDrawColor(...hexToRgb(color))
  doc.setLineWidth(width)
  doc.line(x, y1, x, y2)
}

// Viewers don't kern Tj text, but jsPDF's getTextWidth does — measure without kerning so alignment is exact.
const NO_KERNING = { kerning: {} }
export function textWidth(doc, s, cs = 0) {
  if (!s) return 0
  const str = String(s)
  return doc.getStringUnitWidth(str, NO_KERNING) * doc.getFontSize() + cs * Math.max(0, str.length - 1)
}

// align: 'left' | 'right' | 'center' (x is the anchor). Alignment is done here so charSpace is accounted for.
export function put(doc, s, x, y, { align = 'left', cs = 0 } = {}) {
  if (isBlank(s)) return 0
  const w = textWidth(doc, s, cs)
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
  doc.text(String(s), x0, y, cs ? { charSpace: cs } : undefined)
  return w
}

export function wrap(doc, text, width) {
  if (isBlank(text)) return []
  const out = []
  for (const para of String(text).split('\n')) {
    let cur = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = cur ? cur + ' ' + word : word
      if (!cur || textWidth(doc, cand) <= width) cur = cand
      else { out.push(cur); cur = word }
    }
    out.push(cur)
  }
  return out
}

// Wrap preferring breaks after commas (addresses, outlet lists), falling back to word wrap.
export function wrapAtCommas(doc, text, width) {
  if (isBlank(text)) return []
  const chunks = String(text).split(/(?<=,)\s+/)
  const lines = []
  let cur = ''
  for (const chunk of chunks) {
    const cand = cur ? cur + ' ' + chunk : chunk
    if (textWidth(doc, cand) <= width) { cur = cand; continue }
    if (cur) lines.push(cur)
    if (textWidth(doc, chunk) <= width) cur = chunk
    else {
      const parts = wrap(doc, chunk, width)
      lines.push(...parts.slice(0, -1))
      cur = parts[parts.length - 1]
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// Draw runs of [text, bold] on one baseline.
export function putSegments(doc, segments, x, y, size, color) {
  let cx = x
  for (const [t, bold] of segments) {
    font(doc, bold ? 'bold' : 'normal', size, color)
    doc.text(t, cx, y)
    cx += textWidth(doc, t)
  }
  return cx - x
}

// ---------- letterhead pieces ----------
export function drawFirstHeader(doc, vm) {
  fillRect(doc, 0, 0, PAGE.w, 73.7, C.navy)
  fillRect(doc, 0, 73.7, PAGE.w, 3.4, C.red)
  const lw = 167.3
  doc.addImage(LOGO_PNG, 'PNG', 39.9, 19.1, lw, lw / LOGO_ASPECT, 'weddz-logo', 'FAST')
  font(doc, 'bold', 19.9, C.white)
  put(doc, vm.docTitle, 553, 36.0, { align: 'right', cs: 5.2 })
  font(doc, 'normal', 8, C.muted)
  put(doc, vm.docNo, 555, 51.4, { align: 'right', cs: 1.1 })
}

export function drawContHeader(doc, vm) {
  fillRect(doc, 0, 0, PAGE.w, 36.8, C.navy)
  fillRect(doc, 0, 36.8, PAGE.w, 2.3, C.red)
  const lw = 93.7
  doc.addImage(LOGO_PNG, 'PNG', 39.9, 8.5, lw, lw / LOGO_ASPECT, 'weddz-logo', 'FAST')
  font(doc, 'normal', 8.5, C.muted)
  const tail = `${vm.docNo} · continued`
  const tw = put(doc, tail, 555.4, 21.4, { align: 'right' })
  font(doc, 'bold', 8.5, C.white)
  put(doc, vm.docTitle, 555.4 - tw - 7, 21.4, { align: 'right', cs: 1.6 })
}

const COLS = [
  { x: 39.9, w: 180 },
  { x: 232.6, w: 150 },
  { x: 397.0, w: 140 }
]

// Draws the FROM / client / details band. Returns the band bottom y.
export function drawInfoBand(doc, vm, s) {
  const info = vm.info || {}
  const columns = [
    [{ heading: info.fromHeading || 'FROM', strong: COMPANY.name, lines: COMPANY.lines, noWrap: true }],
    info.col2 || [],
    info.col3 || []
  ]
  // Measure first so the band can grow if a column is unusually long.
  const ops = []
  let maxY = 0
  columns.forEach((sections, ci) => {
    const { x, w } = COLS[ci]
    let y = 77.1 + s.headDy
    let first = true
    for (const sec of sections) {
      const rows = (sec.rows || []).filter(r => !isBlank(r[1]))
      font(doc, 'normal', s.info)
      const lines = (sec.lines || []).filter(l => !isBlank(l)).flatMap(l => sec.noWrap ? [l] : wrapAtCommas(doc, l, w))
      if (isBlank(sec.strong) && !rows.length && !lines.length) continue
      if (!first) y += s.subHeadGap
      if (!isBlank(sec.heading)) {
        ops.push(['head', sec.heading, x, y])
        y += first ? s.firstTextDy : s.subTextDy
      }
      first = false
      let wrote = false
      if (!isBlank(sec.strong)) { ops.push(['strong', sec.strong, x, y]); y += s.infoPitch; wrote = true }
      for (const l of lines) { ops.push(['line', l, x, y]); y += s.infoPitch; wrote = true }
      for (const r of rows) { ops.push(['row', r, x, y]); y += s.infoPitch; wrote = true }
      if (wrote) y -= s.infoPitch
      maxY = Math.max(maxY, y)
    }
  })
  const bottom = Math.max(s.bandBottom, maxY + 4)
  fillRect(doc, 0, 77.1, PAGE.w, bottom - 77.1, C.band)
  for (const [kind, v, x, y] of ops) {
    if (kind === 'head') {
      if (isBlank(v)) continue
      font(doc, 'bold', s.infoHead, C.blue)
      put(doc, v, x, y, { cs: 1.35 })
    } else if (kind === 'strong') {
      font(doc, 'bold', s.info, C.text)
      put(doc, v, x, y)
    } else if (kind === 'line') {
      font(doc, 'normal', s.info, C.text)
      put(doc, v, x, y)
    } else {
      const [label, value, bold] = v
      font(doc, 'normal', s.info, C.text)
      const lw = put(doc, label, x, y)
      font(doc, bold ? 'bold' : 'normal', s.info, C.text)
      put(doc, String(value), x + lw + textWidth(doc, ' ') * 1.25, y)
    }
  }
  return bottom
}

export function drawFooter(doc, vm, pageNo, pageCount) {
  fillRect(doc, 0, PAGE.footerTop, PAGE.w, PAGE.h - PAGE.footerTop, C.navy)
  const cx = PAGE.w / 2
  const thanks = vm.footerThanks || 'Thank you for your business!'
  if (vm.kind === 'invoice') {
    font(doc, 'bold', 9, C.white)
    put(doc, thanks, cx, 813.8, { align: 'center' })
    font(doc, 'normal', 7.6, C.footer)
    put(doc, FOOTER_ONE_LINE, cx, 826.7, { align: 'center' })
    put(doc, `Page ${pageNo} of ${pageCount}`, 555.4, 819.7, { align: 'right' })
  } else {
    font(doc, 'bold', 8.5, C.white)
    put(doc, thanks, cx, 808.2, { align: 'center' })
    font(doc, 'normal', 7.6, C.footer)
    put(doc, FOOTER_CONTACT, cx, 821.3, { align: 'center' })
    put(doc, FOOTER_ADDRESS, cx, 832.0, { align: 'center' })
    if (pageCount > 1) put(doc, `Page ${pageNo} of ${pageCount}`, 555.4, 821.3, { align: 'right' })
  }
}
