import { supabase } from '@/lib/supabase'

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

export async function createCustomer(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(id, updates) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
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
    .select('id, name, status, budget, start_date, end_date, created_at')
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
