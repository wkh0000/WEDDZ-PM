-- ============================================================
-- 015 — Keep "Mark as paid" off inventory balance invoices
-- An open inventory invoice keeps a Sent invoice here for its balance.
-- Marking that one paid adds the money to Cashflow with no receipt and
-- leaves the inventory invoice open, so recording the payment later
-- would count it twice. Payments go through inv_record_payment, which
-- posts its own paid invoice and never sets this one to paid.
-- ============================================================

create or replace function public.invoices_block_linked_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_doc text;
begin
  select doc_no into v_doc from inv_documents
   where pm_invoice_id = new.id and type = 'INVOICE' limit 1;
  if v_doc is not null then
    raise exception '% is the balance on %. Record this payment in Inventory > Documents so a receipt is issued.',
      new.invoice_no, v_doc;
  end if;
  return new;
end $$;

drop trigger if exists trg_invoices_block_linked_paid on public.invoices;
create trigger trg_invoices_block_linked_paid before update of status on public.invoices
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function public.invoices_block_linked_paid();
