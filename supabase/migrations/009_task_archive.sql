-- ============================================================
-- 009_task_archive.sql
--
-- Soft-delete (archive) for tasks. The board hides archived cards by
-- default; the new "Archived" smart filter on the board page reveals
-- them. Restore moves them back. Hard delete is unchanged — still
-- available from the drawer for permanent removal.
--
-- Why a column not a status enum value: tasks already have a
-- `completed_at` timestamp pattern, and column membership (To Do /
-- Done / etc.) is independent of archive state. A nullable timestamp
-- mirrors how completion works and lets us record when it happened.
-- ============================================================

alter table public.tasks
  add column if not exists archived_at timestamptz;

-- Partial index — only matches the (small) set of archived rows so
-- the default board query (`archived_at is null`) still uses the
-- existing idx_tasks_board index.
create index if not exists idx_tasks_archived
  on public.tasks (archived_at)
  where archived_at is not null;

notify pgrst, 'reload schema';
