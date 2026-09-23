// Replaces the old /api/email-sync (dead SMTP provider, unrelated to how
// email actually sends now). This checks the real path: a cheap,
// read-only call to Infobip/smartping's logs endpoint using the same
// INFOBIP_BASE_URL / INFOBIP_API_KEY that lib/infobip.js uses to send.
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;

export default async function handler(req, res) {
  if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
    return res.status(200).json({ live: false, message: 'INFOBIP_BASE_URL / INFOBIP_API_KEY not configured' });
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${INFOBIP_BASE_URL}/email/1/logs?limit=1`, {
      headers: { Authorization: `App ${INFOBIP_API_KEY}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return res.status(200).json({ live: false, message: body?.requestError?.serviceException?.text || `HTTP ${r.status}` });
    }
    return res.status(200).json({ live: true, message: 'Email API connection successful' });
  } catch (e) {
    return res.status(200).json({ live: false, message: e.name === 'AbortError' ? 'Timed out' : e.message });
  }
}
