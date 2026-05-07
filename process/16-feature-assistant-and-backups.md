# Phase 14 — In-app AI Assistant + Automated Backups

**Status:** ✅ Done
**Date:** 2026-05-07
**Goal:** Two new features the user asked for after the initial deploy stabilized:
  1. A floating chat assistant (Gemini 2.5 Flash + tool calling) that any authenticated user can talk to — same scope as me chatting with them, executing reads/writes through Supabase with RLS still enforced server-side.
  2. A daily automatic database backup that emails a JSON snapshot to the founder, plus an admin page to trigger ad-hoc backups (email or direct download).

---

## Backend additions

### Edge Function `chat-assistant` (`supabase/functions/chat-assistant/index.ts`)

- Loop runs up to 6 model→tool→model steps per user turn; halts on a text response or on a confirmation-required tool.
- Calls Gemini at `models/gemini-2.5-flash:generateContent` with a function-declarations block. Older 2.0 models return free-tier `limit: 0` on the user's project; 2.5-flash works on the same key.
- Authenticates the caller via the user JWT (anon-key-scoped supabase-js client) — RLS continues to apply for every read and write the assistant performs. Service-role client is created but only used for tools that explicitly need it.
- 17 tools registered:
  - **Read (8):** list_customers, list_projects, list_invoices, list_expenses, list_tasks, list_employees, list_team_members, dashboard_summary
  - **Write — safe (6):** create_customer, create_project (auto-seeds 4 default kanban columns), create_task, add_project_update, create_expense, create_invoice (uses `next_invoice_number()` RPC)
  - **Write — confirm-then-execute (5):** mark_invoice_paid, set_project_status, pay_salary, set_profile_role, delete_record
- Confirmation flow: when the model picks an unsafe tool, the function returns `{ message, pending_action: { tool, args, summary } }` instead of running it. The client renders a confirm card and POSTs back with `confirmed_action`. The function then executes, appends the result to the conversation, and lets the model summarise.
- `superAdminOnly` flag on tools that touch HR / user management. Members get a filtered tool list and the model literally cannot call those.
- System prompt locks the persona to "WEDDZ PM assistant", LKR currency, lookup-then-act discipline.

### Edge Function `backup-snapshot` (`supabase/functions/backup-snapshot/index.ts`)

- Two callers:
  - **pg_cron (scheduled)** — authenticated by an `X-Cron-Secret` header that matches the `BACKUP_CRON_SECRET` env var.
  - **`/admin/backups` UI** — authenticated by user JWT; verifies `role = super_admin` and `active`.
- Reads every row from 18 tables using the service role (bypasses RLS) and serializes to a single JSON.
- Modes:
  - Default → `POST /api/resend.com/emails` with the JSON as a base64 attachment + an HTML summary table of row counts. Recipient defaults to `BACKUP_RECIPIENT` secret; UI can override per-call.
  - `download_only: true` → returns base64 in the JSON response so the browser can save the file directly.

### Migration `004_backup_cron.sql`

- Enables `pg_cron` and `pg_net` extensions.
- Schedules `weddz-pm-daily-backup` at `30 21 * * *` UTC (= 03:00 Asia/Colombo).
- The cron command body is `select net.http_post(...)` to the backup function URL with the X-Cron-Secret header.
- The migration is idempotent — `cron.unschedule` first, then re-schedule — so deploys are safe.
- The actual secret value is **not** in the migration. It's injected at deploy time by re-running the schedule with the secret inlined into the cron body. This is a deliberate trade-off: the secret lives in `cron.job.command` (which only superusers can read), the migration in source control stays clean.

### Secrets registered with Supabase

```
GEMINI_API_KEY        # gemini-2.5-flash
RESEND_API_KEY        # WEDDZ PM Backups key
BACKUP_RECIPIENT      # wkh0000@gmail.com
BACKUP_SENDER         # WEDDZ PM <onboarding@resend.dev>
BACKUP_CRON_SECRET    # 192-bit hex — only used to prove the cron caller is real
```

---

## Frontend additions

