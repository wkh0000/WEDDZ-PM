-- ============================================================
-- 005_profile_fks.sql — let PostgREST embed `profiles` from any
-- `created_by` / `actor_id` / `author_id` / `uploaded_by` column.
--
-- Why: profiles.id == auth.users.id by design, but the existing FKs
-- point at auth.users. PostgREST can only embed across direct FKs.
-- We add a second FK from each ownership column to profiles.id so
-- queries like `select(*, author:profiles(...))` resolve.
--
-- Idempotent: each ALTER is wrapped to silently no-op on re-run.
-- ============================================================

do $$ begin
  alter table public.customers add constraint customers_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.projects add constraint projects_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.project_updates add constraint project_updates_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.invoices add constraint invoices_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.expenses add constraint expenses_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.employees add constraint employees_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.salaries add constraint salaries_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.task_columns add constraint task_columns_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks add constraint tasks_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- task_comments.author_id and task_attachments.uploaded_by already
-- reference profiles directly (since the original schema uses profiles
-- there), so no change needed for those.

-- Force PostgREST to refresh its schema cache so the new FKs are
-- visible to embed queries immediately.
notify pgrst, 'reload schema';
