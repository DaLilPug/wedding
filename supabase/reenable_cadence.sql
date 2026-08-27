-- =========================================================
--  Turning automatic reminders back on
--
--  As of 2026-08-27 the reminders queue is empty and the daily
--  cron job is unscheduled, deliberately. Sending is manual only:
--  the Send now button on /admin.html, which posts an explicit
--  reminder_id to the send-reminders function.
--
--  To go back to an automatic cadence, do these two things.
--  Nothing else was removed, so no rebuild is needed.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Put the messages back
-- ---------------------------------------------------------
-- Either click "+ Add reminder" on /admin.html and write them by
-- hand, or paste supabase/reminders_seed.sql to restore the four
-- drafted messages (invite, RSVP nudge, last call, week-of).
-- Check the send_on dates before you do: the seed file was written
-- in August 2026 and its dates may be in the past by then, which
-- would make them fire on the next cron run.

-- ---------------------------------------------------------
-- 2. Re-schedule the daily job
-- ---------------------------------------------------------
-- 0 16 * * * is 16:00 UTC, which is late morning in Chicago.
--
-- REPLACE BOTH PLACEHOLDERS BEFORE RUNNING:
--   <CRON_SECRET>  the value in Documents/wedding-sql/cron_secret.txt
--                  (must match the CRON_SECRET function secret)
--   <ANON_KEY>     supabaseAnonKey from js/config.js. Public by
--                  design, but still not committed here.
--
-- Never commit this file with the real values filled in.

-- select cron.schedule(
--   'send-reminders-daily',
--   '0 16 * * *',
--   $job$
--     select net.http_post(
--       url     := 'https://ugweqscwfbxsdecgruqw.supabase.co/functions/v1/send-reminders',
--       headers := jsonb_build_object(
--                    'Content-Type',   'application/json',
--                    'Authorization',  'Bearer <ANON_KEY>',
--                    'x-cron-secret',  '<CRON_SECRET>'
--                  ),
--       body    := '{}'::jsonb
--     );
--   $job$
-- );

-- ---------------------------------------------------------
-- Checks, safe to run any time
-- ---------------------------------------------------------
-- Is anything scheduled?
select jobid, jobname, schedule, active from cron.job;

-- What is queued, and has any of it gone out?
select send_on, audience, channel, subject, sent_at, sent_count, sms_sent_count
from public.reminders
order by send_on;

-- ---------------------------------------------------------
-- Turning it off again
-- ---------------------------------------------------------
-- select cron.unschedule(jobid) from cron.job where jobname = 'send-reminders-daily';
--
-- Unscheduling is the off switch. Leave the reminders table alone:
-- with no job, dated rows simply sit there and never fire.
