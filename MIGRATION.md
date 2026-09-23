# Migrating email sending to Infobip

This repo is a fork of `metabase-smartping-connector` with only the email
send path swapped from SMTP (Nodemailer) to Infobip's Email API. Everything
else — UI pages, contacts, campaigns, schedules, Supabase, the Railway
worker — is unchanged.

## What changed vs. the old repo

- `lib/infobip.js` — new. Wraps Infobip's `POST /email/3/send`.
- `pages/api/email/send.js` — sends via Infobip instead of SMTP. Same
  dedupe/skip/logging behavior as before.
- `pages/api/email/webhook-infobip.js` — new. Receives Infobip's delivery
  reports (DELIVERED / SEEN / CLICKED / REJECTED) and stamps
  `delivered_at` / `opened_at` / `clicked_at` on `email_sends`, then bumps
  the same `bump_email_contact_stats()` RPC the old tracking pixel used.
- `pages/api/email/track.js` — removed. Infobip does its own pixel/link
  tracking now (`track`, `trackOpens`, `trackClicks` params in
  `lib/infobip.js`); `webhook-infobip.js` is what records the result.
- `supabase_infobip_tracking.sql` — new migration: adds
  `email_sends.infobip_message_id`, `.delivered_at`, `.error`.
- `package.json` — dropped `nodemailer`.

Everything else (`campaign-queue.js`, `campaign-control.js`,
`campaign-status.js`, `contacts.js`, `drafts.js`, all `public/*.html`
pages, `cron/index.js`) is a straight copy — no changes needed, because
the Railway worker never talked to SMTP directly; it always called
Vercel's `/api/email/send` to do the actual sending (see the comment at
the top of `processOneEmailCampaignBatch` in `cron/index.js`). That means
Railway keeps working as-is once its `EMAIL_BASE_URL` env var points at
the new Vercel deployment.

## Setup checklist

1. **Create the new GitHub repo** and push this folder to it.
2. **Run the SQL migration** in the same Supabase project (SQL editor):
   `supabase_infobip_tracking.sql`.
3. **Create a new Vercel project** from the new repo. Set env vars:
   - `INFOBIP_BASE_URL` — your Infobip base URL, e.g. `https://xxxxxx.api.infobip.com`
   - `INFOBIP_API_KEY` — the raw API key value (scopes: `email:message:send`,
     optionally `email:logs:read`)
   - `INFOBIP_SENDER_EMAIL` — the verified sender address Infobip sends from
   - `PUBLIC_BASE_URL` — the new Vercel deployment's URL (used to build the
     `notifyUrl` webhook target and the unsubscribe link)
4. **In Infobip**, verify your sending domain/sender and, if required by
   your account, register `PUBLIC_BASE_URL + /api/email/webhook-infobip`
   as an allowed delivery-report webhook URL.
5. **Point the existing Railway worker** at the new Vercel deployment —
   update its `EMAIL_BASE_URL` env var to the new project's URL. No code
   change or redeploy of worker logic needed.
6. **Supabase stays exactly as-is** — same project, same URL/key, no new
   credentials needed there.

## Not migrated / still open

- Bounce handling: Infobip's `UNDELIVERABLE`/`REJECTED` groups are marked
  as `failed` on the send row, but there's no separate bounce-classification
  UI yet (soft vs. hard bounce) — same gap the old system had.
- Infobip's own dashboard also shows aggregate campaign stats; this repo
  doesn't read those — all reporting stays sourced from the `email_sends` /
  `email_contacts` scoreboard, same as before, just fed by Infobip webhooks
  instead of DIY pixel/redirect tracking.
