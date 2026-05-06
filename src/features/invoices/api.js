import { supabase } from '@/lib/supabase'

export async function listInvoices(options = {}) {
  let q = supabase
    .from('invoices')
    .select('id, invoice_no, status, total, issue_date, due_date, paid_at, customer:customers(id,name,company), project:projects(id,name)')
    .order('created_at', { ascending: false })
  if (options.status) q = q.eq('status', options.status)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(id,name,company,email,phone,address), project:projects(id,name)')
    .eq('id', id)
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

export async function createInvoice({ invoice, items }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: created, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, created_by: user?.id })
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
  const { data: updated, error } = await supabase
    .from('invoices')
    .update(invoice)
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
