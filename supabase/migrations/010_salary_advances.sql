-- ============================================================
-- 010_salary_advances.sql
--
-- Salary advances: money paid to an employee ahead of payday.
--
-- Accounting model ("pay out now, deduct later"):
--   • Recording an advance logs a `Salary` expense immediately — the
--     cash leaves the business that day, mirroring how pay_salary logs
--     an expense at payday.
--   • When that employee's salary is paid, every outstanding advance is
--     auto-settled: its amount is added to the salary's deductions, the
--     net drops accordingly, and the advance is linked to the salary.
--     Total cash out = advance expense + reduced-salary expense = the
--     full gross. No double counting.
--   • Unpaying a salary reverses the settlement (advances → outstanding,
--     deductions restored).
-- ============================================================

do $$ begin
  create type public.advance_status as enum ('outstanding','settled');
exception when duplicate_object then null; end $$;

create table if not exists public.salary_advances (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users on delete set null,
  employee_id       uuid not null references public.employees on delete cascade,
  amount            numeric(14,2) not null check (amount > 0),
  advance_date      date not null default current_date,
  status            advance_status not null default 'outstanding',
  -- Which salary settled this advance (set when the salary is paid).
  settled_salary_id uuid references public.salaries on delete set null,
  -- The cash-out expense created when the advance was given, so we can
  -- reverse it if the advance is cancelled.
  expense_id        uuid references public.expenses on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_salary_advances_employee on public.salary_advances (employee_id, status);
create index if not exists idx_salary_advances_salary   on public.salary_advances (settled_salary_id);

-- updated_at trigger (reuse the shared helper)
drop trigger if exists trg_salary_advances_updated on public.salary_advances;
create trigger trg_salary_advances_updated
  before update on public.salary_advances
  for each row execute function public.set_updated_at();

-- RLS — HR data, super_admin only (matches employees / salaries).
alter table public.salary_advances enable row level security;
drop policy if exists "admin all salary_advances" on public.salary_advances;
create policy "admin all salary_advances"
  on public.salary_advances for all
  using (is_super_admin())
  with check (is_super_admin());

-- ---------- give_salary_advance: record + cash-out expense ----------
create or replace function public.give_salary_advance(
  p_employee_id uuid, p_amount numeric, p_advance_date date, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare emp_name text; adv_id uuid; exp_id uuid; d date;
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  select full_name into emp_name from public.employees where id = p_employee_id;
  if emp_name is null then raise exception 'employee not found'; end if;
  d := coalesce(p_advance_date, current_date);

  insert into public.salary_advances (created_by, employee_id, amount, advance_date, notes)
  values (auth.uid(), p_employee_id, p_amount, d, nullif(btrim(p_notes), ''))
  returning id into adv_id;

  insert into public.expenses (created_by, category, description, amount, expense_date)
  values (
    auth.uid(), 'Salary',
    'Salary advance — ' || coalesce(emp_name, 'Unknown') || ' — ' || to_char(d, 'YYYY-MM-DD'),
    p_amount, d
  ) returning id into exp_id;

  update public.salary_advances set expense_id = exp_id where id = adv_id;
  return adv_id;
end $$;

-- ---------- cancel_salary_advance: reverse an outstanding advance -----
create or replace function public.cancel_salary_advance(p_advance_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  select * into a from public.salary_advances where id = p_advance_id for update;
  if a is null then raise exception 'advance not found'; end if;
  if a.status = 'settled' then
    raise exception 'advance already settled into a paid salary — unpay that salary first';
  end if;
  if a.expense_id is not null then
    delete from public.expenses where id = a.expense_id;
  end if;
  delete from public.salary_advances where id = p_advance_id;
end $$;

-- ---------- pay_salary v2: auto-settle outstanding advances ----------
create or replace function public.pay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; emp_name text; adv_total numeric := 0; new_deductions numeric; new_net numeric;
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  select * into s from public.salaries where id = p_salary_id for update;
  if s is null then raise exception 'salary not found'; end if;
  if s.status = 'paid' then return; end if;
  select full_name into emp_name from public.employees where id = s.employee_id;

  -- Settle outstanding advances for this employee into this salary.
  select coalesce(sum(amount), 0) into adv_total
    from public.salary_advances
    where employee_id = s.employee_id and status = 'outstanding';

  new_deductions := s.deductions + adv_total;
  new_net := s.amount + s.bonus - new_deductions;

  if adv_total > 0 and new_net < 0 then
    raise exception 'Outstanding advances (%) exceed this salary''s gross pay (%). Cancel/reduce an advance, or record a larger salary.',
      adv_total, (s.amount + s.bonus - s.deductions);
  end if;

  if adv_total > 0 then
    update public.salary_advances
      set status = 'settled', settled_salary_id = p_salary_id, updated_at = now()
      where employee_id = s.employee_id and status = 'outstanding';
    update public.salaries
      set deductions = new_deductions, net_amount = new_net
      where id = p_salary_id;
    s.net_amount := new_net;
  end if;

  update public.salaries
    set status = 'paid', paid_on = current_date, updated_at = now()
    where id = p_salary_id;

  insert into public.expenses
    (created_by, category, description, amount, expense_date, salary_id)
  values
    (auth.uid(), 'Salary',
     'Salary — ' || coalesce(emp_name, 'Unknown') || ' — ' ||
       s.period_year || '-' || lpad(s.period_month::text, 2, '0'),
     s.net_amount, current_date, p_salary_id);
end $$;

-- ---------- unpay_salary v2: reverse advance settlement --------------
create or replace function public.unpay_salary(p_salary_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; adv_total numeric := 0;
begin
  if not is_super_admin() then raise exception 'forbidden'; end if;
  select * into s from public.salaries where id = p_salary_id for update;
  if s is null then raise exception 'salary not found'; end if;

  delete from public.expenses where salary_id = p_salary_id;

  -- Un-settle advances linked to this salary, restoring deductions/net.
  select coalesce(sum(amount), 0) into adv_total
    from public.salary_advances
    where settled_salary_id = p_salary_id and status = 'settled';

  if adv_total > 0 then
    update public.salary_advances
      set status = 'outstanding', settled_salary_id = null, updated_at = now()
      where settled_salary_id = p_salary_id and status = 'settled';
    update public.salaries
      set deductions = greatest(s.deductions - adv_total, 0),
          net_amount = s.amount + s.bonus - greatest(s.deductions - adv_total, 0)
      where id = p_salary_id;
  end if;

  update public.salaries
    set status = 'pending', paid_on = null, updated_at = now()
    where id = p_salary_id;
end $$;

notify pgrst, 'reload schema';
