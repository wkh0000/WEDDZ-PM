-- ============================================================
-- 014 — Stop users changing their own privileges
-- The "self update profile" policy lets a user update their own row,
-- and RLS can't limit which columns. So any signed-in user could set
-- their own role to super_admin (or reactivate themselves) through the
-- API, which would undo every inventory-role restriction.
-- Role, active and the employee link now need a super admin. Service
-- role and the SQL editor have no auth.uid() and are left alone.
-- ============================================================

create or replace function public.profiles_protect_privileged()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_super_admin() and (
       new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.employee_id is distinct from old.employee_id
  ) then
    raise exception 'Only a super admin can change a role, account status or employee link.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_protect_privileged on public.profiles;
create trigger trg_profiles_protect_privileged before update on public.profiles
  for each row execute function public.profiles_protect_privileged();

-- Only used inside inv_refresh_invoice and inv_record_payment, which run as
-- the owner. Called directly it would tell any user what an invoice has been paid.
revoke execute on function public.inv_invoice_paid(uuid) from public, anon, authenticated;

-- Every active user can read inv_clients, so commercial terms don't belong in
-- notes. These figures are on the quotation and the project budget.
update public.inv_clients
   set notes = 'Multi-Branch Edition: main branch + 10 outlets (Quotation WIT-Q-2026-085-R1).'
 where doc_ref = '2026-085' and notes like '%Rs. 1,900,000%';

notify pgrst, 'reload schema';
