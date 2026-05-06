import { supabase } from '@/lib/supabase'

export const EXPENSE_CATEGORIES = [
  'Software', 'Hardware', 'Travel', 'Subcontractor', 'Marketing', 'Salary', 'Other'
]

export async function listExpenses(options = {}) {
  let q = supabase
    .from('expenses')
    .select('id, description, amount, category, expense_date, project_id, salary_id, receipt_url, notes, created_at, project:projects(id,name)')
    .order('expense_date', { ascending: false })
  if (options.category) q = q.eq('category', options.category)
  if (options.from) q = q.gte('expense_date', options.from)
  if (options.to)   q = q.lte('expense_date', options.to)
  if (options.projectScope === 'general') q = q.is('project_id', null)
  if (options.projectScope === 'project') q = q.not('project_id', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getExpense(id) {
  const { data, error } = await supabase
    .from('expenses').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createExpense(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExpense(id, updates) {
  const { data, error } = await supabase
    .from('expenses').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

/** Aggregate summaries for a month: total + per-category breakdown */
export async function monthlySummary(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const { data, error } = await supabase
    .from('expenses')
    .select('amount, category')
    .gte('expense_date', from)
    .lt('expense_date', next)
  if (error) throw error
  const total = data.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const byCategory = {}
  for (const r of data) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + Number(r.amount ?? 0)
  }
  return { total, byCategory, count: data.length }
}

/** Upload a receipt file to invoice-receipts bucket. Returns the storage path. */
export async function uploadReceipt(expenseId, file) {
  const ext = file.name.split('.').pop()
  const path = `expenses/${expenseId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('invoice-receipts')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage
    .from('invoice-receipts')
    .createSignedUrl(path, 60 * 60) // 1 hour
  if (error) throw error
  return data.signedUrl
}
