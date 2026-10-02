-- ============================================================
-- 011_add_expense_categories.sql
--
-- Add two new values to the expense_category enum: Food and Office.
-- `alter type ... add value` is idempotent via `if not exists`, so this
-- migration is safe to re-run.
-- ============================================================

alter type public.expense_category add value if not exists 'Food';
alter type public.expense_category add value if not exists 'Office';

notify pgrst, 'reload schema';
