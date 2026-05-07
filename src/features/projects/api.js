import { supabase } from '@/lib/supabase'

const DEFAULT_COLUMNS = [
  { name: 'To Do',       position: 0 },
  { name: 'In Progress', position: 1 },
  { name: 'In Review',   position: 2 },
  { name: 'Done',        position: 3 }
]

export async function listProjects(options = {}) {
  let q = supabase
    .from('projects')
    .select('id, name, status, budget, start_date, end_date, created_at, customer_id, customer:customers(id,name,company)')
    .order('created_at', { ascending: false })
  if (options.status) q = q.eq('status', options.status)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customer:customers(id,name,company,email)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createProject(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ ...payload, created_by: user?.id })
    .select()
    .single()
  if (error) throw error

  // Best-effort default columns. If this fails the project still exists;
  // the user can add columns manually from the board.
  try {
    await supabase
      .from('task_columns')
      .insert(DEFAULT_COLUMNS.map(c => ({ ...c, project_id: project.id, created_by: user?.id })))
  } catch (e) {
    console.warn('[projects] failed to seed default columns:', e?.message)
  }
  return project
}

export async function updateProject(id, updates) {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// Project updates (immutable timeline)
export async function listProjectUpdates(projectId) {
  const { data, error } = await supabase
    .from('project_updates')
    .select('id, body, created_at, created_by, author:profiles!project_updates_created_by_profile_fkey(id,full_name,avatar_url)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addProjectUpdate(projectId, body) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('project_updates')
    .insert({ project_id: projectId, body, created_by: user?.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listProjectInvoices(projectId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, status, total, issue_date, due_date, paid_at')
    .eq('project_id', projectId)
    .order('issue_date', { ascending: false })
  if (error) throw error
  return data
}

export async function listProjectExpenses(projectId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, description, category, amount, expense_date')
    .eq('project_id', projectId)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data
}
