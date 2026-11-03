-- ============================================================
-- 013_inventory_module.sql
--
-- Inventory, deployment & billing module (tables prefixed inv_).
--   * Stock is an append-only ledger (inv_movements); on-hand per
--     location is computed (inv_stock view), never stored.
--   * Documents (delivery notes, invoices, receipts) are numbered per
--     client project: WIT-{INV|R|DN|Q}-{doc_ref}-NN, never reused.
--   * Receipts post a paid PM invoice and open invoices keep a "sent"
--     PM mirror for the balance, so Cashflow/Reports/Dashboard keep
--     working unchanged.
--   * The `inventory` role sees only inv_* stock data. Every existing
--     policy gets `and not is_inventory_user()` — a no-op for
--     super_admin and member.
-- ============================================================

-- 1. Role helpers ---------------------------------------------
create or replace function public.is_inventory_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'inventory')
$$;

create or replace function public.inv_role()
returns text language sql stable security definer set search_path = public as $$
  select role::text from public.profiles where id = auth.uid() and active
$$;

-- any active user may use the stock side
create or replace function public.inv_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.inv_role() in ('super_admin','member','inventory'), false)
$$;

-- money side: invoices, receipts, payments
create or replace function public.inv_finance()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.inv_role() in ('super_admin','member'), false)
$$;

-- products, prices, purchases
create or replace function public.inv_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.inv_role() in ('super_admin','inventory'), false)
$$;

-- 2. Tables ---------------------------------------------------
create table if not exists public.inv_clients (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid references public.customers(id) on delete set null,
  project_id     uuid references public.projects(id) on delete set null,
  doc_ref        text not null unique check (doc_ref ~ '^[0-9]{4}-[0-9]{3}$'),
  quotation_no   text,
  contact_name   text not null,
  company        text,
  mobile         text,
  address        text,
  project_title  text,
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.inv_products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text unique,
  name                text not null,
  invoice_detail      text,
  dn_name             text,
  dn_detail           text,
  dn_components       jsonb not null default '[]'::jsonb,
  category            text not null default 'Hardware',
  brand_model         text,
  unit                text not null default 'pcs' check (unit in ('pcs','roll','set','m')),
  price               numeric(12,2) check (price >= 0),
  kind                text not null default 'hardware' check (kind in ('hardware','software')),
  is_stock            boolean not null default true,
  is_free             boolean not null default false,
  track_serials       boolean not null default false,
  warranty_months     integer check (warranty_months >= 0),
  warranty_label      text check (warranty_label in ('warranty','guarantee')),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  sort_order          integer not null default 0,
  active              boolean not null default true,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (kind = 'hardware' or not is_stock)
);

create table if not exists public.inv_locations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('office','vehicle','site')),
  name            text not null,
  client_id       uuid references public.inv_clients(id) on delete restrict,
  address         text,
  manager_name    text,
  manager_mobile  text,
  is_outlet       boolean not null default true,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (kind <> 'site' or client_id is not null)
);

create table if not exists public.inv_deployments (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.inv_clients(id) on delete restrict,
  deploy_date    date not null default current_date,
  vehicle_id     uuid references public.inv_locations(id) on delete restrict,
  staff          text,
  site_ids       uuid[] not null default '{}',
  status         text not null default 'planned' check (status in ('planned','loaded','delivered','closed')),
  planned_lines  jsonb not null default '[]'::jsonb,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.inv_documents (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.inv_clients(id) on delete restrict,
  type            text not null check (type in ('DELIVERY_NOTE','INVOICE','RECEIPT','QUOTATION')),
  doc_no          text not null unique,
  seq             integer not null check (seq > 0),
  doc_date        date not null,
  due_date        date,
  status          text not null check (status in ('issued','open','paid','replaced','cancelled')),
  title           text,
  intro           text,
  site_ids        uuid[] not null default '{}',
  lines           jsonb not null default '[]'::jsonb,
  meta            jsonb not null default '{}'::jsonb,
  software_total  numeric(14,2) not null default 0,
  hardware_total  numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  replaces_ids    uuid[] not null default '{}',
  replaced_by_id  uuid references public.inv_documents(id) on delete set null,
  source_dn_ids   uuid[] not null default '{}',
  deployment_id   uuid references public.inv_deployments(id) on delete set null,
  pm_invoice_id   uuid references public.invoices(id) on delete set null,
  pdf_path        text,
  pdf_version     integer not null default 0,
  pdf_sha256      text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, type, seq)
);
create index if not exists idx_inv_documents_client on public.inv_documents (client_id, type, seq desc);

