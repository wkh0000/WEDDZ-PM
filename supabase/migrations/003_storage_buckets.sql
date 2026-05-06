-- ============================================================
-- 003_storage_buckets.sql — WEDDZ PM
-- Create the three private buckets used by the app.
-- This complements 002_storage_policies.sql which already
-- handles RLS for these buckets.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit) values
  ('task-attachments', 'task-attachments', false, 10485760),  -- 10 MB
  ('invoice-receipts', 'invoice-receipts', false, 10485760),  -- 10 MB
  ('employee-photos',  'employee-photos',  false,  5242880)   -- 5 MB
on conflict (id) do nothing;
