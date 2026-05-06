# Change Log 01 — Rename + Multi-User Workspace

**Date:** 2026-05-06
**Type:** Scope change (pre-implementation)
**Affects:** Master plan, schema, RLS, phase ordering, deploy steps
**Author:** wachindrakasun@gmail.com

---

## What changed

### 1. Rename: `FellowCRM` → `WEDDZ PM`

Project name change throughout:

- `package.json` name: `weddz-pm`
- App display name (sidebar, page title, env): `WEDDZ PM`
- README, master plan, all docs

### 2. Auth model: single-tenant → single-team workspace with roles

**Before:**
- Each Supabase user is their own tenant.
- RLS scope: `user_id = auth.uid()` on every row.
- Anyone could sign up via the app and get a private workspace.

**After:**
- One shared workspace (the WEDDZ IT team). All authenticated users see and collaborate on the same data.
- RLS scope: role-based — `super_admin` has full access; `member` has access to operational tables (customers, projects, invoices, expenses, kanban) but **cannot** see HR tables (employees, salaries) or manage users.
- Public signup is **disabled in production**. The first user to sign up (during initial setup) becomes `super_admin` automatically via a database trigger. After that, the super admin adds team members from inside the app.

### 3. Email confirmation: OFF

Confirmed acceptable. Free on Supabase. Toggle off in Supabase Auth → Providers → Email after creating the project. New users (created by super_admin) can log in immediately with the temp password set by the admin.

---

## Why

- WEDDZ IT is a team, not a solo operator. Customers, projects, invoices, and the kanban board are shared work artifacts — single-tenant RLS would force one shared login, which defeats audit trails and per-user assignment in tasks.
- Public signup on a production URL is a security risk for an internal tool. Admin-created users with temp passwords is the standard pattern.
- HR data (employees, salaries) must be restricted — only the founder/super admin should see payroll.

---

## Schema changes (vs. previous draft)

### Added

- **`user_role` enum** — `super_admin`, `member`.
- **`profiles` table** — one row per `auth.users`, holds role, full name, optional `employee_id` link, avatar.
  ```sql
  create table public.profiles (
    id          uuid primary key references auth.users on delete cascade,
    email       text not null,
    full_name   text,
    role        user_role not null default 'member',
    employee_id uuid references public.employees on delete set null,
    avatar_url  text,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );
  ```
- **`handle_new_user()` trigger** on `auth.users` insert — auto-creates a `profiles` row. First user becomes `super_admin`; everyone after is `member`.
- **`is_super_admin()` helper** — used by RLS policies and the app.
- **`org_counters` table** — single-row counter for invoice numbering (replaces per-user `user_counters`).

### Changed

- Most business tables: `user_id uuid references auth.users` → `created_by uuid references auth.users`. Audit-only column. RLS no longer filters by it.
- `next_invoice_number()` no longer takes a user parameter — single global sequence (`INV-0001` is unique across the org, not per-user).
- `invoices.unique(user_id, invoice_no)` → `invoices.unique(invoice_no)` (global uniqueness).
- `tasks.assignee_id` references `profiles(id)` instead of `employees(id)`. Members shouldn't need read access to the HR table just to see kanban assignees.

### RLS (new pattern)

| Tables | Read | Write |
|---|---|---|
| customers, projects, project_updates, invoices, invoice_items, expenses, task_columns, tasks, task_labels, task_label_assignments, task_checklist_items, task_comments, task_attachments, task_activity | any authenticated | any authenticated |
| profiles | any authenticated (so we can show "created by …") | super_admin only (plus self-update of own row) |
| employees | super_admin only | super_admin only |
| salaries | super_admin only | super_admin only |
| org_counters | any authenticated | via SECURITY DEFINER function only |

### Storage

Path convention simplified — no longer prefixed by `{user_id}`:

| Bucket | Path | Read | Write/Delete |
|---|---|---|---|
| `task-attachments` | `tasks/{task_id}/{filename}` | any authenticated | any authenticated |
| `invoice-receipts` | `expenses/{expense_id}/{filename}` | any authenticated | any authenticated |
| `employee-photos` | `employees/{employee_id}/{filename}` | any authenticated | super_admin only |

