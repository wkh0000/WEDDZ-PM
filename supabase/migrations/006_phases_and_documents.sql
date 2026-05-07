-- ============================================================
-- 006_phases_and_documents.sql
-- Project phases (with deliverables) + project documents (with
-- attached files in a new private storage bucket).
-- ============================================================

-- ---------- Enums --------------------------------------------
do $$ begin
  create type public.phase_status as enum
    ('not_started', 'in_progress', 'in_review', 'completed', 'on_hold', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_kind as enum
    ('contract','quotation','invoice','requirement','proposal',
     'design','report','agreement','specification','other');
exception when duplicate_object then null; end $$;

-- ---------- project_phases -----------------------------------
create table if not exists public.project_phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects on delete cascade,
  position    integer not null default 0,
  name        text not null,
  description text,
  status      phase_status not null default 'not_started',
  start_date  date,
  end_date    date,
  amount      numeric(14,2),
  notes       text,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_project_phases_project on public.project_phases (project_id, position);

-- ---------- phase_deliverables -------------------------------
create table if not exists public.phase_deliverables (
  id           uuid primary key default gen_random_uuid(),
  phase_id     uuid not null references public.project_phases on delete cascade,
  position     integer not null default 0,
  body         text not null,
  done         boolean not null default false,
  verification text,                -- exit criteria / how to verify
  created_at   timestamptz not null default now()
);
create index if not exists idx_phase_deliverables_phase on public.phase_deliverables (phase_id, position);

-- ---------- project_documents --------------------------------
create table if not exists public.project_documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects on delete cascade,
  kind         document_kind not null default 'other',
  title        text not null,
  description  text,
  doc_date     date not null default current_date,
  amount       numeric(14,2),
  version      text,                       -- e.g. 'v1', 'v2.1'
  storage_path text,                       -- inside 'project-documents' bucket
  file_name    text,
  mime_type    text,
  size_bytes   integer,
  external_url text,                       -- alternative: link to Drive/Notion
  notes        text,
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_project_documents_project on public.project_documents (project_id, doc_date desc);
create index if not exists idx_project_documents_kind    on public.project_documents (kind);

-- ---------- updated_at triggers ------------------------------
do $$ begin
  drop trigger if exists trg_project_phases_updated on public.project_phases;
  create trigger trg_project_phases_updated before update on public.project_phases
    for each row execute function public.set_updated_at();
end $$;

do $$ begin
  drop trigger if exists trg_project_documents_updated on public.project_documents;
  create trigger trg_project_documents_updated before update on public.project_documents
    for each row execute function public.set_updated_at();
end $$;

-- ---------- profile FKs (so PostgREST can embed `created_by` -> profile) ----------
do $$ begin
  alter table public.project_phases add constraint project_phases_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.project_documents add constraint project_documents_created_by_profile_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- RLS ----------------------------------------------
alter table public.project_phases       enable row level security;
alter table public.phase_deliverables   enable row level security;
alter table public.project_documents    enable row level security;

drop policy if exists "auth read"  on public.project_phases;
drop policy if exists "auth write" on public.project_phases;
create policy "auth read"  on public.project_phases for select using (auth.uid() is not null);
create policy "auth write" on public.project_phases for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "auth read"  on public.phase_deliverables;
drop policy if exists "auth write" on public.phase_deliverables;
create policy "auth read"  on public.phase_deliverables for select using (auth.uid() is not null);
create policy "auth write" on public.phase_deliverables for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "auth read"  on public.project_documents;
drop policy if exists "auth write" on public.project_documents;
create policy "auth read"  on public.project_documents for select using (auth.uid() is not null);
create policy "auth write" on public.project_documents for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------- Storage bucket: project-documents -----------------
insert into storage.buckets (id, name, public)
  values ('project-documents', 'project-documents', false)
  on conflict (id) do nothing;

drop policy if exists "auth read project-documents"   on storage.objects;
drop policy if exists "auth write project-documents"  on storage.objects;
drop policy if exists "auth delete project-documents" on storage.objects;
create policy "auth read project-documents"
  on storage.objects for select
  using (bucket_id = 'project-documents' and auth.uid() is not null);
create policy "auth write project-documents"
  on storage.objects for insert
  with check (bucket_id = 'project-documents' and auth.uid() is not null);
create policy "auth delete project-documents"
  on storage.objects for delete
  using (bucket_id = 'project-documents' and auth.uid() is not null);

notify pgrst, 'reload schema';
