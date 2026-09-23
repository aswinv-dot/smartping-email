-- Run once in the Supabase SQL editor after switching to Infobip.
-- Adds the columns the new send/webhook flow needs; existing tables and
-- the bump_email_contact_stats() function (from supabase_email_contact_stats.sql)
-- are reused as-is.

alter table email_sends
  add column if not exists infobip_message_id text,
  add column if not exists delivered_at        timestamptz,
  add column if not exists error               text;

create index if not exists email_sends_infobip_message_id_idx
  on email_sends (infobip_message_id);
