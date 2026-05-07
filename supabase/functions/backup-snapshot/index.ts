// supabase/functions/backup-snapshot/index.ts
//
// Captures a full snapshot of every business table — in JSON and SQL formats —
// and emails it to the configured recipient via Resend. Two callers:
//   1. pg_cron — daily at 03:00 Asia/Colombo. Uses a shared secret to
//      authenticate so anonymous internet POSTs can't trigger backups.
//   2. /admin/backups page (authenticated super_admin via JWT). For
//      on-demand pulls — the UI lets the user choose JSON, SQL, or both.
//
// Output formats:
//   • JSON — `weddz-pm-backup-<ts>.json` — pretty-printed dump of every
//     row, easy to diff and inspect manually.
//   • SQL — `weddz-pm-backup-<ts>.sql` — INSERT statements wrapped in a
//     transaction, ordered by FK dependencies. Restore by replaying into
//     an empty schema (or use `SET session_replication_role = replica;`
//     to defer FK checks if restoring into a populated DB).
//
// Body fields (download flow):
//   • format: 'json' | 'sql' | 'both' — default 'both'
//   • download_only: true — return content as base64 instead of emailing
//   • email_to: override BACKUP_RECIPIENT for one-off sends
//
// Storage bucket files are NOT included — Supabase has its own backup
// for storage and the Resend attachment limit is 40 MB.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Order matters for SQL restore: parents before children so FK constraints
// are satisfied. Wrapped in BEGIN/COMMIT in the dump.
const TABLES = [
  'profiles', 'org_counters',
  'customers', 'projects', 'project_updates',
  'project_phases', 'phase_deliverables', 'project_documents',
  'invoices', 'invoice_items', 'expenses',
  'employees', 'salaries',
  'task_columns', 'task_labels', 'tasks', 'task_label_assignments',
  'task_checklist_items', 'task_comments', 'task_attachments', 'task_activity'
]

type Format = 'json' | 'sql' | 'both'

