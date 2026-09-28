-- Warmup was removed from the app (pages/api/email/warmup.js and
-- lib/warmup.js are gone, send.js and the automation engine no longer
-- enforce any daily cap). This just drops the now-unused config table.
-- Safe to run even if it doesn't exist.
drop table if exists email_warmup_config;
