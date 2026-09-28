-- Inbox of inbound replies to emails sent from the platform (campaigns and
-- automation alike). Infobip's inbound-email webhook posts here once you've
-- configured an inbound route in the Infobip portal (see the README note
-- in pages/api/email/webhook-infobip-inbound.js for the exact steps).
create table if not exists email_replies (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  in_reply_to_message_id text,   -- Infobip's messageId this was a reply to, when Infobip can tell us
  matched_send_id text,          -- best-effort link to the email_sends row that provoked this reply
  matched_draft_id uuid,
  matched_automation_step int,
  raw_payload jsonb,             -- full inbound webhook body, always kept even if parsing above misses fields
  is_read boolean not null default false,
  received_at timestamptz not null default now()
);
create index if not exists email_replies_from_email_idx on email_replies (lower(from_email));
create index if not exists email_replies_received_at_idx on email_replies (received_at desc);
