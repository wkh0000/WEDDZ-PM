import { buildDeliveryNoteVM, buildInvoiceVM, buildReceiptVM } from './lib/viewModel'
import { replacementChain } from './lib/stock'
import * as api from './api'

export async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Build the PDF view model for a stored document. ctx = { clients, locations }. */
export async function buildDocumentVM(doc, { clients, locations }) {
  const client = clients.find(c => c.id === doc.client_id)
  if (!client) throw new Error('Client not found for this document')
  if (doc.type === 'DELIVERY_NOTE') {
    const site = locations.find(l => l.id === doc.site_ids?.[0])
    if (!site) throw new Error('Delivery site not found')
    return buildDeliveryNoteVM({ doc, client, site })
  }
  if (doc.type === 'INVOICE') {
    const replaced = await api.getDocuments(doc.replaces_ids ?? [])
    const replacedNos = replaced.sort((a, b) => a.seq - b.seq).map(d => d.doc_no)
    return buildInvoiceVM({ doc, client, replacedNos })
  }
  if (doc.type === 'RECEIPT') {
    const invoice = await api.getDocument(doc.meta.against_invoice_id)
    const invoices = await api.listDocuments({ clientId: doc.client_id, type: 'INVOICE' })
    const chain = [...replacementChain(invoice.id, invoices)]
    const payments = (await api.listPayments({ invoiceIds: chain }))
      .map(p => ({ ...p, receipt_no: p.receipt?.doc_no, receipt_seq: p.receipt?.seq ?? 0 }))
    const payment = payments.find(p => p.receipt_id === doc.id)
    if (!payment) throw new Error('Payment for this receipt not found')
    return buildReceiptVM({ receipt: doc, payment, invoice, client, payments })
  }
  throw new Error(`No PDF layout for ${doc.type.toLowerCase().replace('_', ' ')}s yet`)
}

export async function renderVM(vm) {
  const { renderPdf } = await import('./pdf/render.js')
  return renderPdf(vm)
}

export function saveBytes(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Render the document from current data and store it as a new version —
 * unless it's byte-identical to the latest stored version.
 */
export async function regenerateDocument(doc, ctx) {
  const fresh = await api.getDocument(doc.id)
  const vm = await buildDocumentVM(fresh, ctx)
  const bytes = await renderVM(vm)
  const sha = await sha256Hex(bytes)
  // Compare against every stored version, not just the latest — an attached
  // original or signed copy shouldn't make regenerating look like a change.
  if (fresh.pdf_sha256 === sha || (fresh.pdf_path && (await api.listDocumentVersions(fresh.id)).some(v => v.sha256 === sha))) {
    return { doc: fresh, bytes, changed: false }
  }
  const updated = await api.uploadPdfVersion(fresh, bytes, sha)
  return { doc: updated, bytes, changed: true }
}

/** Store an uploaded PDF (the issued original, or a signed/scanned copy) as the latest version. */
export async function attachOriginal(doc, file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('That file is not a PDF')
  const sha = await sha256Hex(bytes)
  const fresh = await api.getDocument(doc.id)
  if (fresh.pdf_path && (await api.listDocumentVersions(fresh.id)).some(v => v.sha256 === sha)) {
    throw new Error('This exact PDF is already stored')
  }
  return api.uploadPdfVersion(fresh, bytes, sha, 'original')
}

/** Download the latest stored PDF, generating + storing one first if none exists. */
export async function downloadDocument(doc, ctx) {
  if (doc.pdf_path) {
    const url = await api.signedPdfUrl(doc.pdf_path, `${doc.doc_no}.pdf`)
    window.open(url, '_blank', 'noopener')
    return doc
  }
  const { doc: updated, bytes } = await regenerateDocument(doc, ctx)
  saveBytes(bytes, `${doc.doc_no}.pdf`)
  return updated
}

export async function downloadVersion(version, docNo) {
  const url = await api.signedPdfUrl(version.pdf_path, `${docNo}-v${version.version}.pdf`)
  window.open(url, '_blank', 'noopener')
}
