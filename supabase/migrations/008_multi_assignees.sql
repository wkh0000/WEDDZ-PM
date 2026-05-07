-- ============================================================
-- 008_multi_assignees.sql
--
-- Add multi-assignee support to tasks. Until now `tasks.assignee_id`
-- held a single optional profile FK; teams want to share ownership
-- (e.g. a designer + an engineer both responsible for one card).
--
-- Strategy: add a `task_assignees` join table. Keep `tasks.assignee_id`
-- as the "primary" assignee for backward compat — the existing
-- per-user filter, the dashboard "my tasks" view, and the task realtime
-- subscription all already key off `assignee_id`. The app keeps the
-- column in sync with the first row in the join table.
--
-- Backfill: every task that already has `assignee_id` set gets a
-- matching row in `task_assignees`.
-- ============================================================

create table if not exists public.task_assignees (
  task_id     uuid not null references public.tasks   on delete cascade,
  profile_id  uuid not null references public.profiles on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);
create index if not exists idx_task_assignees_profile on public.task_assignees (profile_id);
create index if not exists idx_task_assignees_task    on public.task_assignees (task_id);

-- RLS — same shape as the rest of the kanban tables.
alter table public.task_assignees enable row level security;

drop policy if exists "auth read"  on public.task_assignees;
drop policy if exists "auth write" on public.task_assignees;
create policy "auth read"
  on public.task_assignees for select using (auth.uid() is not null);
create policy "auth write"
  on public.task_assignees for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Backfill existing single-assignee rows so reading from the join table
-- produces the same picture as before for old data.
insert into public.task_assignees (task_id, profile_id)
select id, assignee_id
  from public.tasks
 where assignee_id is not null
on conflict do nothing;

-- Realtime — board needs to reflect assignment changes from other
-- users immediately, same way it reflects column / position changes.
do $$ begin
  alter publication supabase_realtime add table public.task_assignees;
exception when duplicate_object then null; end $$;

-- Tell PostgREST to pick up the new FKs so embed queries
-- (`assignees:task_assignees(profile:profiles(...))`) resolve without
-- a manual restart.
notify pgrst, 'reload schema';
