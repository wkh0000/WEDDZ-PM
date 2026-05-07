import { supabase } from '@/lib/supabase'
import { generateUniqueSlug } from '@/lib/slug'

const DEFAULT_COLUMNS = [
  { name: 'To Do',       position: 0 },
  { name: 'In Progress', position: 1 },
  { name: 'In Review',   position: 2 },
  { name: 'Done',        position: 3 }
]

export async function listProjects(options = {}) {
  let q = supabase
    .from('projects')
    .select('id, slug, name, status, budget, start_date, end_date, created_at, customer_id, customer:customers(id,slug,name,company)')
    .order('created_at', { ascending: false })
  if (options.status) q = q.eq('status', options.status)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getProject(id) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customer:customers(id,slug,name,company,email)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Lookup by slug (e.g. 'onscene-event-web'). Used by the detail
 * page when reading the slug from the URL.
 */
export async function getProjectBySlug(slug) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, customer:customers(id,slug,name,company,email)')
    .eq('slug', slug)
    .single()
  if (error) throw error
  return data
}

export async function createProject(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const slug = await generateUniqueSlug('projects', payload.name)
  const { data: project, error } = await supabase
    .from('projects')
    .insert({ ...payload, slug, created_by: user?.id })
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
  // If the name changed, regenerate the slug to match.
  let next = updates
  if (typeof updates.name === 'string' && updates.name.trim()) {
    const slug = await generateUniqueSlug('projects', updates.name, { excludeId: id })
    next = { ...updates, slug }
  }
  const { data, error } = await supabase
    .from('projects')
    .update(next)
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

// ---------- Phases ---------------------------------------------------------

export const PHASE_STATUSES = [
  { value: 'not_started', label: 'Not started', tone: 'default' },
  { value: 'in_progress', label: 'In progress', tone: 'indigo' },
  { value: 'in_review',   label: 'In review',   tone: 'amber' },
  { value: 'completed',   label: 'Completed',   tone: 'emerald' },
  { value: 'on_hold',     label: 'On hold',     tone: 'zinc' },
  { value: 'cancelled',   label: 'Cancelled',   tone: 'rose' }
]

export async function listProjectPhases(projectId) {
  const { data, error } = await supabase
    .from('project_phases')
    .select('*, deliverables:phase_deliverables(id, body, done, position, verification)')
    .eq('project_id', projectId)
    .order('position')
  if (error) throw error
  return (data ?? []).map(p => ({
    ...p,
    deliverables: (p.deliverables ?? []).slice().sort((a, b) => a.position - b.position)
  }))
}

export async function createPhase({ projectId, name, description, status, start_date, end_date, amount, notes, position }) {
  const { data: { user } } = await supabase.auth.getUser()
  let pos = position
  if (pos == null) {
    const { count } = await supabase.from('project_phases').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
    pos = count ?? 0
  }
  const { data, error } = await supabase.from('project_phases').insert({
    project_id: projectId, position: pos, name,
    description: description ?? null,
    status: status ?? 'not_started',
    start_date: start_date ?? null,
    end_date: end_date ?? null,
    amount: amount == null || amount === '' ? null : Number(amount),
    notes: notes ?? null,
    created_by: user?.id
  }).select().single()
  if (error) throw error
  return data
}

export async function updatePhase(id, updates) {
  const { data, error } = await supabase
    .from('project_phases').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deletePhase(id) {
  const { error } = await supabase.from('project_phases').delete().eq('id', id)
  if (error) throw error
}

export async function reorderPhases(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('project_phases').update({ position: i }).eq('id', orderedIds[i])
    if (error) throw error
  }
}

export async function addDeliverable(phaseId, body, verification) {
  const { count } = await supabase.from('phase_deliverables').select('*', { count: 'exact', head: true }).eq('phase_id', phaseId)
  const { data, error } = await supabase.from('phase_deliverables').insert({
    phase_id: phaseId, body, verification: verification ?? null, position: count ?? 0
  }).select().single()
  if (error) throw error
  return data
}

export async function updateDeliverable(id, updates) {
  const { data, error } = await supabase
    .from('phase_deliverables').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteDeliverable(id) {
  const { error } = await supabase.from('phase_deliverables').delete().eq('id', id)
  if (error) throw error
}

// ---------- Documents -----------------------------------------------------

export const DOCUMENT_KINDS = [
  { value: 'contract',      label: 'Contract',      tone: 'indigo' },
  { value: 'quotation',     label: 'Quotation',     tone: 'amber' },
  { value: 'invoice',       label: 'Invoice',       tone: 'emerald' },
  { value: 'requirement',   label: 'Requirement',   tone: 'sky' },
  { value: 'proposal',      label: 'Proposal',      tone: 'violet' },
  { value: 'design',        label: 'Design',        tone: 'rose' },
  { value: 'report',        label: 'Report',        tone: 'zinc' },
  { value: 'agreement',     label: 'Agreement',     tone: 'indigo' },
  { value: 'specification', label: 'Specification', tone: 'sky' },
  { value: 'other',         label: 'Other',         tone: 'default' }
]

export async function listProjectDocuments(projectId, kind) {
  let q = supabase
    .from('project_documents')
    .select('*, author:profiles!project_documents_created_by_profile_fkey(id,full_name,avatar_url)')
    .eq('project_id', projectId)
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function createDocument({ projectId, kind, title, description, doc_date, amount, version, external_url, notes, file }) {
  const { data: { user } } = await supabase.auth.getUser()

  let storage_path = null, file_name = null, mime_type = null, size_bytes = null
  if (file) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    storage_path = `projects/${projectId}/${Date.now()}-${safe}`
    const { error: upErr } = await supabase.storage
      .from('project-documents')
      .upload(storage_path, file, { contentType: file.type, upsert: false })
    if (upErr) throw upErr
    file_name = file.name
    mime_type = file.type
    size_bytes = file.size
  }

  const { data, error } = await supabase.from('project_documents').insert({
    project_id: projectId,
    kind: kind ?? 'other',
    title,
    description: description ?? null,
    doc_date: doc_date ?? new Date().toISOString().slice(0, 10),
    amount: amount == null || amount === '' ? null : Number(amount),
    version: version || null,
    storage_path, file_name, mime_type, size_bytes,
    external_url: external_url || null,
    notes: notes ?? null,
    created_by: user?.id
  }).select('*, author:profiles!project_documents_created_by_profile_fkey(id,full_name,avatar_url)').single()
  if (error) throw error
  return data
}

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
    .from('project_documents').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteDocument(doc) {
  if (doc.storage_path) {
    await supabase.storage.from('project-documents').remove([doc.storage_path]).catch(() => {})
  }
  const { error } = await supabase.from('project_documents').delete().eq('id', doc.id)
  if (error) throw error
}

export async function getDocumentSignedUrl(path, expiresInSec = 3600) {
  const { data, error } = await supabase.storage
    .from('project-documents').createSignedUrl(path, expiresInSec)
  if (error) throw error
  return data.signedUrl
}
