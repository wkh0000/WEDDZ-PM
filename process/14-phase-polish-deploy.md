# Phase 13 — Polish + Deploy

**Status:** 🟡 In progress (code + Supabase done; Vercel + QA next)
**Date:** 2026-05-06
**Goal:** Final polish (code-splitting, account page, error boundary), provision Supabase, deploy on Vercel via Git, and run end-to-end QA.

## Sub-phases

### 13a — Code polish ✅
- React.lazy + Suspense for `BoardPage` and `InsightsPage`. Main bundle ~196 KB gz; Recharts and dnd-kit are split out.
- `/account` page (display name + change password).
- ErrorBoundary at the React root with a glass fallback.

### 13b — Supabase setup ✅
- Created Supabase project `weddz-pm` in `ap-southeast-1` (Singapore). Project ref: `kkxdspommmbjfozxknew`.
- Linked locally via `supabase link --project-ref …`.
- Pushed all three migrations (`001_initial_schema`, `002_storage_policies`, `003_storage_buckets`).
- Verified buckets exist: `task-attachments`, `invoice-receipts`, `employee-photos` (all private, 10/10/5 MB caps).
- Deployed Edge Function `create-team-member` (113.4 KB) with `--no-verify-jwt` (we verify the caller's role manually inside).
- `SUPABASE_SERVICE_ROLE_KEY` is auto-injected into Edge Functions by the Supabase runtime — no manual `secrets set` needed.
- Disabled email confirmation via Management API (`mailer_autoconfirm: true`) so signups complete instantly.
- All credentials saved to `process/.credentials.local.md` (gitignored).

### 13c — GitHub repo + push ⏳
- Create private GitHub repo `weddz-pm` under the active gh account (Captain-Fellow).
- Push all commits.

### 13d — Vercel deploy ⏳
- Import the repo into Vercel.
- Set env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`.
- Trigger first deploy.
- Add the deployed URL to Supabase Auth `redirect_urls`.

### 13e — End-to-end QA ⏳
- Sign up the founder (auto-promoted to super_admin via the `handle_new_user` trigger).
- Smoke-test every CRUD path: customer, project, invoice, expense, employee, salary.
- Smoke-test kanban drag, comments, checklist, attachments, labels.
- Disable public signup in Supabase Auth after the founder bootstrap.
- Add a second team member via `/admin/users`.
- Fix any issues surfaced by QA.

## Decisions
- **Active GitHub account: `Captain-Fellow`** (gh CLI default). The repo can be transferred to `wkh0000` later if needed.
- **Repo visibility: private.** Internal tool; public would expose business detail in commit history and source.
- **Supabase storage buckets created by migration `003_storage_buckets.sql`** rather than CLI commands. Reproducible from a single `supabase db push`.
- **`mailer_autoconfirm` set via Management API** rather than the dashboard so the deploy is fully scriptable.
- **Auto-injected `SUPABASE_SERVICE_ROLE_KEY`** — discovered during deploy; no manual `secrets set` step needed (the CLI even refuses to set env names with `SUPABASE_` prefix because they are reserved).

## Commit
`feat(phase-13): polish + deploy — code splitting, account page, Supabase live`
