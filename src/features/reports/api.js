// src/features/reports/api.js
//
// Aggregation queries powering the /reports page. All lifetime scope
// (no date filters) — the page is the "since day one" view of the
// business. Each call is a small handful of SELECTs run in parallel.

import { supabase } from '@/lib/supabase'

/**
 * Headline lifetime totals for the summary tiles.
 * Cash-basis revenue = paid invoices' totals.
 */
export async function lifetimeTotals() {
  const [
    { data: invs, error: e1 },
    { data: exps, error: e2 },
    { data: sals, error: e3 },
    { data: advs, error: e4 },
    { count: customerC, error: e5 },
    { count: projectC, error: e6 },
    { count: employeeC, error: e7 },
    { count: activeEmployeeC, error: e8 }
  ] = await Promise.all([
    supabase.from('invoices').select('total, status'),
    supabase.from('expenses').select('amount'),
    supabase.from('salaries').select('net_amount, status'),
    supabase.from('salary_advances').select('amount, status'),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('employees').select('id', { count: 'exact', head: true }),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('active', true)
  ])
  for (const e of [e1, e2, e3, e4, e5, e6, e7, e8]) if (e) throw e

  const paidInvs = (invs ?? []).filter(i => i.status === 'paid')
  const revenue = paidInvs.reduce((s, r) => s + Number(r.total ?? 0), 0)
  const expenses = (exps ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const paidSals = (sals ?? []).filter(s => s.status === 'paid')
  const salariesPaid = paidSals.reduce((s, r) => s + Number(r.net_amount ?? 0), 0)
  const salariesPending = (sals ?? [])
    .filter(s => s.status === 'pending')
    .reduce((s, r) => s + Number(r.net_amount ?? 0), 0)
  const advancesOutstanding = (advs ?? [])
    .filter(a => a.status === 'outstanding')
    .reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return {
    revenue,
    expenses,
    netProfit: revenue - expenses,
    salariesPaid,
    salariesPending,
    advancesOutstanding,
    customers: customerC ?? 0,
    projects: projectC ?? 0,
    employees: employeeC ?? 0,
    activeEmployees: activeEmployeeC ?? 0,
    invoiceCount: invs?.length ?? 0,
    paidInvoiceCount: paidInvs.length,
    expenseCount: exps?.length ?? 0,
    salaryPaymentCount: paidSals.length
  }
}

/**
 * Per-employee lifetime salary rollup. Returns one row per employee
 * whether or not they've been paid (rows with monthsPaid=0 still
 * appear so newly-added employees are visible).
 */
export async function salaryReport() {
  const [
    { data: emps, error: e1 },
    { data: sals, error: e2 },
    { data: advs, error: e3 }
  ] = await Promise.all([
    supabase.from('employees').select('id, full_name, role, active, base_salary, joined_on'),
    supabase.from('salaries').select('employee_id, amount, bonus, deductions, net_amount, status, period_year, period_month, paid_on'),
    supabase.from('salary_advances').select('employee_id, amount, status')
  ])
  for (const e of [e1, e2, e3]) if (e) throw e

  const byEmp = new Map((emps ?? []).map(e => [e.id, {
    employee_id: e.id,
    full_name: e.full_name,
    role: e.role,
    active: e.active,
    base_salary: Number(e.base_salary ?? 0),
    joined_on: e.joined_on,
    monthsPaid: 0,
    monthsPending: 0,
    totalBase: 0,
    totalBonus: 0,
    totalDeductions: 0,
    totalNet: 0,
    outstandingAdvance: 0,
    settledAdvances: 0,
    lastPaidPeriod: null,
    lastPaidOn: null
  }]))

  for (const s of sals ?? []) {
    const e = byEmp.get(s.employee_id); if (!e) continue
    if (s.status === 'paid') {
      e.monthsPaid++
      e.totalBase += Number(s.amount ?? 0)
      e.totalBonus += Number(s.bonus ?? 0)
      e.totalDeductions += Number(s.deductions ?? 0)
      e.totalNet += Number(s.net_amount ?? 0)
      const periodOrd = s.period_year * 100 + s.period_month
      if (!e.lastPaidPeriod || periodOrd > e.lastPaidPeriod.ord) {
        e.lastPaidPeriod = { ord: periodOrd, year: s.period_year, month: s.period_month }
        e.lastPaidOn = s.paid_on
      }
    } else if (s.status === 'pending') {
      e.monthsPending++
    }
  }

  for (const a of advs ?? []) {
    const e = byEmp.get(a.employee_id); if (!e) continue
    if (a.status === 'outstanding') e.outstandingAdvance += Number(a.amount ?? 0)
    else if (a.status === 'settled') e.settledAdvances += Number(a.amount ?? 0)
  }

  const rows = Array.from(byEmp.values()).map(r => ({
    ...r,
    avgNet: r.monthsPaid > 0 ? +(r.totalNet / r.monthsPaid).toFixed(2) : 0
  }))
  rows.sort((a, b) => b.totalNet - a.totalNet)
  return rows
}

/**
 * Lifetime expense breakdown by category, with % of total + average
 * per entry. Sorted by total, descending.
 */
export async function expenseSpread() {
  const { data: exps, error } = await supabase
    .from('expenses').select('category, amount, expense_date')
  if (error) throw error

  const byCat = new Map()
  let total = 0
  for (const e of exps ?? []) {
    const cat = e.category ?? 'Other'
    const amt = Number(e.amount ?? 0)
    const b = byCat.get(cat) ?? { category: cat, count: 0, total: 0 }
    b.count++; b.total += amt
    byCat.set(cat, b)
    total += amt
  }
  const rows = Array.from(byCat.values())
    .map(b => ({
      ...b,
      pct: total > 0 ? +((b.total / total) * 100).toFixed(1) : 0,
      avg: b.count > 0 ? +(b.total / b.count).toFixed(2) : 0
    }))
    .sort((a, b) => b.total - a.total)
  return { rows, total, entryCount: exps?.length ?? 0 }
}

/**
 * Month-by-month revenue / expenses / salaries / net across all time.
 * Revenue is cash-basis (paid invoice dates); expenses use
 * expense_date; salaries use paid_on. Newest month first.
 */
export async function monthlyFinancialSummary() {
  const [
    { data: invs, error: e1 },
    { data: exps, error: e2 },
    { data: sals, error: e3 }
  ] = await Promise.all([
    supabase.from('invoices').select('total, paid_at, issue_date, status').eq('status', 'paid'),
    supabase.from('expenses').select('amount, expense_date'),
    supabase.from('salaries').select('net_amount, paid_on, status').eq('status', 'paid')
  ])
  for (const e of [e1, e2, e3]) if (e) throw e

  const byMonth = new Map()
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const bucket = (k) => {
    if (!byMonth.has(k)) byMonth.set(k, { month: k, revenue: 0, expenses: 0, salaries: 0 })
    return byMonth.get(k)
  }

  for (const i of invs ?? []) {
    const raw = i.paid_at || (i.issue_date ? `${i.issue_date}T00:00:00Z` : null)
    if (!raw) continue
    const d = new Date(raw); if (isNaN(d)) continue
    bucket(key(d)).revenue += Number(i.total ?? 0)
  }
  for (const e of exps ?? []) {
    if (!e.expense_date) continue
    const d = new Date(e.expense_date); if (isNaN(d)) continue
    bucket(key(d)).expenses += Number(e.amount ?? 0)
  }
  for (const s of sals ?? []) {
    if (!s.paid_on) continue
    const d = new Date(s.paid_on); if (isNaN(d)) continue
    bucket(key(d)).salaries += Number(s.net_amount ?? 0)
  }

  return Array.from(byMonth.values())
    .map(m => ({ ...m, net: m.revenue - m.expenses }))
    .sort((a, b) => b.month.localeCompare(a.month))
}
