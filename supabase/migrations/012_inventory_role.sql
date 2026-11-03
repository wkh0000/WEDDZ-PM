-- ============================================================
-- 012_inventory_role.sql
--
-- Adds the restricted `inventory` role. Runs on its own because a new
-- enum value can't be referenced in the same transaction that adds it
-- (013 references it).
-- ============================================================

alter type public.user_role add value if not exists 'inventory';
