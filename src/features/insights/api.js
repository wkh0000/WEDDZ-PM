import { supabase } from '@/lib/supabase'

function ymKey(year, month) { return `${year}-${String(month).padStart(2, '0')}` }
function startOfMonth(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01` }

/**
 * Returns last N months of revenue (paid invoice totals by paid_at month) vs
 * expenses (expense_date month).
 */
export async function monthlyRevenueExpenses(months = 12) {
  const fromDate = new Date()
  fromDate.setMonth(fromDate.getMonth() - (months - 1))
  fromDate.setDate(1)
  const fromKey = startOfMonth(fromDate)

  const [{ data: invs, error: e1 }, { data: exps, error: e2 }] = await Promise.all([
    supabase.from('invoices')
      .select('total, paid_at')
      .eq('status', 'paid')
      .gte('paid_at', fromKey),
    supabase.from('expenses')
      .select('amount, expense_date')
      .gte('expense_date', fromKey)
  ])
  if (e1) throw e1; if (e2) throw e2

  const byMonth = {}
  for (let i = 0; i < months; i++) {
    const d = new Date(fromDate)
    d.setMonth(d.getMonth() + i)
    const key = ymKey(d.getFullYear(), d.getMonth() + 1)
    byMonth[key] = { month: key, label: d.toLocaleString('en', { month: 'short' }), revenue: 0, expenses: 0 }
  }
  for (const r of invs ?? []) {
    if (!r.paid_at) continue
    const d = new Date(r.paid_at)
    const key = ymKey(d.getFullYear(), d.getMonth() + 1)
    if (byMonth[key]) byMonth[key].revenue += Number(r.total ?? 0)
  }
  for (const r of exps ?? []) {
    const d = new Date(r.expense_date)
    const key = ymKey(d.getFullYear(), d.getMonth() + 1)
    if (byMonth[key]) byMonth[key].expenses += Number(r.amount ?? 0)
  }
  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
}

/** All projects with revenue + expenses + net */
export async function projectProfitability() {
  const [{ data: projects, error: e1 }, { data: invoices, error: e2 }, { data: expenses, error: e3 }] = await Promise.all([
    supabase.from('projects').select('id, slug, name, status, budget, customer:customers(slug,name,company)'),
    supabase.from('invoices').select('project_id, total, status'),
    supabase.from('expenses').select('project_id, amount')
  ])
  if (e1) throw e1; if (e2) throw e2; if (e3) throw e3

  const revByProj = {}
  for (const i of invoices ?? []) {
    if (!i.project_id || i.status !== 'paid') continue
    revByProj[i.project_id] = (revByProj[i.project_id] ?? 0) + Number(i.total ?? 0)
  }
  const expByProj = {}
  for (const e of expenses ?? []) {
    if (!e.project_id) continue
    expByProj[e.project_id] = (expByProj[e.project_id] ?? 0) + Number(e.amount ?? 0)
  }
  return (projects ?? []).map(p => {
    const revenue = revByProj[p.id] ?? 0
    const expensesTotal = expByProj[p.id] ?? 0
    return {
      ...p,
      revenue, expenses: expensesTotal, net: revenue - expensesTotal,
      customerName: p.customer?.company || p.customer?.name || 'Internal'
    }
  }).sort((a, b) => b.net - a.net)
}

/** Top customers by revenue */
export async function topCustomers(limit = 5) {
  const { data, error } = await supabase
    .from('invoices')
    .select('total, customer:customers(id,name,company)')
    .eq('status', 'paid')
  if (error) throw error
  const byCustomer = {}
  for (const r of data ?? []) {
    const id = r.customer?.id; if (!id) continue
    const k = byCustomer[id] ??= {
      id, name: r.customer.company || r.customer.name, total: 0, count: 0
    }
    k.total += Number(r.total ?? 0)
    k.count += 1
  }
  return Object.values(byCustomer).sort((a, b) => b.total - a.total).slice(0, limit)
}

/** Running balance (revenue - expenses) by month for last N months */
export async function cashFlow(months = 12) {
  const series = await monthlyRevenueExpenses(months)
  let running = 0
  return series.map(s => {
    running += s.revenue - s.expenses
    return { ...s, balance: running }
  })
}

/**
 * Full cash ledger from the very first record — every cash movement as a
 * single chronological list with a running balance. Cash basis:
 *   • IN  = paid invoices, dated by paid_at
 *   • OUT = expenses, dated by expense_date (covers salaries, advances,
 *           rent, software, everything in the expenses table)
 *
 * Returns { entries, totalIn, totalOut, balance } where entries are
 * NEWEST-FIRST and each carries `balance` = the running balance *after*
 * that transaction (bank-statement style: the top row's balance is the
 * current balance).
 */
export async function cashflowLedger() {
  const [{ data: invs, error: e1 }, { data: exps, error: e2 }] = await Promise.all([
    supabase.from('invoices')
      .select('id, invoice_no, total, paid_at, issue_date, customer:customers(name,company)')
      .eq('status', 'paid'),
    supabase.from('expenses')
      .select('id, description, category, amount, expense_date')
  ])
  if (e1) throw e1; if (e2) throw e2

  const entries = []
  for (const i of invs ?? []) {
    // Fall back to issue_date if paid_at is null — older paid invoices
    // created before the createInvoice paid_at normalization can still
    // be missing the timestamp. Cash-basis date is just "when this
    // counted as paid", and issue_date is the best signal we have.
    const dateIso = i.paid_at || (i.issue_date ? `${i.issue_date}T00:00:00Z` : null)
    if (!dateIso) continue
    entries.push({
      id: `inv-${i.id}`,
      date: dateIso.slice(0, 10),
      ts: new Date(dateIso).getTime(),
      direction: 'in',
      label: `${i.invoice_no} · ${i.customer?.company || i.customer?.name || 'Customer'}`,
      category: 'Invoice',
      amount: Number(i.total ?? 0)
    })
  }
  for (const e of exps ?? []) {
    entries.push({
      id: `exp-${e.id}`,
      date: e.expense_date,
      ts: new Date(e.expense_date).getTime(),
      direction: 'out',
      label: e.description,
      category: e.category,
      amount: Number(e.amount ?? 0)
    })
  }

  // Chronological (oldest → newest) to accumulate the running balance.
  // Tie-break: same-day inflows before outflows, then by id for stability.
  entries.sort((a, b) =>
    a.ts - b.ts ||
    (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1) ||
    a.id.localeCompare(b.id)
  )
  let running = 0
  for (const en of entries) {
    running += en.direction === 'in' ? en.amount : -en.amount
    en.balance = running
  }

  const totalIn  = entries.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0)
  const totalOut = entries.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0)

  // Present newest-first; each row keeps its point-in-time balance.
  entries.reverse()
  return { entries, totalIn, totalOut, balance: totalIn - totalOut }
}
