import { supabase } from '@/lib/supabase'

export async function listInvoices(options = {}) {
  let q = supabase
    .from('invoices')
    .select('id, invoice_no, status, total, issue_date, due_date, paid_at, customer:customers(id,slug,name,company), project:projects(id,slug,name)')
    .order('created_at', { ascending: false })
  if (options.status) q = q.eq('status', options.status)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(id,slug,name,company,email,phone,address), project:projects(id,slug,name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Lookup by invoice_no (e.g. 'INV-LMS-ADV-001'). Invoice numbers are
 * already URL-safe and unique, so they double as the slug for routes.
 */
export async function getInvoiceByNumber(invoiceNo) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(id,slug,name,company,email,phone,address), project:projects(id,slug,name)')
    .eq('invoice_no', invoiceNo)
    .single()
  if (error) throw error
  return data
}

export async function listInvoiceItems(invoiceId) {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export async function nextInvoiceNumber() {
  const { data, error } = await supabase.rpc('next_invoice_number')
  if (error) throw error
  return data
}

/**
 * Keep `paid_at` consistent with `status` on every write — the form
 * doesn't set paid_at itself, so without this an invoice created with
 * status='paid' would have paid_at=null and silently disappear from
 * the cashflow ledger (which keys cash-in off paid_at). When status is
 * paid we stamp now() if it's missing, and clear it when status moves
 * away from paid.
 */
function normalizePaidAt(invoice, existing = {}) {
  const out = { ...invoice }
  if ('status' in out) {
    if (out.status === 'paid') {
      if (!out.paid_at && !existing.paid_at) out.paid_at = new Date().toISOString()
    } else {
      out.paid_at = null
    }
  }
  return out
}

export async function createInvoice({ invoice, items }) {
  const { data: { user } } = await supabase.auth.getUser()
  const payload = normalizePaidAt(invoice)
  const { data: created, error } = await supabase
    .from('invoices')
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  if (items?.length) {
    const rows = items.map((it, i) => ({
      invoice_id: created.id,
      description: it.description,
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? 0),
      amount: Number(it.amount ?? 0),
      position: i
    }))
    const { error: itemsErr } = await supabase.from('invoice_items').insert(rows)
    if (itemsErr) throw itemsErr
  }
  return created
}

export async function updateInvoice({ id, invoice, items }) {
  // Pull existing paid_at so we don't overwrite a real timestamp when
  // editing an already-paid invoice.
  const { data: existing } = await supabase
    .from('invoices').select('paid_at,status').eq('id', id).maybeSingle()
  const payload = normalizePaidAt(invoice, existing ?? {})
  const { data: updated, error } = await supabase
    .from('invoices')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  if (items) {
    // simple replace: delete all then insert
    await supabase.from('invoice_items').delete().eq('invoice_id', id)
    if (items.length) {
      const rows = items.map((it, i) => ({
        invoice_id: id,
        description: it.description,
        quantity: Number(it.quantity ?? 1),
        unit_price: Number(it.unit_price ?? 0),
        amount: Number(it.amount ?? 0),
        position: i
      }))
      const { error: itemsErr } = await supabase.from('invoice_items').insert(rows)
      if (itemsErr) throw itemsErr
    }
  }
  return updated
}

export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
}

export async function markInvoicePaid(id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setInvoiceStatus(id, status) {
  const updates = { status }
  if (status === 'paid') updates.paid_at = new Date().toISOString()
  if (status !== 'paid') updates.paid_at = null
  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