- `src/features/assistant/api.js` — `sendChat(messages, confirmedAction?)` thin wrapper over `supabase.functions.invoke('chat-assistant', ...)`.
- `src/features/assistant/components/MessageBubble.jsx` — alternating user / assistant bubbles, framer-motion entry, optional "actions taken" pill chips below assistant messages.
- `src/features/assistant/components/PendingActionCard.jsx` — amber-bordered confirm card with arg preview + Cancel / Confirm.
- `src/features/assistant/components/ChatPanel.jsx` — floating panel (full-width on mobile, 420×600 on desktop), portal-mounted, Esc/click-outside on mobile only, persists last 30 messages in `localStorage` (`weddzpm.chat.history.v1`), auto-scrolls, suggestions on first open.
- `src/features/assistant/components/ChatLauncher.jsx` — animated indigo bubble bottom-right with a soft-pulsing emerald dot. Hidden when the panel is open.
- `src/features/admin/pages/BackupsPage.jsx` — three info tiles (schedule, table count, default recipient), a "Trigger now" card with email-to override + download button, last-result card showing per-table row counts.
- `src/features/admin/api.js` — added `triggerBackup({ mode, emailTo })`.

### Wiring

- `src/routes.jsx` — new `/admin/backups` route inside `<RoleGate>`.
- `src/components/layout/Sidebar.jsx` — new "Backups" link in the Admin group (super_admin only).
- `src/components/layout/AppShell.jsx` — `<ChatLauncher />` mounted once after `<main>`. Visible on every authenticated page.

---

## Verification (run before commit)

| Check | Result |
|---|---|
| Gemini key authenticates | ✅ `gemini-2.5-flash` returns text on PING/PONG |
| Resend key sends email | ✅ test email id `3536782e…` delivered to wkh0000@gmail.com |
| backup-snapshot via cron secret | ✅ email id `15309319…` delivered. 25.8 KB. 18 tables, 53 rows. |
| chat-assistant: "How many customers do we have?" | ✅ called `list_customers`, replied "We have 6 customers." |
| chat-assistant: "set 'Retail POS' to active" | ✅ paused with `pending_action: set_project_status` for confirmation |
| chat-assistant: "Add an expense: tea & coffee 250 LKR…" | ✅ called `create_expense`, row inserted |
| pg_cron schedule active | ✅ `cron.job` row `weddz-pm-daily-backup` `30 21 * * *` `active=true` |
| `npm run build` | ✅ 717 KB JS / 200 KB gz (incl. chat panel + backups page) |

---

## Decisions

- **Gemini 2.5 Flash over 2.0 Flash.** The user's "Mano Bakers Web" project shows `limit: 0` on 2.0 free-tier — likely a deprecation. 2.5 is the active free tier. Same JSON tool-call shape.
- **No chat persistence in DB** — `localStorage` is enough for an internal tool. The conversation is short-lived; if a user wants a fresh start they click Trash.
- **Confirmation flow is server-side** — the Edge Function decides whether a tool is unsafe, not the client. A malicious or buggy client can't bypass it.
- **Backup secret lives in `cron.job.command`**, not `ALTER DATABASE`. The service role can't change DB-level params, but it can write into `cron.job` via SQL. Restricted to Postgres superusers for read.
- **Daily, not hourly.** A team of 3 with low write volume doesn't need more. Easy to bump to `0 */6 * * *` later by editing the schedule row.
- **Default sender is `onboarding@resend.dev`** — Resend's sandbox sender that works without verifying a domain. Limitation: only the Resend account owner's email can receive; perfect for the founder-only backup recipient. Switching to a custom domain is a 5-minute change later.

---

## Open follow-ups (low priority)

- Streaming responses from Gemini (currently waits for the full answer). Easy to add via SSE if perceived latency becomes an issue.
- Verify a custom domain in Resend so backups can be sent to other team members too.
- A second backup function `backup-storage` that zips and emails the storage buckets weekly. Skipped — Supabase has its own backup of storage and total volume is tiny.
- Show the cron run history (`cron.job_run_details`) on the Backups page. Skipped for now; the email IS the receipt.
