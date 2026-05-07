import { supabase } from '@/lib/supabase'
import { generateUniqueSlug } from '@/lib/slug'

export async function listCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getCustomer(id) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Lookup by slug (e.g. 'mr-saniru'). Used by the customer detail page
 * when reading the slug from the URL. Returns `null` if no row matches —
 * `.maybeSingle()` (not `.single()`) so PostgREST returns null instead
 * of 406 on zero rows.
 */
export async function getCustomerBySlug(slug) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createCustomer(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const slug = await generateUniqueSlug('customers', payload.name)
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...payload, slug, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(id, updates) {
  let next = updates
  if (typeof updates.name === 'string' && updates.name.trim()) {
    const slug = await generateUniqueSlug('customers', updates.name, { excludeId: id })
    next = { ...updates, slug }
  }
  const { data, error } = await supabase
    .from('customers')
    .update(next)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from('customers').delete().eq('id', id)
  if (error) throw error
}

export async function listCustomerProjects(customerId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, slug, name, status, budget, start_date, end_date, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listCustomerInvoices(customerId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, status, total, issue_date, due_date, paid_at')
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false })
  if (error) throw error
  return data
}
