// src/lib/exportPdf.js
//
// One-click PDF export for list pages. jsPDF + autotable are ~400 KB, so
// they're dynamically imported on first use — they never touch the main
// bundle. Produces a light, branded, paginated table with an optional
// summary block.

const APP_NAME = import.meta.env.VITE_APP_NAME || 'WEDDZ PM'

/**
 * @param {Object} opts
 * @param {string}  opts.title                          e.g. "Cashflow"
 * @param {string} [opts.subtitle]                      small line under the title
 * @param {Array<{header:string,dataKey:string,align?:'left'|'right'|'center'}>} opts.columns
 * @param {Array<Object>} opts.rows                     row objects keyed by column dataKey
 * @param {Array<{label:string,value:string}>} [opts.summary]   right-aligned totals block
 * @param {string}  [opts.filename]
 * @param {'portrait'|'landscape'} [opts.orientation]   default 'portrait'
 */
export async function downloadTablePdf({
  title, subtitle, columns, rows, summary = [], filename, orientation = 'portrait'
}) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ])
  const autoTable = autoTableMod.default

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const now = new Date()

  // ----- Header band -----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(24, 24, 27)
  doc.text(APP_NAME, margin, 46)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(130, 130, 140)
  doc.text('WEDDZ IT · Sri Lanka', margin, 60)
  doc.text(`Generated ${now.toLocaleString('en-GB')}`, pageW - margin, 46, { align: 'right' })

  // ----- Title -----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(24, 24, 27)
  doc.text(title, margin, 88)
  let tableStart = 102
  if (subtitle) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(110, 110, 120)
    doc.text(subtitle, margin, 103)
    tableStart = 118
  }

  // ----- Table -----
  autoTable(doc, {
    startY: tableStart,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => {
      const v = r[c.dataKey]
      return v == null ? '' : String(v)
    })),
    styles: { fontSize: 8.5, cellPadding: 5, textColor: [40, 40, 45], lineColor: [235, 235, 238], lineWidth: 0.5 },
    headStyles: { fillColor: [39, 39, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.align) acc[i] = { halign: c.align }
      return acc
    }, {}),
    margin: { left: margin, right: margin }
  })

  // ----- Summary block -----
  if (summary.length) {
    let y = (doc.lastAutoTable?.finalY ?? tableStart) + 22
    if (y > pageH - 60) { doc.addPage(); y = 60 }
    for (const s of summary) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 100)
      doc.text(String(s.label), pageW - margin - 180, y, { align: 'left' })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(24, 24, 27)
      doc.text(String(s.value), pageW - margin, y, { align: 'right' })
      y += 17
    }
  }

  // ----- Page numbers -----
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 170)
    doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 18, { align: 'center' })
  }

  const safe = (filename || title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  doc.save(`${safe}-${now.toISOString().slice(0, 10)}.pdf`)
}
