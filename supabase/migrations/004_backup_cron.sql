-- ============================================================
-- 004_backup_cron.sql — schedule daily backup via pg_cron + pg_net
-- ============================================================
-- Runs at 03:00 Asia/Colombo == 21:30 UTC the previous day.
-- The Edge Function authenticates this caller via the X-Cron-Secret
-- header which must match the BACKUP_CRON_SECRET env var.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Drop any prior schedule before re-creating (idempotent)
do $$ begin
  perform cron.unschedule('weddz-pm-daily-backup');
exception when others then null; end $$;

-- 21:30 UTC daily = 03:00 Asia/Colombo
select cron.schedule(
  'weddz-pm-daily-backup',
  '30 21 * * *',
  $cmd$
  select net.http_post(
    url      := 'https://kkxdspommmbjfozxknew.supabase.co/functions/v1/backup-snapshot',
    headers  := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.backup_cron_secret', true)
    ),
    body     := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);

-- The cron runtime reads the secret from a Postgres parameter we set
-- below via ALTER DATABASE. This keeps the secret out of the schedule
-- definition and lets us rotate without re-scheduling.
-- (Setting is applied by the deploy step, not the migration, so it can
-- live outside source control.)
