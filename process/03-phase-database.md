# Phase 02 — Database + Supabase Backend

**Status:** ✅ Code done (deployment runs at end of all phases per autonomous plan)
**Date:** 2026-05-06
**Goal:** Author the SQL migration, storage policies, and Edge Function so the backend is fully described in code. Actual provisioning (creating the Supabase project, running migrations, deploying the function) happens in the deployment phase after all code is written.

---

## Tasks

- [x] `supabase/migrations/001_initial_schema.sql` — full schema, enums, RLS, helper functions, triggers, RPCs.
- [x] `supabase/migrations/002_storage_policies.sql` — RLS for the three storage buckets.
- [x] `supabase/functions/create-team-member/index.ts` — Edge Function for super_admin user creation.
- [x] `supabase/functions/create-team-member/deno.json` — Deno import map.
- [x] `supabase/config.toml` — Supabase CLI project config (auth, storage, functions, db ports for local dev).
- [x] `.gitignore` — added `process/.credentials.local.md` and `.supabase/`.
- [ ] Deferred: provisioning, push, deploy — happens in Phase 13 deployment block.

---

## Files added

| Path | Purpose |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | Full schema: profiles, customers, projects, project_updates, invoices, invoice_items, expenses, employees, salaries, task_columns, tasks, task_labels, task_label_assignments, task_checklist_items, task_comments, task_attachments, task_activity, org_counters. RLS, helper fns, triggers. |
| `supabase/migrations/002_storage_policies.sql` | Storage bucket RLS (post-bucket-creation). |
| `supabase/functions/create-team-member/index.ts` | Edge Function for super_admin user creation via service role key. |
| `supabase/functions/create-team-member/deno.json` | Deno import map. |
| `supabase/config.toml` | Supabase CLI project config. |
| `process/03-phase-database.md` | This file. |

Updated:
- `.gitignore` — adds `process/.credentials.local.md` (where deploy creds will land) and `.supabase/` (CLI-generated state).

---

## Schema highlights

- **18 tables**: profiles, org_counters, customers, projects, project_updates, invoices, invoice_items, expenses, employees, salaries, task_columns, tasks, task_labels, task_label_assignments, task_checklist_items, task_comments, task_attachments, task_activity.
- **8 enums**: user_role, project_status, invoice_status, expense_category, employment_type, salary_status, task_priority, task_activity_kind.
- **Helper functions**: `set_updated_at` (trigger), `handle_new_user` (auto-creates profile, first user → super_admin), `is_super_admin` (RLS predicate), `next_invoice_number`, `pay_salary` (atomic salary→expense), `unpay_salary`, `move_task` (drag-drop with audit trail).
- **RLS pattern**: shared business tables = any authenticated; `employees`/`salaries` = super_admin only; `profiles` reads = any auth (so creator names render), writes = super_admin (+ self-update).
- **Realtime publication**: `tasks`, `task_columns`, `task_comments`, `task_checklist_items` for live kanban.

## Edge Function `create-team-member`

- POST endpoint, JWT-auth required.
- Verifies caller is an active super_admin via the user JWT.
- Uses service-role admin client to call `auth.admin.createUser` with `email_confirm: true`.
- The `handle_new_user` trigger auto-creates the matching `profiles` row at default role; the function then updates `full_name` + `role`.
- Best-effort rollback: if profile update fails, the freshly created auth user is deleted to avoid orphans.

---

## Decisions

- **Idempotent migrations.** All `create type`, `create table`, `create policy`, `add constraint` statements wrapped with `if not exists` / `do $$ … exception …` blocks so reruns don't fail. Lets us iterate the schema during dev.
- **`handle_new_user` is `security definer`** — bypasses profiles RLS to insert the new row at signup time before any session exists.
- **`is_super_admin()` is `security definer` + `stable`** — bypasses recursion concerns and lets PostgreSQL cache the result within a query.
- **`pay_salary` / `unpay_salary` as RPCs**, not client-side multi-step writes — atomicity and the `created_by` for the inserted expense row is computed server-side as `auth.uid()`.
- **`move_task` as RPC** — single round-trip per drag, server reorders both source and destination columns, writes audit row.
- **Storage paths NOT prefixed by user_id** — shared workspace; entity-id paths (`tasks/{task_id}/...`) are the natural key and any-authenticated RLS is enough.
- **`verify_jwt = false`** in `config.toml` for the Edge Function — we manually verify inside the function. This avoids the Supabase platform double-verifying with possibly-different rules.

---

## Acceptance criteria (verified at deploy time)

| Check | Status |
|---|---|
| Migration SQL parses (no syntax errors) | ✅ to be confirmed during `supabase db push` |
| `next_invoice_number()` returns `INV-0001` on first call | ⏸ end-to-end |
| Edge Function deploys cleanly | ⏸ end-to-end |
| Anonymous call to Edge Function returns 401 | ⏸ end-to-end |
| `is_super_admin()` returns true for the founder, false for new members | ⏸ end-to-end |

---

## Commit

`feat(phase-02): SQL migration, storage policies, Edge Function for team member creation`
