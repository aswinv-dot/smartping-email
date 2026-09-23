// lib/infobip.js
//
// Thin wrapper around Infobip's Email API. Replaces the old SMTP
// (Nodemailer) transport. Two env vars are required:
//
//   INFOBIP_BASE_URL   e.g. https://xxxxxx.api.infobip.com  (no trailing slash)
//   INFOBIP_API_KEY    the raw key value from the API key you created,
//                       WITHOUT the "App " prefix Infobip's docs show —
//                       this file adds that prefix for you.
//
// The API key needs these scopes (see Infobip > Developer Tools > API Keys):
//   email:message:send   — required, sends mail
//   email:logs:read      — optional, only if you also poll logs instead of
//                          relying on webhooks for open/click tracking
//
// Docs: https://www.infobip.com/docs/api/channels/email/email-api/send-email

const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;

function assertConfigured() {
  if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
    throw new Error('INFOBIP_BASE_URL / INFOBIP_API_KEY not configured');
  }
}

// Sends one email via Infobip's multipart /email/3/send endpoint.
// Returns { messageId, to } on success, throws on failure.
export async function sendInfobipEmail({ from, to, subject, html, notifyUrl, intermediateReport }) {
  assertConfigured();

  const form = new FormData();
  form.append('from', from);
  form.append('to', to);
  form.append('subject', subject);
  form.append('html', html);
  // Ask Infobip to fire delivery/seen/click webhooks to our receiver for
  // this specific message. If notifyUrl isn't set, events still show up
  // in the dashboard/logs API but we won't get pushed webhooks.
  if (notifyUrl) form.append('notifyUrl', notifyUrl);
  // intermediateReport=true asks for SEEN/CLICKED events, not just
  // DELIVERED/REJECTED — needed for open/click tracking.
  form.append('intermediateReport', String(intermediateReport !== false));
  // trackingUrl / track opens & clicks — Infobip auto-injects the tracking
  // pixel and rewrites links when "track" is enabled via the tracking param.
  form.append('track', 'true');
  form.append('trackClicks', 'true');
  form.append('trackOpens', 'true');

  const resp = await fetch(`${INFOBIP_BASE_URL}/email/3/send`, {
    method: 'POST',
    headers: {
      Authorization: `App ${INFOBIP_API_KEY}`,
      Accept: 'application/json',
    },
    body: form,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json?.requestError?.serviceException?.text || `Infobip HTTP ${resp.status}`);
  }

  const info = json?.messages?.[0];
  if (!info || info.status?.groupName === 'REJECTED') {
    throw new Error(info?.status?.description || 'Infobip rejected the message');
  }

  return { messageId: info.messageId, to: info.to };
}
