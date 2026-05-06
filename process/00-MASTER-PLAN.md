# WEDDZ PM — Master Implementation Plan

**Project:** WEDDZ PM — Internal Project Management & CRM tool for WEDDZ IT (Sri Lanka)
**Stack:** React 18 + Vite + Tailwind + Supabase + Vercel
**Currency:** LKR (`LKR 125,000.00`) | **Date format:** `06 May 2026`
**Status:** Pre-implementation master spec
**Last reviewed:** 2026-05-06
**Most recent change:** [01-change-rename-and-multiuser.md](01-change-rename-and-multiuser.md)

---

## Table of Contents

- [0. Guiding Principles](#0-guiding-principles)
- [A. Database Schema](#a-database-schema)
- [B. Folder Structure](#b-folder-structure)
- [C. Routes Map](#c-routes-map)
- [D. Component Inventory](#d-component-inventory)
- [E. Build Phases (13 phases)](#e-build-phases)
- [F. Drag-and-Drop Library Choice](#f-drag-and-drop-library)
- [G. Charts Library](#g-charts-library)
- [H. Risks & Tradeoffs](#h-risks--tradeoffs)
- [I. Vercel & Supabase Config](#i-vercel--supabase-config)
- [J. Step-by-step Setup (Non-developer)](#j-step-by-step-setup-non-developer)
- [K. Conventions & Standards](#k-conventions--standards)

---

## 0. Guiding Principles

1. **Single-team shared workspace with role-based access.** All authenticated users see the same business data. Two roles: `super_admin` (founder) and `member` (team). Sensitive tables (`employees`, `salaries`) and user management are super_admin-only.
2. **Free tier only.** All choices honor Supabase free (500 MB DB, 1 GB storage, 50k MAU, 500k Edge Function invocations) and Vercel hobby (100 GB bw/mo). For ~5–20 internal users this is plenty.
3. **No public signup in production.** Super admin creates team members from inside the app via a Supabase Edge Function (which alone holds the service role key).
4. **Feature folders, not type folders.** Code that changes together lives together — see § B.
5. **No UI library.** Pure Tailwind + hand-rolled components.
6. **Each feature gets its own context.** Avoids one giant `AppContext` that re-renders everything.
7. **Supabase = source of truth.** Optimistic UI for snappy feel, but every mutation round-trips and reconciles.
8. **Phases are independently shippable.** Each phase ends in a green build and a `git commit` you could deploy.

---

## A. Database Schema

### A.1 Design decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| User model | **Single-team shared workspace + roles** | One company, one Supabase project. Two roles: `super_admin`, `member`. Works for ~5–50 users. |
| Drag-drop ordering | **Integer `position` column, reorder-on-write** | <100 tasks per column. Lexorank is overkill. |
| Invoice numbering | **Postgres function + single-row `org_counters`** | Atomic, race-safe, single sequence org-wide. |
| `updated_at` | **Trigger on every mutable table** | One reusable `set_updated_at()` function. |
| Activity log | **Dedicated `task_activity` table, NOT JSONB column** | Queryable, paginatable, sortable. |
| Soft delete | **None.** Hard delete with confirm modals. | Internal tool; restore-from-trash isn't worth the every-query filter. |
| UUIDs vs bigint | **UUID v4 (`gen_random_uuid()`)** | Supabase convention; safe in URLs. |
| Money columns | **`numeric(14, 2)`** | Never floats. 14 digits handles LKR 999,999,999,999.99. |
| Realtime | **`tasks` and `task_columns` only** | Live drag-drop visibility for kanban. Keeps Realtime quota low. |
| Audit ownership | **`created_by uuid`** (audit only, not RLS) | We trust the team; we still want "who added this" UI. |
| Add-user flow | **Supabase Edge Function** | Admin API needs service role key — must stay server-side. |

### A.2 Full migration (`supabase/migrations/001_initial_schema.sql`)

```sql
-- ============================================================
-- 001_initial_schema.sql — WEDDZ PM
-- Schema, RLS, triggers, helpers, role bootstrap
-- ============================================================

-- 0. Extensions ------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- 1. Reusable helpers -----------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 2. Roles + profiles ----------------------------------------
create type public.user_role as enum ('super_admin','member');

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'member',
  employee_id uuid,                                       -- FK added later (forward ref)
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.profiles (role);
create index on public.profiles (active);

-- handle_new_user: create profile on signup; first user is super_admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when is_first then 'super_admin'::user_role else 'member'::user_role end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_super_admin: cheap helper for RLS + app
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active
  )
$$;

-- 3. Single-row counter for invoice numbers ------------------
create table public.org_counters (
  id          smallint primary key default 1,
  invoice_seq integer not null default 0,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.org_counters (id) values (1);

create or replace function public.next_invoice_number()
returns text language plpgsql security definer set search_path = public as $$
declare next_n integer;
begin
  update public.org_counters
    set invoice_seq = invoice_seq + 1, updated_at = now()
    where id = 1
  returning invoice_seq into next_n;
  return 'INV-' || lpad(next_n::text, 4, '0');
end $$;

-- 4. customers -----------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users on delete set null,
  name        text not null,
  company     text,
  email       text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.customers (name);
create index on public.customers (created_by);

-- 5. projects ------------------------------------------------
create type public.project_status as enum ('planning','active','on_hold','completed','cancelled');

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references auth.users on delete set null,
  customer_id  uuid references public.customers on delete set null,
  name         text not null,
  description  text,
  status       project_status not null default 'planning',
  budget       numeric(14,2) not null default 0,
  start_date   date,
  end_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.projects (status);
create index on public.projects (customer_id);

create table public.project_updates (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users on delete set null,
  project_id  uuid not null references public.projects on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on public.project_updates (project_id, created_at desc);

-- 6. invoices ------------------------------------------------
create type public.invoice_status as enum ('draft','sent','paid','overdue','cancelled');

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid references auth.users on delete set null,
  customer_id   uuid not null references public.customers on delete restrict,
  project_id    uuid references public.projects on delete set null,
  invoice_no    text not null unique,
  issue_date    date not null default current_date,
  due_date      date,
  status        invoice_status not null default 'draft',
  notes         text,
  subtotal      numeric(14,2) not null default 0,
  tax_rate      numeric(5,2)  not null default 0,
  tax_amount    numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.invoices (status);
create index on public.invoices (customer_id);
create index on public.invoices (project_id);
create index on public.invoices (due_date);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0,
  position    integer not null default 0
);
create index on public.invoice_items (invoice_id, position);

-- 7. expenses ------------------------------------------------
create type public.expense_category as enum
  ('Software','Hardware','Travel','Subcontractor','Marketing','Salary','Other');

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references auth.users on delete set null,
  project_id   uuid references public.projects on delete set null, -- null = general
  category     expense_category not null default 'Other',
  description  text not null,
  amount       numeric(14,2) not null,
  expense_date date not null default current_date,
  salary_id    uuid,                         -- FK added after salaries table
  receipt_url  text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.expenses (expense_date desc);
create index on public.expenses (category);
create index on public.expenses (project_id);

-- 8. employees + salaries -----------------------------------
create type public.employment_type as enum ('full_time','part_time','contract','intern');

create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users on delete set null,
  full_name       text not null,
  email           text,
  phone           text,
  role            text,                                          -- job title
  employment_type employment_type not null default 'full_time',
  base_salary     numeric(14,2) not null default 0,              -- monthly LKR
  joined_on       date,
  active          boolean not null default true,
  photo_url       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.employees (active);

-- now wire profiles.employee_id forward reference
alter table public.profiles
  add constraint profiles_employee_id_fk
  foreign key (employee_id) references public.employees(id) on delete set null;

create type public.salary_status as enum ('pending','paid');

create table public.salaries (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references auth.users on delete set null,
  employee_id  uuid not null references public.employees on delete cascade,
  period_year  smallint not null check (period_year between 2000 and 2100),
  period_month smallint not null check (period_month between 1 and 12),
  amount       numeric(14,2) not null,
  bonus        numeric(14,2) not null default 0,
  deductions   numeric(14,2) not null default 0,
  net_amount   numeric(14,2) not null,
  status       salary_status not null default 'pending',
  paid_on      date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, period_year, period_month)
);
create index on public.salaries (period_year, period_month);
create index on public.salaries (employee_id);
create index on public.salaries (status);

-- now wire expenses.salary_id back to salaries
alter table public.expenses
  add constraint expenses_salary_id_fk
  foreign key (salary_id) references public.salaries(id) on delete set null;

-- pay_salary: atomically mark paid + create linked expense
create or replace function public.pay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; emp_name text;
begin
  if not is_super_admin() then
    raise exception 'forbidden';
  end if;
  select * into s from public.salaries where id = p_salary_id for update;
  if s.status = 'paid' then return; end if;
  select full_name into emp_name from public.employees where id = s.employee_id;
  update public.salaries
    set status = 'paid', paid_on = current_date
    where id = p_salary_id;
  insert into public.expenses
    (created_by, category, description, amount, expense_date, salary_id)
  values
    (auth.uid(), 'Salary',
     'Salary — ' || emp_name || ' — ' || s.period_year || '-' || lpad(s.period_month::text,2,'0'),
     s.net_amount, current_date, p_salary_id);
end $$;

-- unpay_salary: reverse the above
create or replace function public.unpay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  delete from public.expenses where salary_id = p_salary_id;
  update public.salaries
    set status = 'pending', paid_on = null
    where id = p_salary_id;
end $$;

-- 9. Kanban: columns, tasks, labels, comments, attachments, checklist, activity
create table public.task_columns (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users on delete set null,
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.task_columns (project_id, position);

create type public.task_priority as enum ('low','medium','high','urgent');

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid references auth.users on delete set null,
  project_id    uuid not null references public.projects on delete cascade,
  column_id     uuid not null references public.task_columns on delete cascade,
  title         text not null,
  description   text,
  assignee_id   uuid references public.profiles on delete set null,  -- assignee = system user
  priority      task_priority not null default 'medium',
  due_date      date,
  position      integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.tasks (project_id, column_id, position);
create index on public.tasks (assignee_id);
create index on public.tasks (due_date);

create table public.task_labels (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);
create index on public.task_labels (project_id);

create table public.task_label_assignments (
  task_id  uuid not null references public.tasks on delete cascade,
  label_id uuid not null references public.task_labels on delete cascade,
  primary key (task_id, label_id)
);
create index on public.task_label_assignments (label_id);

create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  body       text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.task_checklist_items (task_id, position);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  author_id  uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks on delete cascade,
  uploaded_by  uuid references public.profiles on delete set null,
  file_name    text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   integer,
  created_at   timestamptz not null default now()
);
create index on public.task_attachments (task_id);

create type public.task_activity_kind as enum
  ('created','updated','moved','assigned','commented','completed','reopened','attached','labeled','unlabeled');

create table public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  actor_id   uuid not null references public.profiles on delete cascade,
  kind       task_activity_kind not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index on public.task_activity (task_id, created_at desc);

-- move_task: optimistic-friendly atomic move + reorder
create or replace function public.move_task(
  p_task_id uuid, p_new_column_id uuid, p_new_position integer
) returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into t from public.tasks where id = p_task_id for update;
  -- shift target column to make room
  update public.tasks
    set position = position + 1
    where column_id = p_new_column_id
      and position >= p_new_position
      and id <> p_task_id;
  -- close gap in source column if different
  if t.column_id <> p_new_column_id then
    update public.tasks
      set position = position - 1
      where column_id = t.column_id and position > t.position;
  end if;
  -- move the task
  update public.tasks
    set column_id = p_new_column_id, position = p_new_position, updated_at = now()
    where id = p_task_id;
  -- audit
  insert into public.task_activity (task_id, actor_id, kind, payload)
  values (p_task_id, auth.uid(), 'moved',
          jsonb_build_object('from_column', t.column_id, 'to_column', p_new_column_id,
                             'from_position', t.position, 'to_position', p_new_position));
end $$;

-- 10. updated_at triggers ----------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles','customers','projects','invoices','invoice_items','expenses',
      'employees','salaries','task_columns','tasks','task_comments'
    ])
  loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$s
         for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- 11. Enable RLS on all tables -----------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'profiles','org_counters',
      'customers','projects','project_updates','invoices','invoice_items','expenses',
      'employees','salaries',
      'task_columns','tasks','task_labels','task_label_assignments',
      'task_checklist_items','task_comments','task_attachments','task_activity'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- 12. RLS policies -----------------------------------------

-- profiles: read = any authenticated; write = super_admin (+ self update)
create policy "auth read profiles"      on public.profiles for select using (auth.uid() is not null);
create policy "admin all profiles"      on public.profiles for all    using (is_super_admin()) with check (is_super_admin());
create policy "self update profile"     on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- org_counters: read any auth; write only via SECURITY DEFINER function (no policy = denied)
create policy "auth read counter"       on public.org_counters for select using (auth.uid() is not null);

-- shared business tables: any authenticated read+write
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'customers','projects','project_updates','invoices','invoice_items','expenses',
      'task_columns','tasks','task_labels','task_label_assignments',
      'task_checklist_items','task_comments','task_attachments','task_activity'
    ])
  loop
    execute format($p$create policy "auth read"  on public.%1$I for select using (auth.uid() is not null);$p$, t);
    execute format($p$create policy "auth write" on public.%1$I for all    using (auth.uid() is not null) with check (auth.uid() is not null);$p$, t);
  end loop;
end $$;

-- HR tables: super_admin only
create policy "admin all employees"     on public.employees for all using (is_super_admin()) with check (is_super_admin());
create policy "admin all salaries"      on public.salaries  for all using (is_super_admin()) with check (is_super_admin());

-- 13. Realtime publication for kanban ---------------------
alter publication supabase_realtime
  add table public.tasks, public.task_columns, public.task_comments, public.task_checklist_items;
```

### A.3 Storage buckets + RLS

Three private buckets. Path conventions (no per-user prefix — shared workspace):

| Bucket | Path | Read | Write | Delete |
|---|---|---|---|---|
| `task-attachments` | `tasks/{task_id}/{filename}` | any auth | any auth | any auth |
| `invoice-receipts` | `expenses/{expense_id}/{filename}` | any auth | any auth | any auth |
| `employee-photos` | `employees/{employee_id}/{filename}` | any auth | super_admin | super_admin |

```sql
-- storage.objects RLS (run after creating the three buckets in dashboard)
create policy "auth read all buckets"
  on storage.objects for select
  using (bucket_id in ('task-attachments','invoice-receipts','employee-photos')
         and auth.uid() is not null);

create policy "auth write tasks/expenses"
  on storage.objects for insert
  with check (bucket_id in ('task-attachments','invoice-receipts')
              and auth.uid() is not null);

create policy "auth delete tasks/expenses"
  on storage.objects for delete
  using (bucket_id in ('task-attachments','invoice-receipts')
         and auth.uid() is not null);

create policy "admin write employee-photos"
  on storage.objects for insert
  with check (bucket_id = 'employee-photos' and is_super_admin());

create policy "admin delete employee-photos"
  on storage.objects for delete
  using (bucket_id = 'employee-photos' and is_super_admin());
```

### A.4 Default kanban columns

Created **client-side on project create** (one less SQL function to maintain, and the user wants configurability). Default set: `To Do`, `In Progress`, `In Review`, `Done`.

---

## B. Folder Structure

```
weddz-pm/
├── public/
│   └── favicon.svg
├── process/
│   ├── 00-MASTER-PLAN.md
│   ├── 01-change-rename-and-multiuser.md
│   ├── 02-phase-foundation.md
│   └── ...
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/
│       └── create-team-member/
│           └── index.ts
├── src/
│   ├── main.jsx                       # ReactDOM root, Router, providers
│   ├── App.jsx                        # route tree
│   ├── index.css                      # Tailwind + globals
│   │
│   ├── lib/
│   │   ├── supabase.js                # createClient singleton
│   │   ├── format.js                  # formatLKR, formatDate
│   │   ├── invoice.js                 # next_invoice_number RPC wrapper
│   │   ├── storage.js                 # upload/delete helpers
│   │   ├── motion.js                  # framer-motion presets
│   │   └── cn.js                      # clsx + tailwind-merge
│   │
│   ├── context/
│   │   ├── AuthContext.jsx            # session + profile (with role)
│   │   └── ToastContext.jsx           # global toast queue
│   │
│   ├── hooks/
│   │   ├── useSupabaseQuery.js
│   │   ├── useDebounce.js
│   │   ├── useDisclosure.js
│   │   └── useRealtime.js
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Topbar.jsx
│   │   │   └── PageHeader.jsx
│   │   ├── ui/
│   │   │   ├── Button.jsx, Input.jsx, Select.jsx, Textarea.jsx
│   │   │   ├── Modal.jsx, Drawer.jsx, Card.jsx, StatCard.jsx
│   │   │   ├── Badge.jsx, Table.jsx, EmptyState.jsx, Spinner.jsx
│   │   │   ├── Toast.jsx, ConfirmDialog.jsx, Avatar.jsx
│   │   │   ├── Tabs.jsx, DropdownMenu.jsx, DatePicker.jsx
│   │   ├── ProtectedRoute.jsx         # gate by auth
│   │   └── RoleGate.jsx               # gate by role (super_admin only)
│   │
│   ├── features/
│   │   ├── auth/                      (LoginPage, SignupPage [setup-only], ForgotPasswordPage)
│   │   ├── admin/                     (UsersListPage, AddTeamMemberModal, EditTeamMemberModal, api.js)
│   │   ├── dashboard/                 (DashboardPage + StatCardsRow, RecentProjects, UpcomingInvoices)
│   │   ├── customers/                 (List, Detail, FormModal, Card, Context, api)
│   │   ├── projects/                  (List, Detail, FormModal, StatusBadge, UpdatesLog, Context, api)
│   │   ├── invoices/                  (List, Detail, Print, FormModal, StatusBadge, LineItems, api)
│   │   ├── expenses/                  (List, FormModal, CategoryFilter, MonthlySummary, api)
│   │   ├── employees/                 (List, Detail, Salaries, FormModals, api)
│   │   ├── tasks/                     (BoardPage + Board, Column, TaskCard, DetailDrawer, Comments, Checklist, Attachments, Labels, Activity, Filters, useBoardRealtime, api)
│   │   └── insights/                  (InsightsPage + Revenue/Profitability/Trends/TopCustomers/CashFlow charts)
│   │
│   └── routes.jsx
│
├── .env.example
├── .env.local                                    # gitignored
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vercel.json
└── vite.config.js
```

---

## C. Routes Map

| Path | Component | Auth | Role | Notes |
|---|---|---|---|---|
| `/login` | `auth/pages/LoginPage` | public | — | redirect → `/` if signed in |
| `/signup` | `auth/pages/SignupPage` | public | — | first-user bootstrap; later disabled in Supabase Auth |
| `/forgot-password` | `auth/pages/ForgotPasswordPage` | public | — | |
| `/` | `dashboard/pages/DashboardPage` | required | any | inside `<AppShell>` |
| `/customers` | `customers/pages/CustomersListPage` | required | any | |
| `/customers/:id` | `customers/pages/CustomerDetailPage` | required | any | tabs: Overview / Projects / Invoices |
| `/projects` | `projects/pages/ProjectsListPage` | required | any | status filter |
| `/projects/:id` | `projects/pages/ProjectDetailPage` | required | any | tabs: Overview / Updates / Invoices / Expenses |
| `/projects/:id/board` | `tasks/pages/BoardPage` | required | any | kanban |
| `/invoices` | `invoices/pages/InvoicesListPage` | required | any | |
| `/invoices/:id` | `invoices/pages/InvoiceDetailPage` | required | any | |
| `/invoices/:id/print` | `invoices/pages/InvoicePrintPage` | required | any | print-friendly |
| `/expenses` | `expenses/pages/ExpensesListPage` | required | any | |
| `/employees` | `employees/pages/EmployeesListPage` | required | **super_admin** | gated by RoleGate |
| `/employees/:id` | `employees/pages/EmployeeDetailPage` | required | **super_admin** | salary history |
| `/salaries` | `employees/pages/SalariesPage` | required | **super_admin** | bulk-generate monthly run |
| `/insights` | `insights/pages/InsightsPage` | required | any | charts |
| `/admin/users` | `admin/pages/UsersListPage` | required | **super_admin** | add/edit team members |
| `*` | `NotFoundPage` | — | — | |

---

## D. Component Inventory

UI (`components/ui/`): **Button, Input, Select, Textarea, Modal, Drawer, Card, StatCard, Badge, Table, EmptyState, Spinner, Toast, ConfirmDialog, Avatar, Tabs, DropdownMenu, DatePicker**.

Layout (`components/layout/`): **AppShell, Sidebar, Topbar, PageHeader**.

Gates: **ProtectedRoute** (auth) + **RoleGate** (role).

Feature highlights: **StatCardsRow, RecentProjects, UpcomingInvoices, CustomerFormModal, ProjectFormModal, InvoiceFormModal, ExpenseFormModal, EmployeeFormModal, SalaryFormModal, AddTeamMemberModal, EditTeamMemberModal, InvoiceLineItems, MonthlySummary, Board, Column, TaskCard, TaskDetailDrawer, TaskCommentsThread, TaskChecklist, TaskAttachments, TaskLabels, TaskActivityFeed, BoardFilters, RevenueVsExpensesChart, ProjectProfitabilityTable, MonthlyTrendsChart, TopCustomersChart, CashFlowChart, NotFoundPage**.

---

## E. Build Phases

Each phase = one MD file in `process/`, one or more git commits, one shippable build.

### Phase 01 — Foundation (`process/02-phase-foundation.md`)
- `npm create vite@latest . -- --template react` (scaffold into current dir).
- Install: `tailwindcss postcss autoprefixer react-router-dom @supabase/supabase-js framer-motion lucide-react clsx tailwind-merge recharts @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities date-fns`.
- Configure Tailwind (theme tokens: indigo primary, glass surfaces).
- Wire `lib/cn.js`, `lib/format.js`, `lib/supabase.js`, `lib/motion.js`.
- `.env.example`, `.env.local`, `.gitignore` (already exists), `vercel.json`.
- Empty `App.jsx` shell, `main.jsx` providers stack.
- **Acceptance:** `npm run dev` shows blank "WEDDZ PM" page; `npm run build` succeeds.

### Phase 02 — Database + Supabase Backend (`process/03-phase-database.md`)
- Create Supabase project (free), region Singapore.
- Run `001_initial_schema.sql`.
- Create three storage buckets (private) + storage RLS.
- In Auth → Providers → Email: turn off "Confirm email".
- Write Edge Function `supabase/functions/create-team-member/index.ts`.
- Deploy: `supabase functions deploy create-team-member`.
- Set secret: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`.
- **Acceptance:** `select next_invoice_number()` returns `INV-0001`; Edge Function URL responds 401 to anonymous calls.

### Phase 03 — Auth + Layout (`process/04-phase-auth-layout.md`)
- AuthContext: session + profile (with role).
- LoginPage, SignupPage (only for first-user bootstrap), ForgotPasswordPage.
- ProtectedRoute, AppShell, Sidebar (role-aware nav: hides admin/HR for members), Topbar.
- routes.jsx wired with placeholder pages.
- Toast system.
- **Acceptance:** sign up the founder, AuthContext shows `role === 'super_admin'`. Sign out works. Hard refresh keeps session.

### Phase 04 — Team Members & Roles (`process/05-phase-team-members.md`)
- RoleGate component: redirects to `/` if user lacks required role.
- `/admin/users` page: list profiles (table with role badge, avatar, active toggle).
- AddTeamMemberModal: email, full name, password, role select. Submits to Edge Function via fetch with `Authorization: Bearer <jwt>`.
- EditTeamMemberModal: change role, deactivate, edit name.
- Self-update via Topbar profile menu (full_name, avatar).
- **Acceptance:** super_admin signs in, adds a member, signs out, signs in as that member, sees no `/admin/users` link in sidebar; if they navigate to it directly, they're redirected.

### Phase 05 — Customers (`process/06-phase-customers.md`)
- CustomersContext + api.js (list/get/create/update/delete).
- List page (search, sort, table, empty state, motion stagger).
- Detail page (tabs Overview / Projects / Invoices — latter two empty until later phases).
- CustomerFormModal (create + edit).
- "Created by …" shown via join to profiles.
- Confirm-delete dialog.
- **Acceptance:** full CRUD; both a super_admin and a member can read+write.

### Phase 06 — Projects (`process/07-phase-projects.md`)
- Same shape as customers + customer_id FK select.
- Status filter chips.
- Detail page tabs: Overview / Updates / Invoices / Expenses.
- project_updates add/list (immutable timeline).
- On create: insert default 4 task_columns.
- **Acceptance:** creating a project also creates 4 columns visible in DB.

### Phase 07 — Invoices (`process/08-phase-invoices.md`)
- Auto-numbering via `next_invoice_number()` RPC.
- Line items repeater; recompute subtotal/tax/total client-side; persist on save.
- Status filter; "Mark as Paid" sets status + paid_at.
- Print route `/invoices/:id/print` — A4-styled, `@media print` hides the chrome.
- **Acceptance:** create three invoices; they're `INV-0001/0002/0003` even under concurrent inserts (verify in two tabs).

### Phase 08 — Expenses (`process/09-phase-expenses.md`)
- General + project-linked split (UI shows pill "General" or project name).
- Category filter; month selector.
- MonthlySummary card (current-month total + per-category breakdown).
- Optional receipt upload to `invoice-receipts` bucket.
- **Acceptance:** monthly total matches sum of rows for that month.

### Phase 09 — Employees + Salaries (`process/10-phase-employees-salary.md`)
- Employees CRUD (super_admin only) + photo upload.
- Salaries page: month selector + employee list with status pill.
- "Generate this month's salaries" — bulk-insert one row per active employee at base_salary.
- Mark-as-paid → calls `pay_salary(salary_id)` RPC (atomic). Reverse via `unpay_salary`.
- **Acceptance:** marking salary paid creates an `expenses` row with `category='Salary'` and matching amount; reverting deletes it.

### Phase 10 — Kanban (`process/11-phase-kanban.md`) — biggest phase
- Board page: fetch columns + tasks ordered by position.
- @dnd-kit/core + sortable: vertical-in-column + cross-column drag.
- On drop: optimistic local + `move_task(task_id, new_column_id, new_position)` RPC.
- Task detail drawer: description, comments, checklist, attachments, labels, activity feed.
- Filters: assignee/label/priority/due (client-side).
- Realtime: subscribe to tasks + task_columns + task_comments + task_checklist_items by project_id.
- Configurable columns: rename, add, delete (reassign-tasks dialog), reorder.
- **Acceptance:** open board in two browsers; drag in one, see move in the other within ~1s.

### Phase 11 — Dashboard (`process/12-phase-dashboard.md`)
- Real data for stat cards (customers, active projects, unpaid invoices sum, monthly expenses).
- Recent projects (5), upcoming invoices (next 7 days).
- Welcome heading using profile.full_name.
- **Acceptance:** numbers match manual SQL.

### Phase 12 — Insights (`process/13-phase-insights.md`)
- Recharts charts.
- Aggregation in SQL views: `v_monthly_revenue_expenses`, `v_project_profitability`, `v_top_customers`, `v_cash_flow`.
- All views are SECURITY INVOKER → respect RLS automatically.
- **Acceptance:** at least one entry per chart shown after seeded sample data.

### Phase 13 — Polish + Deploy (`process/14-phase-polish-deploy.md`)
- Animation pass (page transitions, hover lifts, button press, modals/drawers, toast).
- A11y pass (focus rings, ARIA, ESC closes, tab order).
- Empty states + loading skeletons everywhere.
- Mobile responsive (sidebar → drawer below `lg`).
- 404 page.
- README + screenshots.
- Push to GitHub, import to Vercel, set env vars, deploy.
- Re-deploy Edge Function (`supabase functions deploy create-team-member`).
- Disable public signup in Supabase Auth settings.
- **Acceptance:** prod URL passes phase 1–12 manual checklist.

---

## F. Drag-and-Drop Library

**Choice: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.**

`react-beautiful-dnd` is archived (2024) and warns on React 18 strict mode. `@dnd-kit` is actively maintained, ~10 KB, supports keyboard a11y out of the box, has first-class sortable utilities for kanban patterns, and includes free auto-scroll on drag. Verbose API absorbed once in `Board.jsx`.

---

## G. Charts Library

**Choice: Recharts.**

Composable JSX (not imperative), MIT, ~100 KB gz, sufficient for line/area/bar/pie/stacked. Built on D3 internals. Right tradeoff for internal dashboards.

---

## H. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Supabase free tier 500 MB DB | Internal use; ~10 employees × 1k tasks/yr × 200B ≈ 2 MB. Safe for years. |
| Storage 1 GB | Compress images client-side; cap attachment size 10 MB. |
| 50k MAU | Trivial — internal team <50. |
| Edge Function 500k invocations/mo | We invoke only on Add/Edit Team Member — well under. |
| Realtime quota | Subscribe only on board page; unsubscribe on unmount. |
| Vercel 100 GB bw | ~5 MB/session × 200/day ≈ 30 GB/mo. Safe. |
| RLS on joins | Composite indexes. Pre-test queries as authenticated user. |
| Invoice number race | Atomic `next_invoice_number()` SQL function + `unique(invoice_no)`. |
| Drag reorder write storm | One RPC per drop, compacts only affected columns. |
| Kanban realtime conflicts | Last-write-wins; tiny "synced" toast. |
| Salary↔Expense desync | Both writes inside `pay_salary` SECURITY DEFINER function; rollback on either side. |
| First-user-bootstrap race | Trigger is atomic; only the *first* INSERT promotes. Disable public signup right after first signup. |
| Service role key leakage | Lives only in Edge Function secret. **Never** in `.env.local`, **never** in client. |
| Member access too broad/narrow | Two-role model is intentionally simple. Add `admin` middle tier later if needed (single-line enum + RLS update). |
| Print invoice fonts | System fonts in `@media print`; test in Chrome's print preview. |
| Date timezones | Store as `date` (not `timestamptz`) for issue/due/period — avoids UTC shifts at midnight LK time. |
| LKR formatting | `Intl.NumberFormat('en-LK')` with fallback hand-format. |

---

## I. Vercel & Supabase Config

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

**Environment variables (client — `VITE_` prefix):**

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_NAME=WEDDZ PM
```

The anon key is safe to expose because RLS gates everything.

**Edge Function secrets (Supabase, NEVER client):**

```
SUPABASE_URL=…           # auto-injected
SUPABASE_ANON_KEY=…      # auto-injected
SUPABASE_SERVICE_ROLE_KEY=…  # set via `supabase secrets set` ← required
```

**Build output:** `dist/`. **Node:** 20 LTS.

---

## J. Step-by-step Setup (Non-developer)

1. **Sign up Supabase** at supabase.com. Region: Singapore (ap-southeast-1).
2. **SQL Editor** → run `supabase/migrations/001_initial_schema.sql`.
3. **Storage** → create three private buckets (`task-attachments`, `invoice-receipts`, `employee-photos`). Then SQL Editor → run storage RLS block.
4. **Auth → Providers → Email** → toggle off "Confirm email". (For now, leave "Enable signups" on — we need it for the founder's first signup.)
5. **Install Supabase CLI** → log in (`supabase login`) → link project (`supabase link --project-ref <id>`).
6. **Set Edge Function secret:** `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<paste from Project Settings → API>`.
7. **Deploy Edge Function:** `supabase functions deploy create-team-member`.
8. **Project Settings → API** → copy Project URL + anon key.
9. **Install Node 20 LTS**.
10. **Clone** the repo: `git clone … && cd "PM tool internal"`.
11. Create `.env.local` with the three `VITE_*` vars from the template above.
12. `npm install && npm run dev` → http://localhost:5173.
13. **Sign up the founder** at `/signup` (this user is auto-promoted to `super_admin`).
14. **Disable public signup**: Supabase → Auth → Providers → Email → toggle "Enable signups" OFF.
15. Sign in as super_admin → `/admin/users` → Add Team Member for each teammate (their email, full name, temp password). They sign in with the temp password and can change it via the profile menu.
16. **Push to GitHub**: create repo "weddz-pm", `git remote add origin …`, `git push -u origin main`.
17. **Vercel**: vercel.com → Add New → Import GitHub repo. Auto-detected as Vite.
18. **Vercel → Environment Variables** → add the three `VITE_*` vars.
19. **Deploy**. Visit `*.vercel.app`.
20. Optional: custom domain `pm.weddz.lk` → Vercel → Domains → DNS at registrar.

---

## K. Conventions & Standards

- **Imports:** absolute via Vite alias `@/` → `src/`.
- **Naming:** PascalCase components, camelCase hooks (`useFoo`), kebab-case for non-component files.
- **Colors:** Tailwind — `indigo-500` primary, `zinc-950` surface base, `white/5..10` glass surfaces, semantic emerald/amber/rose for status.
- **Spacing:** Tailwind 4-pt scale. Cards `rounded-2xl`, inputs `rounded-xl`, buttons `rounded-lg`.
- **Animations:** framer-motion presets in `lib/motion.js` — `fadeIn`, `slideIn`, `pop`. Modals, list rows (stagger 30 ms), nav transitions.
- **Icons:** Lucide React, 16/20 px sizes.
- **Money:** always `formatLKR(value)`. Never raw `toLocaleString`.
- **Dates:** always `formatDate(value)` → `06 May 2026` via `date-fns/format(d, 'dd MMM yyyy')`.
- **API errors:** toast via `useToast()`; never `alert()`.
- **Commits:** conventional (`feat:`, `fix:`, `chore:`, `docs:`); one phase = one or more commits; phase name in body.

---

## Appendix — package.json (Phase 01 baseline)

```json
{
  "name": "weddz-pm",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "@supabase/supabase-js": "^2.45.0",
    "framer-motion": "^11.5.0",
    "lucide-react": "^0.456.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "recharts": "^2.13.0",
    "date-fns": "^4.1.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  },
  "engines": { "node": ">=20" }
}
```

---

**End of master plan.** On approval, Phase 01 begins.
