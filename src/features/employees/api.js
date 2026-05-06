import { supabase } from '@/lib/supabase'

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

export async function createEmployee(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('employees').insert({ ...payload, created_by: user?.id }).select().single()
  if (error) throw error
  return data
}

export async function updateEmployee(id, updates) {
  const { data, error } = await supabase
    .from('employees').update(updates).eq('id', id).select().single()
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
