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
do $$ begin
  create type public.user_role as enum ('super_admin','member');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'member',
  employee_id uuid,
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_profiles_role   on public.profiles (role);
create index if not exists idx_profiles_active on public.profiles (active);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active
  )
$$;

-- 3. Single-row counter for invoice numbers ------------------
create table if not exists public.org_counters (
  id          smallint primary key default 1,
  invoice_seq integer not null default 0,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.org_counters (id) values (1) on conflict (id) do nothing;

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
create table if not exists public.customers (
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
create index if not exists idx_customers_name       on public.customers (name);
create index if not exists idx_customers_created_by on public.customers (created_by);

-- 5. projects ------------------------------------------------
do $$ begin
  create type public.project_status as enum ('planning','active','on_hold','completed','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.projects (
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
create index if not exists idx_projects_status      on public.projects (status);
create index if not exists idx_projects_customer    on public.projects (customer_id);

create table if not exists public.project_updates (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users on delete set null,
  project_id  uuid not null references public.projects on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_project_updates_project_time
  on public.project_updates (project_id, created_at desc);

-- 6. invoices ------------------------------------------------
do $$ begin
  create type public.invoice_status as enum ('draft','sent','paid','overdue','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.invoices (
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
create index if not exists idx_invoices_status   on public.invoices (status);
create index if not exists idx_invoices_customer on public.invoices (customer_id);
create index if not exists idx_invoices_project  on public.invoices (project_id);
create index if not exists idx_invoices_due_date on public.invoices (due_date);

create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices on delete cascade,
  description text not null,
  quantity    numeric(12,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  amount      numeric(14,2) not null default 0,
  position    integer not null default 0
);
create index if not exists idx_invoice_items_invoice on public.invoice_items (invoice_id, position);

-- 7. expenses ------------------------------------------------
do $$ begin
  create type public.expense_category as enum
    ('Software','Hardware','Travel','Subcontractor','Marketing','Salary','Other');
exception when duplicate_object then null; end $$;

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references auth.users on delete set null,
  project_id   uuid references public.projects on delete set null, -- null = general
  category     expense_category not null default 'Other',
  description  text not null,
  amount       numeric(14,2) not null,
  expense_date date not null default current_date,
  salary_id    uuid,
  receipt_url  text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_expenses_date     on public.expenses (expense_date desc);
create index if not exists idx_expenses_category on public.expenses (category);
create index if not exists idx_expenses_project  on public.expenses (project_id);

-- 8. employees + salaries -----------------------------------
do $$ begin
  create type public.employment_type as enum ('full_time','part_time','contract','intern');
exception when duplicate_object then null; end $$;

create table if not exists public.employees (
  id              uuid primary key default gen_random_uuid(),
  created_by      uuid references auth.users on delete set null,
  full_name       text not null,
  email           text,
  phone           text,
  role            text,
  employment_type employment_type not null default 'full_time',
  base_salary     numeric(14,2) not null default 0,
  joined_on       date,
  active          boolean not null default true,
  photo_url       text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_employees_active on public.employees (active);

-- profiles.employee_id forward FK
do $$ begin
  alter table public.profiles
    add constraint profiles_employee_id_fk
    foreign key (employee_id) references public.employees(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.salary_status as enum ('pending','paid');
exception when duplicate_object then null; end $$;

create table if not exists public.salaries (
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
create index if not exists idx_salaries_period   on public.salaries (period_year, period_month);
create index if not exists idx_salaries_employee on public.salaries (employee_id);
create index if not exists idx_salaries_status   on public.salaries (status);

-- expenses.salary_id back-reference FK
do $$ begin
  alter table public.expenses
    add constraint expenses_salary_id_fk
    foreign key (salary_id) references public.salaries(id) on delete set null;
exception when duplicate_object then null; end $$;

-- pay_salary RPC: atomic mark-paid + insert linked expense
create or replace function public.pay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; emp_name text;
begin
  if not is_super_admin() then
    raise exception 'forbidden';
  end if;
  select * into s from public.salaries where id = p_salary_id for update;
  if s is null then raise exception 'salary not found'; end if;
  if s.status = 'paid' then return; end if;
  select full_name into emp_name from public.employees where id = s.employee_id;
  update public.salaries
    set status = 'paid', paid_on = current_date, updated_at = now()
    where id = p_salary_id;
  insert into public.expenses
    (created_by, category, description, amount, expense_date, salary_id)
  values
    (auth.uid(), 'Salary',
     'Salary — ' || coalesce(emp_name, 'Unknown') || ' — ' ||
       s.period_year || '-' || lpad(s.period_month::text, 2, '0'),
     s.net_amount, current_date, p_salary_id);
end $$;

-- unpay_salary RPC: reverse pay_salary
create or replace function public.unpay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  delete from public.expenses where salary_id = p_salary_id;
  update public.salaries
    set status = 'pending', paid_on = null, updated_at = now()
    where id = p_salary_id;
end $$;

-- 9. Kanban: columns, tasks, labels, comments, attachments, checklist, activity
create table if not exists public.task_columns (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users on delete set null,
  project_id  uuid not null references public.projects on delete cascade,
  name        text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_task_columns_project on public.task_columns (project_id, position);

do $$ begin
  create type public.task_priority as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid references auth.users on delete set null,
  project_id    uuid not null references public.projects on delete cascade,
  column_id     uuid not null references public.task_columns on delete cascade,
  title         text not null,
  description   text,
  assignee_id   uuid references public.profiles on delete set null,
  priority      task_priority not null default 'medium',
  due_date      date,
  position      integer not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tasks_board    on public.tasks (project_id, column_id, position);
create index if not exists idx_tasks_assignee on public.tasks (assignee_id);
create index if not exists idx_tasks_due_date on public.tasks (due_date);

create table if not exists public.task_labels (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);
create index if not exists idx_task_labels_project on public.task_labels (project_id);

create table if not exists public.task_label_assignments (
  task_id  uuid not null references public.tasks on delete cascade,
  label_id uuid not null references public.task_labels on delete cascade,
  primary key (task_id, label_id)
);
create index if not exists idx_task_label_assignments_label on public.task_label_assignments (label_id);

create table if not exists public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  body       text not null,
  done       boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_checklist_task on public.task_checklist_items (task_id, position);

create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  author_id  uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on public.task_comments (task_id, created_at);

create table if not exists public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks on delete cascade,
  uploaded_by  uuid references public.profiles on delete set null,
  file_name    text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   integer,
  created_at   timestamptz not null default now()
);
create index if not exists idx_task_attachments_task on public.task_attachments (task_id);

do $$ begin
  create type public.task_activity_kind as enum
    ('created','updated','moved','assigned','commented','completed','reopened','attached','labeled','unlabeled');
exception when duplicate_object then null; end $$;

create table if not exists public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks on delete cascade,
  actor_id   uuid not null references public.profiles on delete cascade,
  kind       task_activity_kind not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_activity_task on public.task_activity (task_id, created_at desc);

-- move_task RPC: optimistic-friendly atomic move + reorder
create or replace function public.move_task(
  p_task_id uuid, p_new_column_id uuid, p_new_position integer
) returns void language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into t from public.tasks where id = p_task_id for update;
  if t is null then raise exception 'task not found'; end if;
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
          jsonb_build_object(
            'from_column', t.column_id,
            'to_column',   p_new_column_id,
            'from_position', t.position,
            'to_position',   p_new_position
          ));
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
      'drop trigger if exists trg_%1$s_updated on public.%1$s;', t
    );
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
-- Drop any prior versions, then create fresh.

-- profiles
drop policy if exists "auth read profiles"      on public.profiles;
drop policy if exists "admin all profiles"      on public.profiles;
drop policy if exists "self update profile"     on public.profiles;
create policy "auth read profiles"
  on public.profiles for select using (auth.uid() is not null);
create policy "admin all profiles"
  on public.profiles for all
  using (is_super_admin())
  with check (is_super_admin());
create policy "self update profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- org_counters: read any auth, writes only via SECURITY DEFINER fn
drop policy if exists "auth read counter" on public.org_counters;
create policy "auth read counter"
  on public.org_counters for select using (auth.uid() is not null);

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
    execute format('drop policy if exists "auth read"  on public.%I;', t);
    execute format('drop policy if exists "auth write" on public.%I;', t);
    execute format($p$create policy "auth read"  on public.%1$I for select using (auth.uid() is not null);$p$, t);
    execute format($p$create policy "auth write" on public.%1$I for all    using (auth.uid() is not null) with check (auth.uid() is not null);$p$, t);
  end loop;
end $$;

-- HR tables: super_admin only
drop policy if exists "admin all employees" on public.employees;
drop policy if exists "admin all salaries"  on public.salaries;
create policy "admin all employees"
  on public.employees for all
  using (is_super_admin())
  with check (is_super_admin());
create policy "admin all salaries"
  on public.salaries  for all
  using (is_super_admin())
  with check (is_super_admin());

-- 13. Realtime publication for kanban ---------------------
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.task_columns;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.task_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.task_checklist_items;
exception when duplicate_object then null; end $$;
