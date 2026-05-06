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
export async function listTasks(projectId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles(id,full_name,avatar_url), labels:task_label_assignments(label:task_labels(id,name,color))')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
  if (error) throw error
  // flatten labels
  return data.map(t => ({ ...t, labels: (t.labels ?? []).map(la => la.label).filter(Boolean) }))
}

export async function getTask(id) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:profiles(id,full_name,avatar_url), labels:task_label_assignments(label:task_labels(id,name,color))')
    .eq('id', id)
    .single()
  if (error) throw error
  return { ...data, labels: (data.labels ?? []).map(la => la.label).filter(Boolean) }
}

export async function createTask({ projectId, columnId, title, position }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      column_id: columnId,
      title,
      position: position ?? 0,
      created_by: user?.id
    })
    .select()
    .single()
  if (error) throw error
  // log activity
  await supabase.from('task_activity').insert({
    task_id: data.id, actor_id: user?.id, kind: 'created', payload: { title }
  })
  return data
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
