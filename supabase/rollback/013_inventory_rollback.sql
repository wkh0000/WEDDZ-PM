-- Undo migration 013 (inventory module) and the JMC seed.
-- Run in the Supabase SQL editor. One transaction: it either all applies or nothing does.
--
-- Keeps:   receipt payments already recorded as paid PM invoices (real money in Cashflow),
--          the 'inventory' enum value (Postgres can't drop enum values),
--          the inventory-documents bucket and its files (delete those from Storage by hand if wanted).
-- Removes: every inv_* table/view/function, the inventory storage policies, the "sent" PM
--          mirror invoices of open inventory invoices, and the inventory guard on existing policies.
begin;

-- 1. Put every existing policy back exactly as snapshotted before 013.
do $$
declare r record; v_sql text;
begin
  for r in
    select b.* from ops.policy_backup_013 b
      join pg_policies p using (schemaname, tablename, policyname)
     where b.qual is not null or b.with_check is not null
  loop
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then v_sql := v_sql || format(' using (%s)', r.qual); end if;
    if r.with_check is not null then v_sql := v_sql || format(' with check (%s)', r.with_check); end if;
    execute v_sql;
  end loop;
end $$;

-- 2. Cancel-and-remove the PM mirrors of open inventory invoices (never paid, status 'sent').
delete from public.invoices
 where status = 'sent'
   and id in (select pm_invoice_id from public.inv_documents where type = 'INVOICE' and pm_invoice_id is not null);

-- 3. Inventory storage policies.
drop policy if exists "inv docs read"  on storage.objects;
drop policy if exists "inv docs write" on storage.objects;

-- 4. Inventory tables, view and functions.
drop view if exists public.inv_stock;
drop table if exists
  public.inv_movement_serials, public.inv_serials, public.inv_movements, public.inv_payments,
  public.inv_document_versions, public.inv_documents, public.inv_deployments, public.inv_count_sheets,
  public.inv_doc_counters, public.inv_locations, public.inv_products, public.inv_clients
  cascade;
drop function if exists
  public.inv_set_cheque_status, public.inv_record_payment, public.inv_create_invoice, public.inv_deliver,
  public.inv_refresh_invoice, public.inv_invoice_paid, public.inv_next_doc_no,
  public.inv_documents_normalize, public.inv_movement_serials_apply, public.inv_movements_immutable,
  public.inv_movements_validate, public.inv_manage, public.inv_finance, public.inv_access, public.inv_role;
-- No cascade: this fails (and rolls everything back) if any policy still uses it.
drop function if exists public.is_inventory_user();

-- 5. Inventory accounts lose access instead of falling back to member rights.
update public.profiles set active = false where role = 'inventory';

commit;
notify pgrst, 'reload schema';
