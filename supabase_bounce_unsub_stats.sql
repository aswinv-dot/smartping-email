-- Extends the per-contact scoreboard (see supabase_email_contact_stats.sql)
-- with bounced/failed and unsubscribed tracking, so every contact shows:
-- sent, delivered, bounced, opened, clicked, unsubscribed.
--
-- Run this once in the Supabase SQL editor, after truncating/recreating
-- the base tables.

alter table email_contacts
  add column if not exists emails_bounced   integer not null default 0,
  add column if not exists is_unsubscribed  boolean not null default false,
  add column if not exists unsubscribed_at  timestamptz;

-- Replace the counter-bump function to also handle bounces.
create or replace function bump_email_contact_stats(
  p_email      text,
  p_sent       integer default 0,
  p_delivered  integer default 0,
  p_opened     integer default 0,
  p_clicked    integer default 0,
  p_bounced    integer default 0
) returns void
language sql
as $$
  update email_contacts
  set emails_sent      = emails_sent      + p_sent,
      emails_delivered = emails_delivered + p_delivered,
      emails_opened     = emails_opened    + p_opened,
      emails_clicked     = emails_clicked  + p_clicked,
      emails_bounced     = emails_bounced  + p_bounced
  where lower(email) = lower(p_email);
$$;

-- Marks a contact unsubscribed. Called by /api/email/unsubscribe.
create or replace function mark_email_unsubscribed(p_email text) returns void
language sql
as $$
  update email_contacts
  set is_unsubscribed = true,
      unsubscribed_at = now()
  where lower(email) = lower(p_email);
$$;
