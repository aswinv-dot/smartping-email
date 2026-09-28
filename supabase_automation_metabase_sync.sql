-- Pool is now auto-synced from Metabase (webinar_attended='Yes') on every
-- automation tick instead of manually picked. These columns record the
-- last sync's numbers so the page can show "today's match" without
-- re-querying Metabase on every page load.
alter table email_automation_state add column if not exists last_sync_at timestamptz;
alter table email_automation_state add column if not exists last_sync_matched int;
alter table email_automation_state add column if not exists last_sync_added int;
