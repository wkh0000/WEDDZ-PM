import { supabase } from '@/lib/supabase'

export async function dashboardSummary() {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [
    { count: customersCount },
    { count: activeProjectsCount },
    { data: unpaidRows },
    { data: monthlyExpenseRows },
  ] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('invoices').select('total,status').in('status', ['sent', 'overdue']),
    supabase.from('expenses').select('amount').gte('expense_date', monthStart)
  ])

  const unpaidTotal = (unpaidRows ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0)
  const unpaidCount = (unpaidRows ?? []).length
  const monthlyExpenses = (monthlyExpenseRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return {
    customers: customersCount ?? 0,
    activeProjects: activeProjectsCount ?? 0,
    unpaidTotal,
    unpaidCount,
    monthlyExpenses
  }
}

export async function recentProjects(limit = 5) {
  const { data, error } = await supabase
    .from('projects')
    .select('id,name,status,budget,start_date,end_date,updated_at,customer:customers(id,name,company)')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function upcomingInvoices(days = 14) {
  const today = new Date().toISOString().slice(0, 10)
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('invoices')
    .select('id,invoice_no,status,total,due_date,customer:customers(id,name,company)')
    .in('status', ['sent', 'overdue', 'draft'])
    .not('due_date', 'is', null)
    .gte('due_date', today)
    .lte('due_date', future)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}
