-- ============================================================
-- 007_human_readable_slugs.sql
-- Add `slug` column to projects/customers/employees and backfill
-- existing rows. The frontend generates slugs at runtime via
-- src/lib/slug.js (kebab-case + numeric-suffix on conflict). The
-- DB enforces uniqueness; the migration is just here to add the
-- column and backfill what's already there.
-- ============================================================

-- 0. unaccent extension — needed by slugify() to strip diacritics
--    from existing names (e.g. "Sańiru" → "saniru"). Lives in the
--    `extensions` schema per Supabase convention.
create extension if not exists unaccent with schema extensions;

-- 1. Helper used only for the one-shot backfill below. The app
--    generates slugs at runtime so it can show a friendly toast
--    when a conflict-suffix is needed; we don't want to bury that
--    in a DB trigger.
create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select
    case
      when coalesce(trim(input), '') = '' then 'item'
      else
        substring(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                lower(extensions.unaccent(input)),
                '[^a-z0-9]+', '-', 'g'
              ),
              '^-+|-+$', '', 'g'
            ),
            '-+', '-', 'g'
          )
        from 1 for 80
        )
    end
$$;

-- 2. Add slug columns (nullable for the duration of backfill)
alter table public.projects   add column if not exists slug text;
alter table public.customers  add column if not exists slug text;
alter table public.employees  add column if not exists slug text;

-- 3. Backfill — assign slugify(name) to every existing row.
--    Conflict resolution: append `-2`, `-3`, … per-table. Older
--    rows (lower created_at) get the unsuffixed slug.
do $$
declare
  r record;
  base_slug text;
  candidate text;
  n int;
begin
  -- projects
  for r in select id, name from public.projects where slug is null order by created_at loop
    base_slug := public.slugify(r.name);
    candidate := base_slug;
    n := 2;
    while exists (select 1 from public.projects where slug = candidate) loop
      candidate := base_slug || '-' || n;
      n := n + 1;
    end loop;
    update public.projects set slug = candidate where id = r.id;
  end loop;

  -- customers
  for r in select id, name from public.customers where slug is null order by created_at loop
    base_slug := public.slugify(r.name);
    candidate := base_slug;
    n := 2;
    while exists (select 1 from public.customers where slug = candidate) loop
      candidate := base_slug || '-' || n;
      n := n + 1;
    end loop;
    update public.customers set slug = candidate where id = r.id;
  end loop;

  -- employees
  for r in select id, full_name from public.employees where slug is null order by created_at loop
    base_slug := public.slugify(r.full_name);
    candidate := base_slug;
    n := 2;
    while exists (select 1 from public.employees where slug = candidate) loop
      candidate := base_slug || '-' || n;
      n := n + 1;
    end loop;
    update public.employees set slug = candidate where id = r.id;
  end loop;
end $$;

-- 4. Now make them required + uniquely indexed
alter table public.projects   alter column slug set not null;
alter table public.customers  alter column slug set not null;
alter table public.employees  alter column slug set not null;

do $$ begin
  alter table public.projects  add constraint projects_slug_key  unique (slug);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.customers add constraint customers_slug_key unique (slug);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.employees add constraint employees_slug_key unique (slug);
exception when duplicate_object then null; end $$;

create index if not exists idx_projects_slug   on public.projects  (slug);
create index if not exists idx_customers_slug  on public.customers (slug);
create index if not exists idx_employees_slug  on public.employees (slug);

-- Tell PostgREST to refresh its schema cache so SELECT slug works
-- without a manual restart.
notify pgrst, 'reload schema';