/** Encode a JS value as a PostgreSQL literal for an INSERT VALUES clause. */
function toSqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v) || typeof v === 'object') {
    // JSON / JSONB column — Supabase returns these as parsed objects.
    const j = JSON.stringify(v).replace(/'/g, "''")
    return `'${j}'::jsonb`
  }
  // string / timestamptz / uuid / date — single-quote literal with PG escaping.
  const escaped = String(v).replace(/'/g, "''")
  return `'${escaped}'`
}

function toSqlDump(snapshot: { generated_at: string; triggered_by: string; tables: Record<string, any[]> }): string {
  const lines: string[] = []
  lines.push('-- ============================================================')
  lines.push('-- WEDDZ PM — SQL backup')
  lines.push(`-- Generated: ${snapshot.generated_at}`)
  lines.push(`-- Triggered by: ${snapshot.triggered_by}`)
  lines.push('--')
  lines.push('-- Restore: replay top-to-bottom into an empty schema. To restore')
  lines.push('-- into a populated DB without dropping FKs, prepend:')
  lines.push("--   SET session_replication_role = 'replica';")
  lines.push('-- ============================================================')
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')
  for (const t of TABLES) {
    const rows = snapshot.tables[t] ?? []
    if (rows.length === 0) {
      lines.push(`-- ${t}: empty`)
      lines.push('')
      continue
    }
    const cols = Object.keys(rows[0])
    const colList = cols.map(c => `"${c}"`).join(', ')
    lines.push(`-- ${t}: ${rows.length} row${rows.length === 1 ? '' : 's'}`)
    for (const row of rows) {
      const vals = cols.map(c => toSqlLiteral((row as any)[c])).join(', ')
      lines.push(`INSERT INTO public."${t}" (${colList}) VALUES (${vals});`)
    }
    lines.push('')
  }
  lines.push('COMMIT;')
  return lines.join('\n')
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

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
  let format: Format = 'both'
  const cronHeader = req.headers.get('x-cron-secret')

  if (cronHeader && cronSecret && cronHeader === cronSecret) {
    triggeredBy = 'pg_cron (scheduled)'
    // Cron always emails both formats — easier to restore if anything goes wrong.
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
    if (body.format === 'json' || body.format === 'sql' || body.format === 'both') format = body.format
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

  const stem = `weddz-pm-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`
  const jsonFilename = `${stem}.json`
  const sqlFilename  = `${stem}.sql`
  const wantJson = format === 'json' || format === 'both'
  const wantSql  = format === 'sql'  || format === 'both'

  const jsonText = wantJson ? JSON.stringify(snapshot, null, 2) : ''
  const sqlText  = wantSql  ? toSqlDump(snapshot) : ''

  // If download_only (manual UI trigger asking for a direct file), return as base64
  if (downloadOnly) {
    return json({
      format,
      filename: jsonFilename,                              // legacy field, JSON name
      sql_filename: sqlFilename,
      counts: snapshot.counts,
      snapshot_size_bytes: jsonText.length,
      sql_size_bytes: sqlText.length,
      content_base64: wantJson ? b64(jsonText) : '',
      sql_base64:     wantSql  ? b64(sqlText)  : ''
    })
  }

  // ----- Send via Resend -----
  const totalRows = Object.values(snapshot.counts as Record<string, number>).reduce((s, n) => s + n, 0)
  const sizes: string[] = []
  if (wantJson) sizes.push(`JSON ${(jsonText.length / 1024).toFixed(1)} KB`)
  if (wantSql)  sizes.push(`SQL ${(sqlText.length / 1024).toFixed(1)} KB`)
  const sizeStr = sizes.join(' · ')

  const attachments: Array<{ filename: string; content: string }> = []
  if (wantJson) attachments.push({ filename: jsonFilename, content: b64(jsonText) })
  if (wantSql)  attachments.push({ filename: sqlFilename,  content: b64(sqlText)  })

  const formatLabel = format === 'both' ? 'JSON + SQL' : format.toUpperCase()
  const restoreHint = wantSql
    ? `Restore the <code>.sql</code> file directly with <code>psql</code> against an empty schema (it's wrapped in <code>BEGIN/COMMIT</code>).`
    : `Restore by replaying inserts in dependency order.`

  const html = `
    <h2 style="font-family:system-ui;color:#111">WEDDZ PM — Daily Backup</h2>
    <p style="font-family:system-ui;color:#444">Generated <strong>${snapshot.generated_at}</strong> by <strong>${triggeredBy}</strong>.</p>
    <p style="font-family:system-ui;color:#444">Total rows: <strong>${totalRows.toLocaleString()}</strong> · ${sizeStr}</p>
    <h3 style="font-family:system-ui;color:#111">Row counts</h3>
    <table style="font-family:system-ui;font-size:13px;border-collapse:collapse">
      <thead><tr><th align="left" style="padding:4px 12px;border-bottom:1px solid #ddd">Table</th><th align="right" style="padding:4px 12px;border-bottom:1px solid #ddd">Rows</th></tr></thead>
      <tbody>${Object.entries(snapshot.counts).map(([t, n]) => `<tr><td style="padding:4px 12px;border-bottom:1px solid #f1f1f1">${t}</td><td align="right" style="padding:4px 12px;border-bottom:1px solid #f1f1f1">${n}</td></tr>`).join('')}</tbody>
    </table>
    <p style="font-family:system-ui;color:#666;font-size:12px;margin-top:24px">Format: <strong>${formatLabel}</strong>. ${restoreHint}</p>
  `

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: sender,
      to: [recipientOverride ?? recipient],
      subject: `WEDDZ PM backup — ${snapshot.generated_at.slice(0, 10)} (${totalRows} rows · ${formatLabel})`,
      html,
      attachments
    })
  })
  const emailBody = await emailRes.text()
  if (!emailRes.ok) return json({ error: `Resend ${emailRes.status}: ${emailBody}` }, 502)
  const { id: email_id } = JSON.parse(emailBody)
  return json({
    ok: true,
    sent_to: recipientOverride ?? recipient,
    email_id,
    format,
    filename: jsonFilename,
    sql_filename: sqlFilename,
    counts: snapshot.counts,
    snapshot_size_bytes: jsonText.length,
    sql_size_bytes: sqlText.length
  })
})
