-- ============================================================
-- 002_storage_policies.sql — WEDDZ PM
-- Storage RLS for the three private buckets.
-- Buckets must be created first via CLI (supabase storage create)
-- or via the dashboard. This migration only handles RLS.
-- ============================================================

-- task-attachments + invoice-receipts: any authenticated user
-- employee-photos: super_admin only for write/delete
-- All buckets: any authenticated user can read

drop policy if exists "auth read all buckets"        on storage.objects;
drop policy if exists "auth write tasks/expenses"    on storage.objects;
drop policy if exists "auth delete tasks/expenses"   on storage.objects;
drop policy if exists "admin write employee-photos"  on storage.objects;
drop policy if exists "admin delete employee-photos" on storage.objects;

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
