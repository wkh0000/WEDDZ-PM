# FellowCRM — Master Implementation Plan

**Project:** FellowCRM — Internal PM/CRM for WEDDZ IT (Sri Lanka)
**Stack:** React 18 + Vite + Tailwind + Supabase + Vercel
**Currency:** LKR (`LKR 125,000.00`) | **Date format:** `06 May 2026`
**Status:** Pre-implementation master spec
**Last reviewed:** 2026-05-06

---

## Table of Contents

- [0. Guiding Principles](#0-guiding-principles)
- [A. Database Schema](#a-database-schema)
- [B. Folder Structure](#b-folder-structure)
- [C. Routes Map](#c-routes-map)
- [D. Component Inventory](#d-component-inventory)
- [E. Build Phases (12 phases)](#e-build-phases)
- [F. Drag-and-Drop Library Choice](#f-drag-and-drop-library)
- [G. Charts Library](#g-charts-library)
- [H. Risks & Tradeoffs](#h-risks--tradeoffs)
- [I. Vercel Config](#i-vercel-config)
- [J. Step-by-step Setup (Non-developer)](#j-step-by-step-setup-non-developer)
- [K. Conventions & Standards](#k-conventions--standards)

---

## 0. Guiding Principles

1. **Single-tenant per Supabase user.** Every row belongs to a `user_id`; RLS enforces it. No multi-org logic — this is internal to WEDDZ IT and one team uses one Supabase project. The `user_id` column on every table is the trust boundary.
2. **Free tier only.** All choices honor Supabase free (500 MB DB, 1 GB storage, 50k MAU) and Vercel hobby (100 GB bw/mo). For ~5–20 internal users this is plenty.
3. **Feature folders, not type folders.** Code that changes together lives together — see § B.
4. **No UI library.** Pure Tailwind + a few headless utilities only when accessibility is hard to roll. **Default: hand-roll.**
5. **One global `AppContext` is too coarse.** Each feature gets its own context (`CustomersContext`, `ProjectsContext`, …) so re-renders stay local.
6. **Supabase = source of truth.** Optimistic UI for snappy feel, but every mutation round-trips and reconciles.
7. **Phases are independently shippable.** Each phase ends in a green build and a `git commit` you could deploy.

---

## A. Database Schema

### A.1 Design decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Drag-drop ordering | **Integer `position` column, reorder-on-write** | <100 tasks per column for an internal tool. Lexorank is overkill. We `UPDATE … SET position = position + 1 WHERE position >= $new` on insert/move. |
| Invoice numbering | **Postgres function + per-user counter table** | `count(*)+1` races under concurrent insert. We use a `user_counters` table with `INSERT … ON CONFLICT DO UPDATE` inside a `SECURITY DEFINER` function. Atomic, RLS-safe. |
| `updated_at` | **Trigger on every mutable table** | One reusable `set_updated_at()` function. |
| Activity log | **Dedicated `task_activity` table, NOT JSONB column** | Queryable, paginatable, sortable. JSONB log grows unbounded inside the parent row and bloats reads. |
| Soft delete | **None.** Hard delete with confirmation modals. | Internal tool; restore-from-trash isn't worth the every-query `WHERE deleted_at IS NULL`. |
| UUIDs vs bigint | **UUID v4 (`gen_random_uuid()`)** | Supabase convention; safe to expose in URLs. |
| Money columns | **`numeric(14, 2)`** | Never floats for money. 14 digits handles LKR 999,999,999,999.99. |
| Realtime | **Enabled only on `tasks` and `task_columns`** | Live drag-drop visibility for kanban. Keeps Realtime quota low. |

### A.2 Full migration (`supabase/migrations/001_initial_schema.sql`)

```sql
-- ============================================================
-- 001_initial_schema.sql
-- FellowCRM — full schema, RLS, triggers, functions
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

-- 2. user_counters: per-user invoice number sequence ---------
create table public.user_counters (
  user_id        uuid primary key references auth.users on delete cascade,
  invoice_seq    integer not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.user_counters enable row level security;
create policy "own counter read"  on public.user_counters
  for select using (user_id = auth.uid());
create policy "own counter write" on public.user_counters
  for all    using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.next_invoice_number(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare next_n integer;
begin
  insert into public.user_counters(user_id, invoice_seq)
    values (p_user, 1)
  on conflict (user_id) do update
    set invoice_seq = public.user_counters.invoice_seq + 1,
        updated_at  = now()
  returning invoice_seq into next_n;
  return 'INV-' || lpad(next_n::text, 4, '0');
end $$;

-- 3. customers -----------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  company     text,
  email       text,
  phone       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.customers (user_id);
create index on public.customers (user_id, name);

-- 4. projects ------------------------------------------------
create type public.project_status as enum ('planning','active','on_hold','completed','cancelled');

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
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
create index on public.projects (user_id);
create index on public.projects (user_id, status);
create index on public.projects (customer_id);

create table public.project_updates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  project_id  uuid not null references public.projects on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index on public.project_updates (project_id, created_at desc);

-- 5. invoices ------------------------------------------------
create type public.invoice_status as enum ('draft','sent','paid','overdue','cancelled');

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  customer_id   uuid not null references public.customers on delete restrict,
  project_id    uuid references public.projects on delete set null,
  invoice_no    text not null,
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
  updated_at    timestamptz not null default now(),
  unique (user_id, invoice_no)
);
create index on public.invoices (user_id, status);
create index on public.invoices (customer_id);
create index on public.invoices (project_id);
create index on public.invoices (user_id, due_date);

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0,
  position    integer not null default 0
);
create index on public.invoice_items (invoice_id, position);

-- 6. expenses ------------------------------------------------
create type public.expense_category as enum
  ('Software','Hardware','Travel','Subcontractor','Marketing','Salary','Other');

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
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
create index on public.expenses (user_id, expense_date desc);
create index on public.expenses (user_id, category);
create index on public.expenses (project_id);

-- 7. employees + salaries -----------------------------------
create type public.employment_type as enum ('full_time','part_time','contract','intern');

create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  full_name       text not null,
  email           text,
  phone           text,
  role            text,
  employment_type employment_type not null default 'full_time',
  base_salary     numeric(14,2) not null default 0, -- monthly LKR
  joined_on       date,
  active          boolean not null default true,
  photo_url       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.employees (user_id, active);

create type public.salary_status as enum ('pending','paid');

create table public.salaries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
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
create index on public.salaries (user_id, period_year, period_month);
create index on public.salaries (employee_id);
create index on public.salaries (user_id, status);

-- now wire expenses.salary_id back to salaries
alter table public.expenses
  add constraint expenses_salary_id_fk
  foreign key (salary_id) references public.salaries(id) on delete set null;

-- 8. Kanban: columns, tasks, labels, comments, attachments, checklist, activity
create table public.task_columns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
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
  user_id       uuid not null references auth.users on delete cascade,
  project_id    uuid not null references public.projects on delete cascade,
  column_id     uuid not null references public.task_columns on delete cascade,
  title         text not null,
  description   text,
  assignee_id   uuid references public.employees on delete set null,
  priority      task_priority not null default 'medium',
  due_date      date,
  position      integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.tasks (project_id, column_id, position);
create index on public.tasks (assignee_id);
create index on public.tasks (user_id, due_date);

create table public.task_labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  name       text not null,
  color      text not null default '#6366f1', -- indigo-500 default
  created_at timestamptz not null default now()
);
create index on public.task_labels (project_id);

create table public.task_label_assignments (
  task_id  uuid not null references public.tasks on delete cascade,
  label_id uuid not null references public.task_labels on delete cascade,
  user_id  uuid not null references auth.users on delete cascade,
  primary key (task_id, label_id)
);
create index on public.task_label_assignments (label_id);

create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.task_checklist_items (task_id, position);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  file_name    text not null,
  storage_path text not null,           -- inside 'task-attachments' bucket
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
  user_id    uuid not null references auth.users on delete cascade,
  kind       task_activity_kind not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index on public.task_activity (task_id, created_at desc);

-- 9. updated_at triggers ------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'customers','projects','invoices','invoice_items','expenses',
      'employees','salaries','task_columns','tasks','task_comments'
    ])
  loop
    execute format(
      'create trigger trg_%1$s_updated before update on public.%1$s
         for each row execute function public.set_updated_at();', t
    );
  end loop;
end $$;

-- 10. RLS — enable + policy template ------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'customers','projects','project_updates','invoices','invoice_items',
      'expenses','employees','salaries','task_columns','tasks','task_labels',
      'task_label_assignments','task_checklist_items','task_comments',
      'task_attachments','task_activity'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$create policy "owner read"  on public.%1$I for select using (user_id = auth.uid());$p$, t);
    execute format($p$create policy "owner write" on public.%1$I for all    using (user_id = auth.uid()) with check (user_id = auth.uid());$p$, t);
  end loop;
end $$;

-- 11. Realtime publication for kanban ----------------------
alter publication supabase_realtime add table public.tasks, public.task_columns;
```

### A.3 Storage bucket policies (run separately)

Three private buckets: `task-attachments`, `employee-photos`, `invoice-receipts`. Path convention: `{user_id}/{entity_id}/{filename}`. RLS policy:

```sql
create policy "own files read"
  on storage.objects for select
  using (bucket_id in ('task-attachments','employee-photos','invoice-receipts')
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files write"
  on storage.objects for insert
  with check (bucket_id in ('task-attachments','employee-photos','invoice-receipts')
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own files delete"
  on storage.objects for delete
  using (bucket_id in ('task-attachments','employee-photos','invoice-receipts')
         and (storage.foldername(name))[1] = auth.uid()::text);
```

### A.4 Default kanban columns

Created **client-side on project create** (not via DB trigger) — one less Postgres function to maintain, and the user wants configurability. Default set: `To Do`, `In Progress`, `In Review`, `Done`.

---

## B. Folder Structure

```
fellowcrm/
├── public/
│   └── favicon.svg
├── process/                           # phase tracking MD files (this folder)
│   ├── 00-MASTER-PLAN.md              # this file
│   ├── 01-phase-foundation.md
│   ├── 02-phase-database.md
│   └── ...
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── src/
│   ├── main.jsx                       # ReactDOM root, Router, providers
│   ├── App.jsx                        # route tree
│   ├── index.css                      # Tailwind directives + globals
│   │
│   ├── lib/
│   │   ├── supabase.js                # createClient singleton
│   │   ├── format.js                  # formatLKR, formatDate
│   │   ├── invoice.js                 # nextInvoiceNumber RPC wrapper
│   │   ├── storage.js                 # upload/delete helpers
│   │   └── cn.js                      # clsx + tailwind-merge
│   │
│   ├── context/
│   │   ├── AuthContext.jsx            # session, user, signIn/signOut
│   │   └── ToastContext.jsx           # global toast queue
│   │
│   ├── hooks/
│   │   ├── useSupabaseQuery.js        # generic fetch + cache + invalidate
│   │   ├── useDebounce.js
│   │   ├── useDisclosure.js           # modal open/close
│   │   └── useRealtime.js             # subscribe to a table filter
│   │
│   ├── components/                    # cross-feature
│   │   ├── layout/
│   │   │   ├── AppShell.jsx           # sidebar + header + outlet
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Topbar.jsx
│   │   │   └── PageHeader.jsx
│   │   ├── ui/
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Select.jsx
│   │   │   ├── Textarea.jsx
│   │   │   ├── Modal.jsx              # framer-motion wrapper
│   │   │   ├── Drawer.jsx
│   │   │   ├── Card.jsx               # glassmorphism base
│   │   │   ├── StatCard.jsx
│   │   │   ├── Badge.jsx
│   │   │   ├── Table.jsx
│   │   │   ├── EmptyState.jsx
│   │   │   ├── Spinner.jsx
│   │   │   ├── Toast.jsx
│   │   │   ├── ConfirmDialog.jsx
│   │   │   ├── Avatar.jsx
│   │   │   ├── Tabs.jsx
│   │   │   ├── DropdownMenu.jsx
│   │   │   └── DatePicker.jsx
│   │   └── ProtectedRoute.jsx
│   │
│   ├── features/
│   │   ├── auth/        (LoginPage, SignupPage, ForgotPasswordPage)
│   │   ├── dashboard/   (DashboardPage + StatCardsRow, RecentProjects, UpcomingInvoices)
│   │   ├── customers/   (List, Detail, FormModal, Card, Context, api)
│   │   ├── projects/    (List, Detail, FormModal, StatusBadge, UpdatesLog, Context, api)
│   │   ├── invoices/    (List, Detail, Print, FormModal, StatusBadge, LineItems, api)
│   │   ├── expenses/    (List, FormModal, CategoryFilter, MonthlySummary, api)
│   │   ├── employees/   (List, Detail, Salaries, FormModals, api with salary→expense roll-up)
│   │   ├── tasks/       (BoardPage + Board, Column, TaskCard, DetailDrawer, Comments, Checklist, Attachments, Labels, Activity, Filters, useBoardRealtime, api)
│   │   └── insights/    (InsightsPage + Revenue/Profitability/Trends/TopCustomers/CashFlow charts)
│   │
│   └── routes.jsx                                # route table
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

**Why feature folders:** when you change "invoices," you touch one folder. Pages, components, API calls, context — all colocated. Shared `components/ui/` only holds the genuinely cross-cutting stuff.

---

## C. Routes Map

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/login` | `auth/pages/LoginPage` | public | redirect → `/` if signed in |
| `/signup` | `auth/pages/SignupPage` | public | optionally disabled in production via env flag |
| `/forgot-password` | `auth/pages/ForgotPasswordPage` | public | |
| `/` | `dashboard/pages/DashboardPage` | required | inside `<AppShell>` |
| `/customers` | `customers/pages/CustomersListPage` | required | |
| `/customers/:id` | `customers/pages/CustomerDetailPage` | required | tabs: Overview / Projects / Invoices |
| `/projects` | `projects/pages/ProjectsListPage` | required | status filter |
| `/projects/:id` | `projects/pages/ProjectDetailPage` | required | tabs: Overview / Updates / Invoices / Expenses |
| `/projects/:id/board` | `tasks/pages/BoardPage` | required | kanban |
| `/invoices` | `invoices/pages/InvoicesListPage` | required | status filter |
| `/invoices/:id` | `invoices/pages/InvoiceDetailPage` | required | |
| `/invoices/:id/print` | `invoices/pages/InvoicePrintPage` | required | layout-less, print-friendly |
| `/expenses` | `expenses/pages/ExpensesListPage` | required | category filter, month selector |
| `/employees` | `employees/pages/EmployeesListPage` | required | |
| `/employees/:id` | `employees/pages/EmployeeDetailPage` | required | salary history |
| `/salaries` | `employees/pages/SalariesPage` | required | bulk-generate monthly run |
| `/insights` | `insights/pages/InsightsPage` | required | charts |
| `*` | `NotFoundPage` | — | |

---

## D. Component Inventory

UI primitives (`components/ui/`): **Button, Input, Select, Textarea, Modal, Drawer, Card, StatCard, Badge, Table, EmptyState, Spinner, Toast, ConfirmDialog, Avatar, Tabs, DropdownMenu, DatePicker**.

Layout (`components/layout/`): **AppShell, Sidebar, Topbar, PageHeader**.

Feature highlights: **StatCardsRow, RecentProjects, UpcomingInvoices, CustomerFormModal, ProjectFormModal, InvoiceFormModal, ExpenseFormModal, EmployeeFormModal, SalaryFormModal, InvoiceLineItems, MonthlySummary, Board, Column, TaskCard, TaskDetailDrawer, TaskCommentsThread, TaskChecklist, TaskAttachments, TaskLabels, TaskActivityFeed, BoardFilters, RevenueVsExpensesChart, ProjectProfitabilityTable, MonthlyTrendsChart, TopCustomersChart, CashFlowChart, ProtectedRoute, NotFoundPage**.

---

## E. Build Phases

Each phase = one MD file in `process/`, one or more git commits, one shippable build.

### Phase 01 — Foundation (`process/01-phase-foundation.md`)
- Vite + React scaffold; install all dependencies.
- Configure Tailwind theme tokens (indigo primary, glass surfaces).
- Wire `lib/cn.js`, `lib/format.js`, `lib/supabase.js`.
- `.env.example`, `.env.local`, `.gitignore`, `vercel.json`.
- **Acceptance:** `npm run dev` shows blank "FellowCRM" page; `npm run build` succeeds.

### Phase 02 — Database & Supabase wiring (`process/02-phase-database.md`)
- Create Supabase project (free tier), region Singapore.
- Run `001_initial_schema.sql`.
- Create three storage buckets + storage RLS.
- Smoke test: `select next_invoice_number(auth.uid())` returns `INV-0001`.
- **Acceptance:** schema visible; RLS enabled on every table.

### Phase 03 — Auth + Layout (`process/03-phase-auth-layout.md`)
- AuthContext (session, user, signIn/signOut/signUp).
- LoginPage, SignupPage, ForgotPasswordPage.
- ProtectedRoute, AppShell, Sidebar, Topbar.
- routes.jsx wired with placeholder pages.
- Toast system.
- **Acceptance:** sign up via UI, redirect to `/`, sign out works, hard refresh stays logged in.

### Phase 04 — Customers (`process/04-phase-customers.md`)
- CustomersContext + api.js (list/get/create/update/delete).
- List page (search, sort, table, empty state, motion stagger).
- Detail page (tabs Overview / Projects / Invoices).
- CustomerFormModal (create + edit).
- Confirm-delete dialog.
- **Acceptance:** full CRUD; RLS verified by signing in as another user (no leaks).

### Phase 05 — Projects (`process/05-phase-projects.md`)
- Same shape as customers + customer_id FK select.
- Status filter chips.
- Detail page tabs: Overview / Updates / Invoices / Expenses.
- project_updates add/list (immutable).
- On create: insert default 4 task_columns.
- **Acceptance:** creating a project also creates 4 columns.

### Phase 06 — Invoices (`process/06-phase-invoices.md`)
- Auto-numbering via next_invoice_number RPC.
- Line items repeater; recompute subtotal/tax/total.
- Status filter; Mark as Paid action.
- Print route `/invoices/:id/print` — A4-styled.
- **Acceptance:** create three invoices, numbers `INV-0001/0002/0003` even under concurrent inserts.

### Phase 07 — Expenses (`process/07-phase-expenses.md`)
- General + project-linked split.
- Category filter; month selector.
- MonthlySummary card.
- Receipt upload to invoice-receipts bucket.
- **Acceptance:** monthly total matches sum of rows for that month.

### Phase 08 — Employees + Salaries (`process/08-phase-employees-salary.md`)
- Employees CRUD + photo upload.
- Salaries page with month selector.
- Generate-this-month bulk insert at base_salary.
- Mark-as-paid: transactional RPC `pay_salary(salary_id)` updates salary + inserts mirrored expense row (category Salary, salary_id linked).
- **Acceptance:** marking a salary paid adds an expense; reversing removes it.

### Phase 09 — Kanban (`process/09-phase-kanban.md`)
- Board page: fetch columns + tasks ordered by position.
- @dnd-kit/core + sortable: vertical-in-column + cross-column drag.
- On drop: optimistic local + RPC `move_task(task_id, new_column_id, new_position)` that compacts positions.
- Task detail drawer: description, comments, checklist, attachments, labels, activity feed.
- Filters: assignee/label/priority/due (client-side).
- Realtime: subscribe to tasks + task_columns by project_id.
- Configurable columns: rename, add, delete (reassign-tasks dialog), reorder.
- **Acceptance:** open board in two browsers; drag in one, see move in the other within ~1s.

### Phase 10 — Dashboard (`process/10-phase-dashboard.md`)
- Real data for stat cards (customers, active projects, unpaid invoices sum, monthly expenses).
- Recent projects (5), upcoming invoices (next 7 days).
- Welcome heading using user metadata.
- **Acceptance:** numbers match manual SQL.

### Phase 11 — Insights (`process/11-phase-insights.md`)
- Recharts charts.
- Aggregation in SQL views: v_monthly_revenue_expenses, v_project_profitability, v_top_customers, v_cash_flow.
- **Acceptance:** at least one entry per chart shown after seeded sample data.

### Phase 12 — Polish + Deploy (`process/12-phase-polish-deploy.md`)
- Animation pass (page transitions, hover lifts, button press, modals/drawers, toast).
- A11y pass (focus rings, ARIA, ESC, tab order).
- Empty states + loading skeletons.
- Mobile responsive (sidebar → drawer below `lg`).
- 404 page.
- README + screenshots.
- Push to GitHub, import to Vercel, set env, deploy.
- **Acceptance:** prod URL passes all phase 1–11 manual checks.

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
| Realtime quota | Subscribe only on board page; unsubscribe on unmount. |
| Vercel 100 GB bw | ~5 MB/session × 200/day ≈ 30 GB/mo. Safe. |
| RLS on joins | Composite indexes on `(user_id, fk)`. Pre-test queries as authenticated user. |
| Invoice number race | Atomic `next_invoice_number()` SQL function + `unique(user_id, invoice_no)`. |
| Drag reorder write storm | One RPC per drop, compacts only affected columns. |
| Kanban realtime conflicts | Last-write-wins; tiny "synced" toast. |
| Salary↔Expense desync | Both writes inside one Postgres function (`pay_salary`); rollback on either side. |
| Print invoice fonts | System fonts in `@media print`; test in Chrome's print preview. |
| Date timezones | Store as `date` (not `timestamptz`) for issue/due/period — avoids UTC shifts at midnight LK time. |
| LKR formatting | `Intl.NumberFormat('en-LK')` with fallback hand-format. |

---

## I. Vercel Config

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

**Environment variables (all `VITE_` prefixed):**

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_DISABLE_SIGNUP=true        # production: only existing users sign in
VITE_APP_NAME=FellowCRM
```

The anon key is safe to expose because RLS gates everything. Service-role key never used or committed.

**Build output:** `dist/`. **Node:** 20 LTS.

---

## J. Step-by-step Setup (Non-developer)

1. **Sign up Supabase** at supabase.com. Region: Singapore (ap-southeast-1).
2. **SQL Editor** → run `001_initial_schema.sql`.
3. **Storage** → create three private buckets (`task-attachments`, `employee-photos`, `invoice-receipts`) → run storage RLS SQL.
4. **Project Settings → API** → copy Project URL + anon key.
5. **Install Node 20 LTS**.
6. **Clone** the repo: `git clone … && cd fellowcrm`.
7. Create `.env.local` with the four `VITE_*` vars.
8. `npm install && npm run dev` → http://localhost:5173.
9. Sign up first user (disable email confirmation in Supabase Auth → Providers for instant login).
10. Verify dashboard loads.
11. Push to GitHub.
12. Vercel → Add New → Import GitHub repo. Auto-detected as Vite.
13. Vercel → Environment Variables → add the four vars (`VITE_DISABLE_SIGNUP=true` for prod).
14. Deploy. Visit `*.vercel.app`.
15. Optional: custom domain `crm.weddz.lk`.

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

## Appendix — Package list (Phase 01)

```json
{
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
  }
}
```

---

**End of master plan.** On approval, Phase 01 begins by scaffolding Vite + Tailwind and committing `process/01-phase-foundation.md`.
