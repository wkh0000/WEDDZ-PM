import { supabase } from '@/lib/supabase'

// ---------- Columns ----------
export async function listColumns(projectId) {
  const { data, error } = await supabase
    .from('task_columns')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export async function createColumn(projectId, name) {
  const { data: { user } } = await supabase.auth.getUser()
  // append at end
  const cols = await listColumns(projectId)
  const position = cols.length
  const { data, error } = await supabase
    .from('task_columns')
    .insert({ project_id: projectId, name, position, created_by: user?.id })
    .select().single()
  if (error) throw error
  return data
}

export async function updateColumn(id, updates) {
  const { data, error } = await supabase
    .from('task_columns').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteColumn(id) {
  const { error } = await supabase.from('task_columns').delete().eq('id', id)
  if (error) throw error
}

export async function reorderColumns(orderedIds) {
  // sequential updates: small set, fine to do client-side
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('task_columns').update({ position: i }).eq('id', orderedIds[i])
    if (error) throw error
  }
}

// ---------- Tasks ----------
//
// Multi-assignee model: tasks support 0..N assignees via the
// `task_assignees` join table. The legacy `tasks.assignee_id` column
// is kept in sync as the "primary" assignee — first one assigned —
// so the per-user filter chip, the dashboard "my tasks" view, and the
// realtime subscription all continue to work without a wider rewrite.
//
// Read shape: every task row carries a normalized `assignees` array
// of `{id, full_name, avatar_url}` profiles. The first item is also
// available as `task.assignee` for any code that still reads the
// single-assignee field (TaskCard fallback, filter logic, etc.).

export async function listTasks(projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url),
      assignees:task_assignees(profile:profiles(id,full_name,avatar_url)),
      labels:task_label_assignments(label:task_labels(id,name,color)),
      comments:task_comments(id),
      checklist:task_checklist_items(id,done),
      attachments:task_attachments(id)
    `)
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []).map(t => normalizeTask(t))
}

export async function getTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url),
      assignees:task_assignees(profile:profiles(id,full_name,avatar_url)),
      labels:task_label_assignments(label:task_labels(id,name,color))
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return normalizeTask(data)
}

/** Shared post-processor for embedded shape → flat lists & counts. */
function normalizeTask(t) {
  if (!t) return t
  const checklist = t.checklist ?? []
  const assignees = (t.assignees ?? []).map(a => a.profile).filter(Boolean)
  // Make sure the "primary" (legacy) assignee shows up in the array
  // even if the join-table backfill hasn't caught it yet.
  if (t.assignee && !assignees.some(a => a.id === t.assignee.id)) {
    assignees.unshift(t.assignee)
  }
  return {
    ...t,
    assignees,
    labels: (t.labels ?? []).map(la => la.label).filter(Boolean),
    comment_count: (t.comments ?? []).length,
    checklist_total: checklist.length,
    checklist_done: checklist.filter(c => c.done).length,
    attachment_count: (t.attachments ?? []).length,
    // strip the raw arrays — we only kept them for counting
    comments: undefined, checklist: undefined, attachments: undefined
  }
}

export async function createTask({ projectId, columnId, title, position, priority, due_date, assignee_id, assignee_ids, description }) {
  const { data: { user } } = await supabase.auth.getUser()
  // Normalize: prefer assignee_ids array; fall back to single assignee_id.
  const ids = Array.isArray(assignee_ids) && assignee_ids.length
    ? assignee_ids.filter(Boolean)
    : (assignee_id ? [assignee_id] : [])
  const primaryId = ids[0] ?? null

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      column_id: columnId,
      title,
      description: description ?? null,
      priority: priority ?? 'medium',
      due_date: due_date || null,
      assignee_id: primaryId,
      position: position ?? 0,
      created_by: user?.id
    })
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url)')
    .single()
  if (error) throw error

  // Mirror the full set into the join table.
  if (ids.length > 0) {
    const rows = ids.map(profile_id => ({ task_id: data.id, profile_id }))
    const { error: aerr } = await supabase.from('task_assignees').insert(rows)
    if (aerr) console.warn('[tasks] failed to insert task_assignees:', aerr.message)
  }

  await supabase.from('task_activity').insert({
    task_id: data.id, actor_id: user?.id, kind: 'created', payload: { title, assignee_count: ids.length }
  })
  return { ...data, assignees: ids.length ? [data.assignee].filter(Boolean) : [] }
}

/**
 * Replace the assignee set for a task. Pass an empty array to clear.
 * Keeps `tasks.assignee_id` in sync as the "primary" so legacy filters
 * and the realtime subscription continue to work.
 */
export async function setTaskAssignees(taskId, profileIds) {
  const { data: { user } } = await supabase.auth.getUser()
  const ids = (profileIds ?? []).filter(Boolean)
  const primaryId = ids[0] ?? null

  // 1. Read existing rows so we can compute the diff and only do the
  //    minimum number of writes — saves realtime noise on the board.
  const { data: existingRows, error: rErr } = await supabase
    .from('task_assignees').select('profile_id').eq('task_id', taskId)
  if (rErr) throw rErr
  const existing = new Set((existingRows ?? []).map(r => r.profile_id))
  const next     = new Set(ids)
  const toAdd    = ids.filter(id => !existing.has(id))
  const toRemove = [...existing].filter(id => !next.has(id))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('task_assignees').delete()
      .eq('task_id', taskId).in('profile_id', toRemove)
    if (error) throw error
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('task_assignees').insert(toAdd.map(profile_id => ({ task_id: taskId, profile_id })))
    if (error) throw error
  }

  // 2. Sync the primary assignee column.
  const { data: taskRow, error: uerr } = await supabase
    .from('tasks').update({ assignee_id: primaryId }).eq('id', taskId)
    .select('*, assignee:profiles!tasks_assignee_id_fkey(id,full_name,avatar_url)').single()
  if (uerr) throw uerr

  // 3. Audit
  if (toAdd.length || toRemove.length) {
    await supabase.from('task_activity').insert({
      task_id: taskId, actor_id: user?.id, kind: 'assigned',
      payload: { added: toAdd, removed: toRemove, count: ids.length }
    })
  }

  return taskRow
}

export async function updateTask(id, updates) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks').update(updates).eq('id', id).select().single()
  if (error) throw error
  await supabase.from('task_activity').insert({
    task_id: id, actor_id: user?.id, kind: 'updated', payload: updates
  })
  return data
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Soft-delete: stamp `archived_at`. The board hides archived cards by
 * default; the "Archived" smart filter on the board page surfaces them.
 * Restore via `unarchiveTask`. Hard delete is `deleteTask`.
 */
export async function archiveTask(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks').update({ archived_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  await supabase.from('task_activity').insert({
    task_id: id, actor_id: user?.id, kind: 'updated', payload: { archived: true }
  })
  return data
}

export async function unarchiveTask(id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks').update({ archived_at: null })
    .eq('id', id).select().single()
  if (error) throw error
  await supabase.from('task_activity').insert({
    task_id: id, actor_id: user?.id, kind: 'updated', payload: { archived: false }
  })
  return data
}

export async function moveTask(taskId, newColumnId, newPosition) {
  const { error } = await supabase.rpc('move_task', {
    p_task_id: taskId,
    p_new_column_id: newColumnId,
    p_new_position: newPosition
  })
  if (error) throw error
}

// ---------- Labels ----------
export async function listLabels(projectId) {
  const { data, error } = await supabase
    .from('task_labels').select('*').eq('project_id', projectId).order('name')
  if (error) throw error
  return data
}

export async function createLabel(projectId, name, color) {
  const { data, error } = await supabase
    .from('task_labels').insert({ project_id: projectId, name, color }).select().single()
  if (error) throw error
  return data
}

export async function deleteLabel(id) {
  const { error } = await supabase.from('task_labels').delete().eq('id', id)
  if (error) throw error
}

export async function attachLabel(taskId, labelId) {
  const { error } = await supabase
    .from('task_label_assignments').insert({ task_id: taskId, label_id: labelId })
  if (error && error.code !== '23505') throw error // ignore unique violation
}

export async function detachLabel(taskId, labelId) {
  const { error } = await supabase
    .from('task_label_assignments').delete()
    .eq('task_id', taskId).eq('label_id', labelId)
  if (error) throw error
}

// ---------- Checklist ----------
export async function listChecklist(taskId) {
  const { data, error } = await supabase
    .from('task_checklist_items').select('*')
    .eq('task_id', taskId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export async function addChecklistItem(taskId, body) {
  const items = await listChecklist(taskId)
  const { data, error } = await supabase
    .from('task_checklist_items')
    .insert({ task_id: taskId, body, position: items.length })
    .select().single()
  if (error) throw error
  return data
}

export async function updateChecklistItem(id, updates) {
  const { data, error } = await supabase
    .from('task_checklist_items').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase.from('task_checklist_items').delete().eq('id', id)
  if (error) throw error
}

// ---------- Comments ----------
export async function listComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, author:profiles(id,full_name,avatar_url)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addComment(taskId, body) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, body, author_id: user?.id })
    .select('*, author:profiles(id,full_name,avatar_url)')
    .single()
  if (error) throw error
  await supabase.from('task_activity').insert({
    task_id: taskId, actor_id: user?.id, kind: 'commented', payload: { snippet: body.slice(0, 80) }
  })
  return data
}

export async function deleteComment(id) {
  const { error } = await supabase.from('task_comments').delete().eq('id', id)
  if (error) throw error
}

// ---------- Attachments ----------
export async function listAttachments(taskId) {
  const { data, error } = await supabase
    .from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function uploadAttachment(taskId, file) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `tasks/${taskId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: upErr } = await supabase.storage
    .from('task-attachments').upload(path, file, { contentType: file.type })
  if (upErr) throw upErr
  const { data, error } = await supabase
    .from('task_attachments').insert({
      task_id: taskId, uploaded_by: user?.id, file_name: file.name,
      storage_path: path, mime_type: file.type, size_bytes: file.size
    }).select().single()
  if (error) throw error
  return data
}

export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage
    .from('task-attachments').createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteAttachment(attachment) {
  await supabase.storage.from('task-attachments').remove([attachment.storage_path]).catch(() => {})
  const { error } = await supabase.from('task_attachments').delete().eq('id', attachment.id)
  if (error) throw error
}

// ---------- Activity ----------
export async function listActivity(taskId) {
  const { data, error } = await supabase
    .from('task_activity')
    .select('*, actor:profiles(id,full_name,avatar_url)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