create table if not exists public.inv_document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.inv_documents(id) on delete cascade,
  version      integer not null,
  pdf_path     text not null,
  sha256       text not null,
  source       text not null default 'generated' check (source in ('generated','original')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.inv_movements (
  id                uuid primary key default gen_random_uuid(),
  moved_on          date not null default current_date,
  product_id        uuid not null references public.inv_products(id) on delete restrict,
  qty               integer not null check (qty > 0),
  from_location_id  uuid references public.inv_locations(id) on delete restrict,
  to_location_id    uuid references public.inv_locations(id) on delete restrict,
  type              text not null check (type in ('OPENING','PURCHASE','TRANSFER_TO_VEHICLE','RETURN_TO_OFFICE','DELIVERED_TO_SITE','ADJUSTMENT','DAMAGED')),
  deployment_id     uuid references public.inv_deployments(id) on delete restrict,
  document_id       uuid references public.inv_documents(id) on delete restrict,
  reference         text,
  reason            text,
  note              text,
  unit_cost         numeric(12,2) check (unit_cost >= 0),
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  check (from_location_id is not null or to_location_id is not null),
  check (from_location_id is distinct from to_location_id)
);
create index if not exists idx_inv_movements_from on public.inv_movements (product_id, from_location_id);
create index if not exists idx_inv_movements_to   on public.inv_movements (product_id, to_location_id);
create index if not exists idx_inv_movements_date on public.inv_movements (moved_on desc, created_at desc);

create table if not exists public.inv_serials (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.inv_products(id) on delete restrict,
  serial       text not null,
  location_id  uuid references public.inv_locations(id) on delete restrict,
  document_id  uuid references public.inv_documents(id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (product_id, serial)
);

create table if not exists public.inv_movement_serials (
  movement_id  uuid not null references public.inv_movements(id) on delete cascade,
  serial_id    uuid not null references public.inv_serials(id) on delete restrict,
  primary key (movement_id, serial_id)
);

create table if not exists public.inv_payments (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.inv_clients(id) on delete restrict,
  invoice_id       uuid not null references public.inv_documents(id) on delete restrict,
  receipt_id       uuid references public.inv_documents(id) on delete set null,
  paid_on          date not null,
  amount           numeric(14,2) not null check (amount > 0),
  method           text check (method in ('cash','bank_transfer','cheque')),
  cheque_no        text,
  cheque_status    text check (cheque_status in ('pending','cleared','bounced')),
  software_amount  numeric(14,2) check (software_amount >= 0),
  hardware_amount  numeric(14,2) check (hardware_amount >= 0),
  pm_invoice_id    uuid references public.invoices(id) on delete set null,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_inv_payments_invoice on public.inv_payments (invoice_id, paid_on);

-- Physical stock counts (e.g. the handwritten office sheet). lines:
-- [{label, product_ids: [uuid], used, left, note}]
create table if not exists public.inv_count_sheets (
  id           uuid primary key default gen_random_uuid(),
  counted_on   date not null,
  location_id  uuid not null references public.inv_locations(id) on delete restrict,
  lines        jsonb not null default '[]'::jsonb,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.inv_doc_counters (
  client_id  uuid not null references public.inv_clients(id) on delete cascade,
  type       text not null,
  last_seq   integer not null default 0,
  primary key (client_id, type)
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['inv_clients','inv_products','inv_locations','inv_deployments','inv_documents','inv_payments'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- 3. Stock view (computed from the ledger) ---------------------
create or replace view public.inv_stock with (security_invoker = true) as
select product_id, location_id, sum(delta)::integer as qty
from (
  select product_id, to_location_id as location_id, qty as delta
    from public.inv_movements where to_location_id is not null
  union all
  select product_id, from_location_id, -qty
    from public.inv_movements where from_location_id is not null
) m
group by product_id, location_id
having sum(delta) <> 0;

-- 4. Ledger rules ----------------------------------------------
create or replace function public.inv_movements_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p        record;
  fk       text;
  tk       text;
  on_hand  integer;
  is_user  boolean := auth.uid() is not null;
begin
  select * into p from inv_products where id = new.product_id;
  if p.id is null then raise exception 'Unknown product'; end if;
  if not p.is_stock then raise exception '% is not a stock item', p.name; end if;
  select kind into fk from inv_locations where id = new.from_location_id;
  select kind into tk from inv_locations where id = new.to_location_id;

  if is_user and not inv_access() then raise exception 'forbidden'; end if;

  case new.type
    when 'OPENING' then
      if new.from_location_id is not null or coalesce(tk,'') not in ('office','vehicle') then
        raise exception 'Opening stock goes into the office or a vehicle'; end if;
      if is_user and not is_super_admin() then raise exception 'Only admins can post opening stock'; end if;
    when 'PURCHASE' then
      if new.from_location_id is not null or coalesce(tk,'') <> 'office' then
        raise exception 'Purchases are received into the office'; end if;
      if is_user and not inv_manage() then raise exception 'You are not allowed to record purchases'; end if;
    when 'TRANSFER_TO_VEHICLE' then
      if coalesce(fk,'') <> 'office' or coalesce(tk,'') <> 'vehicle' then
        raise exception 'Loading moves stock from the office to a vehicle'; end if;
    when 'RETURN_TO_OFFICE' then
      if coalesce(fk,'') <> 'vehicle' or coalesce(tk,'') <> 'office' then
        raise exception 'Returns move stock from a vehicle back to the office'; end if;
    when 'DELIVERED_TO_SITE' then
      if coalesce(fk,'') not in ('office','vehicle') or coalesce(tk,'') <> 'site' then
        raise exception 'Deliveries go from the office or a vehicle to a client site'; end if;
    when 'ADJUSTMENT' then
      if coalesce(btrim(new.reason),'') = '' then raise exception 'A reason is required for an adjustment'; end if;
      if (new.from_location_id is null) = (new.to_location_id is null) then
        raise exception 'An adjustment either adds stock to or removes it from one location'; end if;
      if is_user and not is_super_admin() then raise exception 'Only admins can post adjustments'; end if;
    when 'DAMAGED' then
      if coalesce(btrim(new.reason),'') = '' then raise exception 'A reason is required for damaged stock'; end if;
      if new.from_location_id is null or new.to_location_id is not null then
        raise exception 'Damaged stock is written off from one location'; end if;
      if is_user and not is_super_admin() then raise exception 'Only admins can write off damaged stock'; end if;
  end case;

  if is_user then new.created_by := auth.uid(); end if;

  if new.from_location_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.product_id::text || new.from_location_id::text, 0));
    select coalesce(sum(case when to_location_id = new.from_location_id then qty else -qty end), 0)
      into on_hand
      from inv_movements
     where product_id = new.product_id
       and (to_location_id = new.from_location_id or from_location_id = new.from_location_id);
    if on_hand < new.qty then
      raise exception 'Not enough stock: % has % × % (tried to move %).',
        (select name from inv_locations where id = new.from_location_id), on_hand, p.name, new.qty;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_inv_movements_validate on public.inv_movements;
create trigger trg_inv_movements_validate before insert on public.inv_movements
  for each row execute function public.inv_movements_validate();

create or replace function public.inv_movements_immutable()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('inv.allow_ledger_edit', true), '') <> 'on' then
    raise exception 'The stock ledger is append-only. Post an adjustment instead.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_inv_movements_immutable on public.inv_movements;
create trigger trg_inv_movements_immutable before update or delete on public.inv_movements
  for each row execute function public.inv_movements_immutable();

create or replace function public.inv_movement_serials_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record; s record; n integer;
begin
  select * into m from inv_movements where id = new.movement_id;
  select * into s from inv_serials where id = new.serial_id for update;
  if s.product_id <> m.product_id then raise exception 'Serial % belongs to another product', s.serial; end if;
  if m.from_location_id is not null and s.location_id is distinct from m.from_location_id then
    raise exception 'Serial % is not at the source location', s.serial; end if;
  select count(*) into n from inv_movement_serials where movement_id = new.movement_id;
  if n >= m.qty then raise exception 'More serial numbers than items moved'; end if;
  update inv_serials set location_id = m.to_location_id, document_id = coalesce(m.document_id, document_id)
   where id = s.id;
  return new;
end $$;

drop trigger if exists trg_inv_movement_serials_apply on public.inv_movement_serials;
create trigger trg_inv_movement_serials_apply before insert on public.inv_movement_serials
  for each row execute function public.inv_movement_serials_apply();

-- 5. Documents: server-side totals + lock issued content --------
create or replace function public.inv_documents_normalize()
returns trigger language plpgsql as $$
declare
  l jsonb; amt numeric(14,2); sw numeric(14,2) := 0; hw numeric(14,2) := 0; out_lines jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and auth.uid() is not null
     and coalesce(current_setting('inv.allow_doc_edit', true), '') <> 'on'
     and (new.lines, new.doc_no, new.seq, new.type, new.client_id, new.doc_date, new.total, new.replaces_ids)
         is distinct from (old.lines, old.doc_no, old.seq, old.type, old.client_id, old.doc_date, old.total, old.replaces_ids) then
    raise exception 'Issued documents cannot be changed. Issue a new (replacing) document instead.';
  end if;

  if new.type in ('INVOICE','QUOTATION') then
    for l in select value from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb)) loop
      if coalesce((l->>'is_free')::boolean, false) then
        amt := 0;
      else
        amt := round(coalesce((l->>'qty')::numeric, 0) * coalesce((l->>'unit_price')::numeric, 0), 2);
      end if;
      if l->>'kind' = 'software' then sw := sw + amt; else hw := hw + amt; end if;
      out_lines := out_lines || jsonb_build_array(l || jsonb_build_object('amount', amt));
    end loop;
    new.lines := out_lines;
    new.software_total := sw;
    new.hardware_total := hw;
    new.total := sw + hw;
  elsif new.type = 'DELIVERY_NOTE' then
    new.software_total := 0; new.hardware_total := 0; new.total := 0;
  end if;
  return new;
end $$;

drop trigger if exists trg_inv_documents_normalize on public.inv_documents;
create trigger trg_inv_documents_normalize before insert or update on public.inv_documents
  for each row execute function public.inv_documents_normalize();

-- 6. Numbering --------------------------------------------------
create or replace function public.inv_next_doc_no(p_client_id uuid, p_type text, out doc_no text, out seq integer)
language plpgsql security definer set search_path = public as $$
declare v_ref text; v_prefix text; v_max integer;
begin
  select c.doc_ref into v_ref from inv_clients c where c.id = p_client_id;
  if v_ref is null then raise exception 'This client has no document reference (e.g. 2026-085)'; end if;
  v_prefix := case p_type when 'INVOICE' then 'WIT-INV' when 'RECEIPT' then 'WIT-R'
                          when 'DELIVERY_NOTE' then 'WIT-DN' when 'QUOTATION' then 'WIT-Q' end;
  if v_prefix is null then raise exception 'Unknown document type %', p_type; end if;
  select coalesce(max(d.seq), 0) into v_max from inv_documents d where d.client_id = p_client_id and d.type = p_type;
  insert into inv_doc_counters as c (client_id, type, last_seq) values (p_client_id, p_type, v_max + 1)
    on conflict (client_id, type) do update set last_seq = greatest(c.last_seq, v_max) + 1
    returning c.last_seq into seq;
  doc_no := v_prefix || '-' || v_ref || '-' || lpad(seq::text, 2, '0');
end $$;

-- 7. Balances + PM mirror ---------------------------------------
-- Paid = payments on the invoice plus on every invoice it replaced
-- (recursively). Bounced cheques don't count.
create or replace function public.inv_invoice_paid(p_invoice_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  with recursive chain(id) as (
    select p_invoice_id
    union
    select d.id from inv_documents d join chain c on d.replaced_by_id = c.id
  )
  select coalesce(sum(p.amount), 0)::numeric
    from inv_payments p
   where p.invoice_id in (select id from chain)
     and coalesce(p.cheque_status, '') <> 'bounced'
$$;

create or replace function public.inv_refresh_invoice(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d record; c record; v_bal numeric(14,2); v_pm uuid; v_no text;
begin
  select * into d from inv_documents where id = p_id for update;
  if d.id is null or d.type <> 'INVOICE' then return; end if;
  v_bal := d.total - inv_invoice_paid(p_id);

  if d.status in ('open','paid') then
    update inv_documents set status = case when v_bal <= 0 then 'paid' else 'open' end where id = p_id;
  end if;

  select * into c from inv_clients where id = d.client_id;
  if d.status in ('open','paid') and v_bal > 0 and c.customer_id is not null then
    if d.pm_invoice_id is null then
      v_no := next_invoice_number();
      insert into invoices (created_by, customer_id, project_id, invoice_no, issue_date, due_date, status, notes, subtotal, total)
      values (auth.uid(), c.customer_id, c.project_id, v_no, d.doc_date, d.due_date, 'sent',
              'Balance due on ' || d.doc_no || '. Kept in sync by the Inventory module — record payments there.',
              v_bal, v_bal)
      returning id into v_pm;
      insert into invoice_items (invoice_id, description, quantity, unit_price, amount, position)
      values (v_pm, 'Balance due — ' || d.doc_no, 1, v_bal, v_bal, 0);
      update inv_documents set pm_invoice_id = v_pm where id = p_id;
    else
      update invoices set subtotal = v_bal, total = v_bal,
             status = case when status = 'cancelled' then 'sent'::invoice_status else status end
       where id = d.pm_invoice_id;
      -- invoice_items has an updated_at trigger but no such column, so replace rather than update
      delete from invoice_items where invoice_id = d.pm_invoice_id;
      insert into invoice_items (invoice_id, description, quantity, unit_price, amount, position)
      values (d.pm_invoice_id, 'Balance due — ' || d.doc_no, 1, v_bal, v_bal, 0);
    end if;
  elsif d.pm_invoice_id is not null then
    update invoices set status = 'cancelled',
           notes = 'Balance mirror for ' || d.doc_no || ' — closed (' ||
                   case when d.status = 'replaced' then 'invoice replaced' else 'fully paid; cash is on the receipt invoices' end || ').'
     where id = d.pm_invoice_id and status <> 'cancelled';
  end if;
end $$;

-- 8. Workflow RPCs ----------------------------------------------
-- Deliver items to a client site: one delivery note + ledger rows.
-- p_lines: [{product_id, qty, serial_ids?, dn_name?, dn_detail?, components?}]
create or replace function public.inv_deliver(
  p_site_id uuid, p_from_location_id uuid, p_date date, p_lines jsonb,
  p_deployment_id uuid default null, p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_site record; v_no text; v_seq integer; v_doc uuid; l jsonb; p record; v_mid uuid; v_sid uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if not inv_access() then raise exception 'forbidden'; end if;
  select * into v_site from inv_locations where id = p_site_id and kind = 'site';
  if v_site.id is null then raise exception 'Choose a client site to deliver to'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Add at least one item'; end if;

  for l in select value from jsonb_array_elements(p_lines) loop
    select * into p from inv_products where id = (l->>'product_id')::uuid;
    if p.id is null then raise exception 'Unknown product in delivery'; end if;
    if coalesce((l->>'qty')::integer, 0) <= 0 then raise exception 'Quantity for % must be at least 1', p.name; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', p.id,
      'qty',        (l->>'qty')::integer,
      'name',       coalesce(nullif(l->>'dn_name', ''), p.dn_name, p.name),
      'detail',     case when l ? 'dn_detail' then nullif(l->>'dn_detail', '') else p.dn_detail end,
      'components', coalesce(l->'components', p.dn_components),
      'serials',    coalesce((select jsonb_agg(s.serial order by s.serial) from inv_serials s
                               where s.id in (select x::uuid from jsonb_array_elements_text(coalesce(l->'serial_ids','[]'::jsonb)) x)), '[]'::jsonb)
    ));
  end loop;

  select n.doc_no, n.seq into v_no, v_seq from inv_next_doc_no(v_site.client_id, 'DELIVERY_NOTE') n;
  insert into inv_documents (client_id, type, doc_no, seq, doc_date, status, site_ids, lines, meta, deployment_id, created_by)
  values (v_site.client_id, 'DELIVERY_NOTE', v_no, v_seq, p_date, 'issued', array[p_site_id], v_lines,
          coalesce(p_meta, '{}'::jsonb), p_deployment_id, auth.uid())
  returning id into v_doc;

  for l in select value from jsonb_array_elements(p_lines) loop
    select * into p from inv_products where id = (l->>'product_id')::uuid;
    continue when not p.is_stock;
    insert into inv_movements (moved_on, product_id, qty, from_location_id, to_location_id, type, deployment_id, document_id, reference)
    values (p_date, p.id, (l->>'qty')::integer, p_from_location_id, p_site_id, 'DELIVERED_TO_SITE', p_deployment_id, v_doc, v_no)
    returning id into v_mid;
    for v_sid in select x::uuid from jsonb_array_elements_text(coalesce(l->'serial_ids', '[]'::jsonb)) x loop
      insert into inv_movement_serials (movement_id, serial_id) values (v_mid, v_sid);
    end loop;
  end loop;
  return v_doc;
end $$;

-- Issue an invoice. p_lines: [{group, group_label, group_kind, dn_no, product_id, description, detail, qty, unit_price, is_free, kind}]
create or replace function public.inv_create_invoice(
  p_client_id uuid, p_doc_date date, p_due_date date, p_title text, p_intro text,
  p_site_ids uuid[], p_lines jsonb, p_meta jsonb,
  p_replaces_ids uuid[] default '{}', p_source_dn_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_no text; v_seq integer; v_id uuid; r uuid;
begin
  if not inv_finance() then raise exception 'forbidden'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'Add at least one line'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l
              where not coalesce((l->>'is_free')::boolean, false) and (l->>'unit_price') is null) then
    raise exception 'Every line needs a price (or mark it free)'; end if;
  if exists (select 1 from inv_documents
              where id = any(coalesce(p_replaces_ids, '{}'))
                and (client_id <> p_client_id or type <> 'INVOICE' or status <> 'open')) then
    raise exception 'Only open invoices of the same client can be replaced'; end if;

  select n.doc_no, n.seq into v_no, v_seq from inv_next_doc_no(p_client_id, 'INVOICE') n;
  insert into inv_documents (client_id, type, doc_no, seq, doc_date, due_date, status, title, intro, site_ids,
                             lines, meta, replaces_ids, source_dn_ids, created_by)
  values (p_client_id, 'INVOICE', v_no, v_seq, p_doc_date, p_due_date, 'open', p_title, p_intro,
          coalesce(p_site_ids, '{}'), p_lines, coalesce(p_meta, '{}'::jsonb),
          coalesce(p_replaces_ids, '{}'), coalesce(p_source_dn_ids, '{}'), auth.uid())
  returning id into v_id;

  perform set_config('inv.allow_doc_edit', 'on', true);
  update inv_documents set status = 'replaced', replaced_by_id = v_id where id = any(coalesce(p_replaces_ids, '{}'));
  perform set_config('inv.allow_doc_edit', '', true);
  foreach r in array coalesce(p_replaces_ids, '{}') loop perform inv_refresh_invoice(r); end loop;
  perform inv_refresh_invoice(v_id);
  return v_id;
end $$;

-- Record a payment against an invoice: receipt + paid PM invoice + status/mirror refresh.
create or replace function public.inv_record_payment(
  p_invoice_id uuid, p_paid_on date, p_amount numeric, p_method text, p_cheque_no text,
  p_software_amount numeric, p_hardware_amount numeric, p_receipt_date date, p_title text, p_intro text, p_meta jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare d record; c record; v_no text; v_seq integer; v_rid uuid; v_pid uuid; v_pm uuid; v_pmno text; v_bal numeric(14,2);
begin
  if not inv_finance() then raise exception 'forbidden'; end if;
  select * into d from inv_documents where id = p_invoice_id and type = 'INVOICE';
  if d.id is null then raise exception 'Invoice not found'; end if;
  if d.status not in ('open','paid') then
    raise exception 'Invoice % is %. Record the payment against the invoice that replaced it.', d.doc_no, d.status; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be more than zero'; end if;
  if p_method is not null and p_method not in ('cash','bank_transfer','cheque') then raise exception 'Unknown payment method'; end if;
  v_bal := d.total - inv_invoice_paid(d.id);
  if p_amount > v_bal then
    raise exception 'Rs. % is more than the balance due on % (Rs. %)', to_char(p_amount, 'FM999,999,999,990.00'), d.doc_no, to_char(v_bal, 'FM999,999,999,990.00'); end if;
  if coalesce(p_software_amount, 0) + coalesce(p_hardware_amount, 0) > p_amount then
    raise exception 'The software/hardware split is more than the amount received'; end if;

  select * into c from inv_clients where id = d.client_id;
  select n.doc_no, n.seq into v_no, v_seq from inv_next_doc_no(d.client_id, 'RECEIPT') n;
  insert into inv_documents (client_id, type, doc_no, seq, doc_date, status, title, intro, meta, total, created_by)
  values (d.client_id, 'RECEIPT', v_no, v_seq, coalesce(p_receipt_date, p_paid_on), 'issued', p_title, p_intro,
          coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('against_invoice_id', d.id, 'against_invoice_no', d.doc_no),
          p_amount, auth.uid())
  returning id into v_rid;

  if c.customer_id is not null then
    v_pmno := next_invoice_number();
    insert into invoices (created_by, customer_id, project_id, invoice_no, issue_date, due_date, status, notes, subtotal, total, paid_at)
    values (auth.uid(), c.customer_id, c.project_id, v_pmno, p_paid_on, p_paid_on, 'paid',
            'Receipt ' || v_no || ' against ' || d.doc_no || coalesce(' · Cheque no. ' || nullif(btrim(p_cheque_no), ''), ''),
            p_amount, p_amount, (p_paid_on::timestamp at time zone 'UTC'))
    returning id into v_pm;
    insert into invoice_items (invoice_id, description, quantity, unit_price, amount, position)
    values (v_pm, 'Payment received — ' || d.doc_no || ' (receipt ' || v_no || ')', 1, p_amount, p_amount, 0);
  end if;

  insert into inv_payments (client_id, invoice_id, receipt_id, paid_on, amount, method, cheque_no, cheque_status,
                            software_amount, hardware_amount, pm_invoice_id, created_by)
  values (d.client_id, d.id, v_rid, p_paid_on, p_amount, p_method, nullif(btrim(p_cheque_no), ''),
          case when p_method = 'cheque' then 'pending' end, p_software_amount, p_hardware_amount, v_pm, auth.uid())
  returning id into v_pid;

  update inv_documents set pm_invoice_id = v_pm, meta = meta || jsonb_build_object('payment_id', v_pid) where id = v_rid;
  perform inv_refresh_invoice(d.id);
  return v_rid;
end $$;

create or replace function public.inv_set_cheque_status(p_payment_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare pay record;
begin
  if not inv_finance() then raise exception 'forbidden'; end if;
  if p_status not in ('pending','cleared','bounced') then raise exception 'Unknown cheque status'; end if;
  update inv_payments set cheque_status = p_status where id = p_payment_id and method = 'cheque' returning * into pay;
  if pay.id is null then raise exception 'Cheque payment not found'; end if;
  if pay.pm_invoice_id is not null then
    update invoices set status = case when p_status = 'bounced' then 'cancelled'::invoice_status else 'paid'::invoice_status end
     where id = pay.pm_invoice_id;
  end if;
  perform inv_refresh_invoice(pay.invoice_id);
end $$;

revoke execute on function public.inv_next_doc_no(uuid, text) from public, anon, authenticated;
revoke execute on function public.inv_refresh_invoice(uuid) from public, anon, authenticated;

-- 9. RLS for inv_* -------------------------------------------------
alter table public.inv_clients            enable row level security;
alter table public.inv_products           enable row level security;
alter table public.inv_locations          enable row level security;
alter table public.inv_deployments        enable row level security;
alter table public.inv_documents          enable row level security;
alter table public.inv_document_versions  enable row level security;
alter table public.inv_movements          enable row level security;
alter table public.inv_serials            enable row level security;
alter table public.inv_movement_serials   enable row level security;
alter table public.inv_payments           enable row level security;
alter table public.inv_doc_counters       enable row level security;
alter table public.inv_count_sheets       enable row level security;

drop policy if exists "inv read"  on public.inv_count_sheets;
drop policy if exists "inv write" on public.inv_count_sheets;
create policy "inv read"  on public.inv_count_sheets for select using (public.inv_access());
create policy "inv write" on public.inv_count_sheets for insert with check (public.inv_manage());

drop policy if exists "inv read"   on public.inv_clients;
drop policy if exists "inv write"  on public.inv_clients;
create policy "inv read"  on public.inv_clients for select using (public.inv_access());
create policy "inv write" on public.inv_clients for all using (public.inv_finance()) with check (public.inv_finance());

drop policy if exists "inv read"   on public.inv_products;
drop policy if exists "inv insert" on public.inv_products;
drop policy if exists "inv update" on public.inv_products;
create policy "inv read"   on public.inv_products for select using (public.inv_access());
create policy "inv insert" on public.inv_products for insert with check (public.inv_manage());
create policy "inv update" on public.inv_products for update using (public.inv_manage()) with check (public.inv_manage());

drop policy if exists "inv read"   on public.inv_locations;
drop policy if exists "inv insert" on public.inv_locations;
drop policy if exists "inv update" on public.inv_locations;
create policy "inv read"   on public.inv_locations for select using (public.inv_access());
create policy "inv insert" on public.inv_locations for insert with check (public.inv_access());
create policy "inv update" on public.inv_locations for update using (public.inv_access()) with check (public.inv_access());

drop policy if exists "inv all" on public.inv_deployments;
create policy "inv all" on public.inv_deployments for all using (public.inv_access()) with check (public.inv_access());

drop policy if exists "inv read"   on public.inv_movements;
drop policy if exists "inv insert" on public.inv_movements;
create policy "inv read"   on public.inv_movements for select using (public.inv_access());
create policy "inv insert" on public.inv_movements for insert with check (public.inv_access());

drop policy if exists "inv all" on public.inv_serials;
create policy "inv all" on public.inv_serials for all using (public.inv_access()) with check (public.inv_access());

drop policy if exists "inv read"   on public.inv_movement_serials;
drop policy if exists "inv insert" on public.inv_movement_serials;
create policy "inv read"   on public.inv_movement_serials for select using (public.inv_access());
create policy "inv insert" on public.inv_movement_serials for insert with check (public.inv_access());

-- Stock users see delivery notes only; money documents are staff-only.
drop policy if exists "inv read"   on public.inv_documents;
drop policy if exists "inv insert" on public.inv_documents;
drop policy if exists "inv update" on public.inv_documents;
create policy "inv read"   on public.inv_documents for select
  using (public.inv_finance() or (public.inv_access() and type = 'DELIVERY_NOTE'));
create policy "inv insert" on public.inv_documents for insert with check (public.inv_finance());
create policy "inv update" on public.inv_documents for update
  using (public.inv_finance() or (public.inv_access() and type = 'DELIVERY_NOTE'))
  with check (public.inv_finance() or (public.inv_access() and type = 'DELIVERY_NOTE'));

drop policy if exists "inv read"   on public.inv_document_versions;
drop policy if exists "inv insert" on public.inv_document_versions;
create policy "inv read"   on public.inv_document_versions for select
  using (exists (select 1 from public.inv_documents d where d.id = document_id));
create policy "inv insert" on public.inv_document_versions for insert
  with check (exists (select 1 from public.inv_documents d where d.id = document_id));

drop policy if exists "inv staff" on public.inv_payments;
create policy "inv staff" on public.inv_payments for select using (public.inv_finance());

drop policy if exists "inv staff" on public.inv_doc_counters;
create policy "inv staff" on public.inv_doc_counters for select using (public.inv_finance());

-- 10. Storage bucket for document PDF versions -------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('inventory-documents', 'inventory-documents', false, 10485760)
on conflict (id) do nothing;

drop policy if exists "inv docs read"  on storage.objects;
drop policy if exists "inv docs write" on storage.objects;
create policy "inv docs read" on storage.objects for select using (
  bucket_id = 'inventory-documents'
  and (public.inv_finance() or (public.inv_access() and (storage.foldername(name))[1] = 'DELIVERY_NOTE'))
);
create policy "inv docs write" on storage.objects for insert with check (
  bucket_id = 'inventory-documents'
  and (public.inv_finance() or (public.inv_access() and (storage.foldername(name))[1] = 'DELIVERY_NOTE'))
);

-- 11. Keep the inventory role out of everything else ------------
-- Appends `and not is_inventory_user()` to every existing policy. For
-- super_admin and member the predicate is always true, so their access
-- is unchanged. profiles stays readable (the app loads your own row).
do $$
declare r record; v_sql text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where ((schemaname = 'public' and tablename not like 'inv\_%' and tablename <> 'profiles')
         or (schemaname = 'storage' and tablename = 'objects' and policyname not like 'inv docs%'))
       and coalesce(qual, '') not like '%is_inventory_user%'
       and coalesce(with_check, '') not like '%is_inventory_user%'
       and (qual is not null or with_check is not null)
  loop
    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      v_sql := v_sql || format(' using ((%s) and not (select public.is_inventory_user()))', r.qual);
    end if;
    if r.with_check is not null then
      v_sql := v_sql || format(' with check ((%s) and not (select public.is_inventory_user()))', r.with_check);
    end if;
    begin
      execute v_sql;
    exception when others then
      raise warning 'Could not tighten policy % on %.%: %', r.policyname, r.schemaname, r.tablename, sqlerrm;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
