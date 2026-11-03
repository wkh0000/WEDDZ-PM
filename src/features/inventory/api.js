import { supabase } from '@/lib/supabase'

const BUCKET = 'inventory-documents'

function must({ data, error }) {
  if (error) throw error
  return data
}

// ---------- reference data ----------
export const listProducts = async () =>
  must(await supabase.from('inv_products').select('*').order('sort_order').order('name'))

export async function saveProduct(product) {
  const { id, ...rest } = product
  const q = id
    ? supabase.from('inv_products').update(rest).eq('id', id)
    : supabase.from('inv_products').insert(rest)
  return must(await q.select().single())
}

export const listLocations = async () =>
  must(await supabase.from('inv_locations').select('*').order('sort_order').order('name'))

export async function saveLocation(location) {
  const { id, ...rest } = location
  const q = id
    ? supabase.from('inv_locations').update(rest).eq('id', id)
    : supabase.from('inv_locations').insert(rest)
  return must(await q.select().single())
}

export const listClients = async () =>
  must(await supabase.from('inv_clients').select('*').order('contact_name'))

export async function saveClient(client) {
  const { id, ...rest } = client
  const q = id
    ? supabase.from('inv_clients').update(rest).eq('id', id)
    : supabase.from('inv_clients').insert(rest)
  return must(await q.select().single())
}

/** PM customers + projects for linking a client (staff only — RLS hides them from stock users). */
export async function listPmCustomersAndProjects() {
  const [c, p] = await Promise.all([
    supabase.from('customers').select('id, name, company').order('name'),
    supabase.from('projects').select('id, name, customer_id').order('name')
  ])
  return { customers: must(c), projects: must(p) }
}

// ---------- stock ----------
export const getStock = async () => must(await supabase.from('inv_stock').select('*'))

export async function listMovements({ productId, locationId, type, limit = 300 } = {}) {
  let q = supabase.from('inv_movements')
    .select('*, product:inv_products(id,name,sku,unit), from:inv_locations!inv_movements_from_location_id_fkey(id,name,kind), to:inv_locations!inv_movements_to_location_id_fkey(id,name,kind), document:inv_documents(id,doc_no,type)')
    .order('moved_on', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (productId) q = q.eq('product_id', productId)
  if (locationId) q = q.or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`)
  if (type) q = q.eq('type', type)
  return must(await q)
}

/** Insert ledger rows in one statement (atomic; the DB re-checks stock per row). */
export async function postMovements(rows) {
  if (!rows.length) return []
  return must(await supabase.from('inv_movements').insert(rows).select('id'))
}

export const listSerials = async (productId) =>
  must(await supabase.from('inv_serials').select('*').eq('product_id', productId).order('serial'))

export async function addSerials(productId, locationId, serials) {
  const rows = serials.map(serial => ({ product_id: productId, location_id: locationId, serial }))
  return must(await supabase.from('inv_serials').upsert(rows, { onConflict: 'product_id,serial' }).select())
}

export const listCountSheets = async () =>
  must(await supabase.from('inv_count_sheets').select('*').order('counted_on', { ascending: false }))

// ---------- deployments ----------
export const listDeployments = async () =>
  must(await supabase.from('inv_deployments').select('*').order('deploy_date', { ascending: false }).order('created_at', { ascending: false }))

export const getDeployment = async (id) =>
  must(await supabase.from('inv_deployments').select('*').eq('id', id).single())

export async function saveDeployment(dep) {
  const { id, ...rest } = dep
  const q = id
    ? supabase.from('inv_deployments').update(rest).eq('id', id)
    : supabase.from('inv_deployments').insert(rest)
  return must(await q.select().single())
}

export const listDeploymentMovements = async (deploymentId) =>
  must(await supabase.from('inv_movements').select('*').eq('deployment_id', deploymentId).order('created_at'))

/** Deliver to a site: one delivery note + ledger rows, atomically. Returns the document id. */
export async function deliver({ siteId, fromLocationId, date, lines, deploymentId = null, meta = {} }) {
  return must(await supabase.rpc('inv_deliver', {
    p_site_id: siteId, p_from_location_id: fromLocationId, p_date: date, p_lines: lines,
    p_deployment_id: deploymentId, p_meta: meta
  }))
}

// ---------- documents ----------
export async function listDocuments({ clientId, type, status } = {}) {
  let q = supabase.from('inv_documents')
    .select('id, client_id, type, doc_no, seq, doc_date, due_date, status, title, site_ids, total, software_total, hardware_total, replaces_ids, replaced_by_id, source_dn_ids, deployment_id, pdf_path, pdf_version, pdf_sha256, meta, created_at')
    .order('doc_date', { ascending: false }).order('seq', { ascending: false })
  if (clientId) q = q.eq('client_id', clientId)
  if (type) q = q.eq('type', type)
  if (status) q = q.eq('status', status)
  return must(await q)
}

export const getDocument = async (id) =>
  must(await supabase.from('inv_documents').select('*').eq('id', id).single())

export const getDocuments = async (ids) =>
  ids.length ? must(await supabase.from('inv_documents').select('*').in('id', ids)) : []

export const listDocumentVersions = async (documentId) =>
  must(await supabase.from('inv_document_versions').select('*').eq('document_id', documentId).order('version', { ascending: false }))

export async function createInvoice(input) {
  return must(await supabase.rpc('inv_create_invoice', {
    p_client_id: input.clientId, p_doc_date: input.docDate, p_due_date: input.dueDate || null,
    p_title: input.title, p_intro: input.intro || null, p_site_ids: input.siteIds, p_lines: input.lines,
    p_meta: input.meta ?? {}, p_replaces_ids: input.replacesIds ?? [], p_source_dn_ids: input.sourceDnIds ?? []
  }))
}

export async function recordPayment(input) {
  return must(await supabase.rpc('inv_record_payment', {
    p_invoice_id: input.invoiceId, p_paid_on: input.paidOn, p_amount: input.amount,
    p_method: input.method || null, p_cheque_no: input.chequeNo || null,
    p_software_amount: input.softwareAmount ?? null, p_hardware_amount: input.hardwareAmount ?? null,
    p_receipt_date: input.receiptDate || null, p_title: input.title || null, p_intro: input.intro || null,
    p_meta: input.meta ?? {}
  }))
}

export async function setChequeStatus(paymentId, status) {
  must(await supabase.rpc('inv_set_cheque_status', { p_payment_id: paymentId, p_status: status }))
}

export async function listPayments({ invoiceIds, clientId } = {}) {
  let q = supabase.from('inv_payments').select('*, receipt:inv_documents!inv_payments_receipt_id_fkey(id, doc_no, seq)').order('paid_on')
  if (invoiceIds) q = q.in('invoice_id', invoiceIds)
  if (clientId) q = q.eq('client_id', clientId)
  return must(await q)
}

// ---------- PDF storage ----------
export async function uploadPdfVersion(doc, bytes, sha256, source = 'generated') {
  const version = (doc.pdf_version ?? 0) + 1
  const path = `${doc.type}/${doc.doc_no}/v${version}.pdf`
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false })
  if (error) throw error
  must(await supabase.from('inv_document_versions').insert({ document_id: doc.id, version, pdf_path: path, sha256, source }))
  return must(await supabase.from('inv_documents')
    .update({ pdf_path: path, pdf_version: version, pdf_sha256: sha256 }).eq('id', doc.id).select().single())
}

export async function signedPdfUrl(path, downloadName) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(path, 60 * 10, downloadName ? { download: downloadName } : undefined)
  if (error) throw error
  return data.signedUrl
}
