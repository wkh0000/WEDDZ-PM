import { supabase } from '@/lib/supabase'
import { generateUniqueSlug } from '@/lib/slug'

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract',  label: 'Contract' },
  { value: 'intern',    label: 'Intern' }
]

// ---------- Employees ----------
export async function listEmployees(options = {}) {
  let q = supabase.from('employees').select('*').order('created_at', { ascending: false })
  if (options.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getEmployee(id) {
  const { data, error } = await supabase.from('employees').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

/**
 * Lookup by slug (e.g. 'kasun-wachindra'). Used by the employee detail
 * page when reading the slug from the URL. Returns `null` if no row
 * matches — `.maybeSingle()` (not `.single()`) so PostgREST returns
 * null instead of 406 on zero rows.
 */
export async function getEmployeeBySlug(slug) {
  const { data, error } = await supabase.from('employees').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return data
}

export async function createEmployee(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const slug = await generateUniqueSlug('employees', payload.full_name)
  const { data, error } = await supabase
    .from('employees').insert({ ...payload, slug, created_by: user?.id }).select().single()
  if (error) throw error
  return data
}

export async function updateEmployee(id, updates) {
  let next = updates
  if (typeof updates.full_name === 'string' && updates.full_name.trim()) {
    const slug = await generateUniqueSlug('employees', updates.full_name, { excludeId: id })
    next = { ...updates, slug }
  }
  const { data, error } = await supabase
    .from('employees').update(next).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteEmployee(id) {
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) throw error
}

// ---------- Salaries ----------
export async function listSalaries({ year, month, employeeId } = {}) {
  let q = supabase
    .from('salaries')
    .select('*, employee:employees(id,full_name,role,base_salary,active)')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
  if (year)        q = q.eq('period_year', year)
  if (month)       q = q.eq('period_month', month)
  if (employeeId)  q = q.eq('employee_id', employeeId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function listEmployeeSalaries(employeeId) {
  const { data, error } = await supabase
    .from('salaries').select('*')
    .eq('employee_id', employeeId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
  if (error) throw error
  return data
}

export async function createSalary(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const net = Number(payload.amount ?? 0) + Number(payload.bonus ?? 0) - Number(payload.deductions ?? 0)
  const { data, error } = await supabase
    .from('salaries')
    .insert({ ...payload, net_amount: net, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSalary(id, updates) {
  const next = { ...updates }
  if ('amount' in next || 'bonus' in next || 'deductions' in next) {
    const { data: row } = await supabase.from('salaries').select('amount,bonus,deductions').eq('id', id).single()
    const a = next.amount ?? row.amount, b = next.bonus ?? row.bonus, d = next.deductions ?? row.deductions
    next.net_amount = Number(a ?? 0) + Number(b ?? 0) - Number(d ?? 0)
  }
  const { data, error } = await supabase
    .from('salaries').update(next).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteSalary(id) {
  const { error } = await supabase.from('salaries').delete().eq('id', id)
  if (error) throw error
}

export async function paySalary(id) {
  const { error } = await supabase.rpc('pay_salary', { p_salary_id: id })
  if (error) throw error
}

export async function unpaySalary(id) {
  const { error } = await supabase.rpc('unpay_salary', { p_salary_id: id })
  if (error) throw error
}

// ---------- Salary advances ----------
//
// Advances are money paid to an employee before payday. Giving one logs
// a `Salary` expense immediately (cash out now); when that employee's
// salary is next paid, outstanding advances are auto-settled into the
// salary's deductions by the pay_salary RPC. See migration 010.

/** List advances, newest first. Optional filters: { employeeId, status }. */
export async function listAdvances({ employeeId, status } = {}) {
  let q = supabase
    .from('salary_advances')
    .select('*, employee:employees(id,full_name,role,active)')
    .order('advance_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (employeeId) q = q.eq('employee_id', employeeId)
  if (status)     q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data
}

/** Record an advance. Creates the linked cash-out expense server-side. */
export async function giveAdvance({ employee_id, amount, advance_date, notes }) {
  const { data, error } = await supabase.rpc('give_salary_advance', {
    p_employee_id: employee_id,
    p_amount: Number(amount),
    p_advance_date: advance_date || null,
    p_notes: notes ?? null
  })
  if (error) throw error
  return data // new advance id
}

/** Cancel an outstanding advance — reverses its expense. Fails if settled. */
export async function cancelAdvance(id) {
  const { error } = await supabase.rpc('cancel_salary_advance', { p_advance_id: id })
  if (error) throw error
}

/** { [employee_id]: totalOutstanding } — used to show per-row "will be deducted" hints. */
export async function outstandingAdvanceTotals() {
  const { data, error } = await supabase
    .from('salary_advances')
    .select('employee_id, amount')
    .eq('status', 'outstanding')
  if (error) throw error
  const map = {}
  for (const r of data ?? []) map[r.employee_id] = (map[r.employee_id] ?? 0) + Number(r.amount ?? 0)
  return map
}

/**
 * Generate "pending" salary rows for every active employee for the given period
 * who doesn't already have one. Returns the created rows.
 */
export async function generateMonthlySalaries(year, month) {
  const { data: { user } } = await supabase.auth.getUser()
  const employees = await listEmployees({ activeOnly: true })
  const existing  = await listSalaries({ year, month })
  const existingEmpIds = new Set(existing.map(s => s.employee_id))
  const toInsert = employees
    .filter(e => !existingEmpIds.has(e.id))
    .map(e => ({
      employee_id: e.id,
      period_year: year,
      period_month: month,
      amount: e.base_salary ?? 0,
      bonus: 0,
      deductions: 0,
      net_amount: e.base_salary ?? 0,
      status: 'pending',
      created_by: user?.id
    }))
  if (toInsert.length === 0) return []
  const { data, error } = await supabase.from('salaries').insert(toInsert).select()
  if (error) throw error
  return data
}

// ---------- Photo upload ----------
export async function uploadEmployeePhoto(employeeId, file) {
  const ext = file.name.split('.').pop()
  const path = `employees/${employeeId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('employee-photos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('employee-photos').getPublicUrl(path)
  return data.publicUrl
}
