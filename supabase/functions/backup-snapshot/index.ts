// supabase/functions/backup-snapshot/index.ts
//
// Captures a full JSON snapshot of every business table and emails it to the
// configured recipient via Resend. Two callers:
//   1. pg_cron — daily at 03:00 Asia/Colombo. Uses a shared secret to
//      authenticate so anonymous internet POSTs can't trigger backups.
//   2. /admin/backups page (authenticated super_admin via JWT). For
//      on-demand pulls.
//
// The snapshot is server-side JSON.stringify of every row in:
//   profiles, customers, projects, project_updates,
//   invoices, invoice_items, expenses,
//   employees, salaries,
//   task_columns, tasks, task_labels, task_label_assignments,
//   task_checklist_items, task_comments, task_attachments, task_activity,
//   org_counters
//
// Storage bucket files are NOT included — Supabase has its own backup
// for storage and the email size limit is 40 MB on Resend.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TABLES = [
  'profiles', 'org_counters',
  'customers', 'projects', 'project_updates',
  'invoices', 'invoice_items', 'expenses',
  'employees', 'salaries',
  'task_columns', 'tasks', 'task_labels', 'task_label_assignments',
  'task_checklist_items', 'task_comments', 'task_attachments', 'task_activity'
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST')   return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey   = Deno.env.get('RESEND_API_KEY')
  const recipient   = Deno.env.get('BACKUP_RECIPIENT')
  const sender      = Deno.env.get('BACKUP_SENDER') ?? 'WEDDZ PM <onboarding@resend.dev>'
  const cronSecret  = Deno.env.get('BACKUP_CRON_SECRET')

  if (!resendKey || !recipient) return json({ error: 'Resend not configured' }, 500)

  // ----- Authentication: either JWT super_admin, OR cron secret -----
  let triggeredBy: string
  let recipientOverride: string | null = null
  let downloadOnly = false
  const cronHeader = req.headers.get('x-cron-secret')

  if (cronHeader && cronSecret && cronHeader === cronSecret) {
    triggeredBy = 'pg_cron (scheduled)'
  } else {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await sb.auth.getUser()
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
    const { data: profile } = await sb.from('profiles').select('role,full_name,email,active').eq('id', userData.user.id).single()
    if (!profile?.active || profile.role !== 'super_admin') return json({ error: 'forbidden' }, 403)
    triggeredBy = `${profile.full_name ?? profile.email} (manual)`

    let body: any = {}
    try { body = await req.json() } catch {}
    if (body.email_to && typeof body.email_to === 'string') recipientOverride = body.email_to
    if (body.download_only === true) downloadOnly = true
  }

  // ----- Capture snapshot using service role (bypasses RLS) -----
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const snapshot: any = {
    schema: 'weddz-pm-backup-v1',
    generated_at: new Date().toISOString(),
    triggered_by: triggeredBy,
    counts: {} as Record<string, number>,
    tables: {} as Record<string, any[]>
  }

  for (const t of TABLES) {
    const { data, error } = await admin.from(t).select('*')
    if (error) {
      return json({ error: `Failed reading ${t}: ${error.message}` }, 500)
    }
    snapshot.tables[t] = data ?? []
    snapshot.counts[t] = data?.length ?? 0
  }

  const filename = `weddz-pm-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
  const fileText = JSON.stringify(snapshot, null, 2)

  // If download_only (manual UI trigger asking for a direct file), return as base64
  if (downloadOnly) {
    return json({
      filename,
      snapshot_size_bytes: fileText.length,
      counts: snapshot.counts,
      content_base64: btoa(unescape(encodeURIComponent(fileText)))
    })
  }

  // ----- Send via Resend -----
  const totalRows = Object.values(snapshot.counts as Record<string, number>).reduce((s, n) => s + n, 0)
  const sizeKb = (fileText.length / 1024).toFixed(1)

  const html = `
    <h2 style="font-family:system-ui;color:#111">WEDDZ PM — Daily Backup</h2>
    <p style="font-family:system-ui;color:#444">Generated <strong>${snapshot.generated_at}</strong> by <strong>${triggeredBy}</strong>.</p>
    <p style="font-family:system-ui;color:#444">Total rows: <strong>${totalRows.toLocaleString()}</strong> · File size: <strong>${sizeKb} KB</strong></p>
    <h3 style="font-family:system-ui;color:#111">Row counts</h3>
    <table style="font-family:system-ui;font-size:13px;border-collapse:collapse">
      <thead><tr><th align="left" style="padding:4px 12px;border-bottom:1px solid #ddd">Table</th><th align="right" style="padding:4px 12px;border-bottom:1px solid #ddd">Rows</th></tr></thead>
      <tbody>${Object.entries(snapshot.counts).map(([t, n]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f1f1">${t}</td><td align="right" style="padding:4px 12px;border-bottom:1px solid #f1f1f1">${n}</td></tr>`).join('')}</tbody>
    </table>
    <p style="font-family:system-ui;color:#666;font-size:12px;margin-top:24px">Attached: <code>${filename}</code> — JSON of every row from every table. Restore by replaying inserts in dependency order.</p>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender,
      to: [recipientOverride ?? recipient],
      subject: `WEDDZ PM backup — ${snapshot.generated_at.slice(0, 10)} (${totalRows} rows)`,
      html,
      attachments: [{ filename, content: btoa(unescape(encodeURIComponent(fileText))) }]
    })
  })
  const emailBody = await emailRes.text()
  if (!emailRes.ok) return json({ error: `Resend ${emailRes.status}: ${emailBody}`, snapshot_size_bytes: fileText.length }, 502)
  const { id: email_id } = JSON.parse(emailBody)
  return json({
    ok: true,
    sent_to: recipientOverride ?? recipient,
    email_id,
    filename,
    counts: snapshot.counts,
    snapshot_size_bytes: fileText.length
  })
})
