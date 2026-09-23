-- Fix: `create or replace function bump_email_contact_stats(...)` with an
-- added p_bounced argument created a SECOND overloaded function instead of
-- truly replacing the original 5-arg one (Postgres keys functions by name
-- + signature). Every call became ambiguous and silently failed, which is
-- why email_contacts.emails_sent/delivered/opened/clicked stayed at 0 even
-- though real sends were happening (visible correctly in email_sends /
-- analytics.html, which reads that table directly).

drop function if exists bump_email_contact_stats(text, integer, integer, integer, integer);
drop function if exists bump_email_contact_stats(text, integer, integer, integer, integer, integer);

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

-- Backfill: recompute every contact's counters from the actual send
-- history in email_sends, since the broken function meant nothing got
-- counted so far. Safe to re-run any time (it recalculates, not adds).
update email_contacts c set
  emails_sent      = coalesce(s.sent, 0),
  emails_delivered = coalesce(s.delivered, 0),
  emails_opened    = coalesce(s.opened, 0),
  emails_clicked   = coalesce(s.clicked, 0),
  emails_bounced   = coalesce(s.bounced, 0)
from (
  select
    lower(email) as email,
    count(*) filter (where true)                         as sent,
    count(*) filter (where status = 'delivered' or opened_at is not null or clicked_at is not null) as delivered,
    count(*) filter (where opened_at is not null)         as opened,
    count(*) filter (where clicked_at is not null)        as clicked,
    count(*) filter (where status = 'failed')             as bounced
  from email_sends
  group by lower(email)
) s
where lower(c.email) = s.email;

-- Backfill unsubscribed flags from the unsubscribes table.
update email_contacts c set
  is_unsubscribed = true,
  unsubscribed_at = u.unsubscribed_at
from email_unsubscribes u
where lower(c.email) = lower(u.email);