---

## Add Team Member flow (the secure way)

Creating a user programmatically requires the Supabase **service role key**, which must **never** ship to the browser. The standard solution is a server-side function:

- A **Supabase Edge Function** `create-team-member` runs on Supabase's free Deno runtime.
- It receives `{ email, full_name, password, role }` from the authenticated super_admin.
- It verifies the caller's JWT corresponds to a profile with `role = 'super_admin'`.
- If yes, it uses the admin client (`supabase.auth.admin.createUser`) to create the user with `email_confirm: true` (skips email verification).
- The `handle_new_user` trigger creates the matching `profiles` row.
- The Edge Function then updates the profile's `role` and `full_name` to the requested values.

The Edge Function is the **only** place the service role key lives — set as a Supabase secret, never in the React app.

---

## Phase plan: 12 → 13 phases

A new **Phase 04 — Team Members & Roles** is inserted. Old phases shift up by one.

| # | Phase | Notes |
|---|---|---|
| 01 | Foundation | Vite + Tailwind + deps + env |
| 02 | Database + Supabase Backend | Migration, RLS, storage, **Edge Function**, Auth settings |
| 03 | Auth + Layout | Login, AppShell, AuthContext (now also fetches the profile + role) |
| **04** | **Team Members & Roles** ⭐ NEW | RoleGate component, `/admin/users` page, AddTeamMember modal calling the Edge Function |
| 05 | Customers | (was 04) |
| 06 | Projects | (was 05) |
| 07 | Invoices | (was 06) |
| 08 | Expenses | (was 07) |
| 09 | Employees + Salaries | (was 08) — now super_admin only via RoleGate |
| 10 | Kanban | (was 09) — assignee_id references profiles, not employees |
| 11 | Dashboard | (was 10) |
| 12 | Insights | (was 11) |
| 13 | Polish + Deploy | (was 12) — add Edge Function deploy to checklist |

---

## Bootstrap flow (first super_admin)

1. Sign up at Supabase, run migration.
2. Deploy Edge Function `create-team-member`. Set `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secret.
3. In Supabase Auth → Providers → Email: toggle **off** "Confirm email".
4. Initially leave **public signup enabled** in Supabase Auth settings.
5. Run the app locally, sign up the founder via `/signup`. The trigger promotes this first profile to `super_admin`.
6. **Disable public signup** in Supabase Auth settings (or set `Disable signups: true` in Auth dashboard).
7. From now on, super_admin uses `/admin/users` to add members. The `/signup` route in the app remains accessible only as a fallback during initial setup; ProductionGuard hides it once any super_admin exists.

---

## Risks added

| Risk | Mitigation |
|---|---|
| Edge Function deploy is a new step | Documented in setup; one-line `supabase functions deploy create-team-member`. |
| Service role key leak | Lives only in Supabase function secrets; never in `.env.local`, never in client. |
| First-user-bootstrap race (multiple users sign up before super_admin disables it) | The trigger is atomic — only the *first* INSERT promotes. Even so: keep the time window short by disabling public signup right after first signup. |
| Member access too broad / too narrow | Two-role model is intentionally simple. Add an `admin` middle tier later if requested (single column change in the enum + RLS update). |

---

## Env vars (updated)

**Removed:**
- `VITE_DISABLE_SIGNUP` — replaced by the production guard described above (no UI flag needed).

**Unchanged (client):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_NAME=WEDDZ PM`

**New (Supabase Edge Function secret only — never client):**
- `SUPABASE_SERVICE_ROLE_KEY` — set via `supabase secrets set` or in the Supabase dashboard.

---

## Files touched in this change

- `process/00-MASTER-PLAN.md` — rewritten to reflect rename, schema, RLS, phases.
- `process/README.md` — name update.
- `README.md` — name + features blurb update.
- `process/01-change-rename-and-multiuser.md` — this file.

No code yet. Implementation begins at Phase 01 after this change is acknowledged.
