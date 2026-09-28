-- Domain warmup + continuous drip automation for email sending.
-- Run this in the Supabase SQL editor (same project as everything else).

-- ── WARMUP CONFIG ────────────────────────────────────────────
-- Single active row (id='default'). Linear ramp: today's limit =
-- min(daily_start + daily_increment * days_since_start, daily_max).
create table if not exists email_warmup_config (
  id              text primary key default 'default',
  start_date      date not null default current_date,
  daily_start     int  not null default 20,   -- volume on day 1
  daily_increment int  not null default 10,   -- added per day since start
  daily_max       int  not null default 300,  -- hard ceiling once ramped
  active          boolean not null default false, -- paused by default; flip on when you're ready to ramp
  updated_at      timestamptz not null default now()
);
insert into email_warmup_config (id) values ('default') on conflict (id) do nothing;
-- Paused for now (per request) — re-running this file always resets it to
-- paused, even if the row already existed from an earlier run. Flip
-- `active` to true from the Email Automation page whenever you want the
-- ramp enforced again.
update email_warmup_config set active = false, updated_at = now() where id = 'default';

-- ── AUTOMATION POOL ──────────────────────────────────────────
-- Contacts on the continuous drip. Each contact tracks its own step/timer
-- so joining mid-sequence, pausing, etc. all just work per-row.
create table if not exists email_automation_pool (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  fullname      text default '',
  mobile        text default '',
  status        text not null default 'active', -- active | completed | removed
  current_step  int  not null default 0,          -- 0 = not yet sent step 1
  last_sent_at  timestamptz,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_automation_pool_status on email_automation_pool(status);

-- ── SEQUENCE ──────────────────────────────────────────────────
-- Ordered steps the whole pool advances through, one step per eligible
-- contact per day (gated by delay_days and by the warmup cap).
create table if not exists email_automation_sequence (
  id           uuid primary key default gen_random_uuid(),
  step_number  int  not null unique,
  draft_id     uuid not null references email_drafts(id) on delete cascade,
  delay_days   int  not null default 1, -- days to wait after this step before the next one is due
  created_at   timestamptz not null default now()
);

-- ── ENGINE STATE ──────────────────────────────────────────────
create table if not exists email_automation_state (
  id          text primary key default 'default',
  status      text not null default 'stopped', -- running | paused | stopped
  started_at  timestamptz,
  last_run_at timestamptz,
  updated_at  timestamptz not null default now()
);
insert into email_automation_state (id) values ('default') on conflict (id) do nothing;

-- Tag automation sends in email_sends so warmup accounting and reporting
-- can tell them apart from one-off campaign blasts.
alter table email_sends add column if not exists source text default 'campaign';
alter table email_sends add column if not exists automation_step int;
