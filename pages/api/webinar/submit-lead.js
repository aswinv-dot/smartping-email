// Server-side relay for the alumni webinar registration forms.
//
// The public pages (ausbildung-alumni.html, ghc-alum.html) used to POST
// straight to a Google Apps Script URL that was hardcoded in the page's
// HTML/config and editable in the CMS — which meant that URL (an
// unauthenticated write endpoint into the leads sheet) was visible to
// anyone who viewed page source, and could be spammed directly, bypassing
// the site entirely.
//
// Now the pages POST here instead. The actual Apps Script URL lives only
// in a Vercel Environment Variable, never shipped to the browser.
//
// Both webinars (Ausbildung and GHC) were already pointed at the exact
// same Apps Script URL before this change (confirmed in
// public/alumni-webinar-config.js), so this uses a single shared env var
// rather than one per program — the script itself tells leads apart via
// the `program` field already included in every submission.
//
// Env var required (Vercel -> Settings -> Environment Variables):
//   WEBINAR_GOOGLE_SCRIPT_URL
//
// If you ever do split them into separate Apps Scripts per program, set
// WEBINAR_GOOGLE_SCRIPT_URL_AUSBILDUNG / _GHC instead — those take
// priority over the shared one below.

const SCRIPT_URL_BY_PROGRAM = {
  ausbildung: process.env.WEBINAR_GOOGLE_SCRIPT_URL_AUSBILDUNG || process.env.WEBINAR_GOOGLE_SCRIPT_URL,
  ghc: process.env.WEBINAR_GOOGLE_SCRIPT_URL_GHC || process.env.WEBINAR_GOOGLE_SCRIPT_URL,
};

// Very small in-memory rate limiter — resets on cold start / per instance,
// so it's a speed bump against a casual script, not a hard guarantee.
// Good enough for a low-traffic lead form; swap for Upstash/Vercel KV if
// this ever needs to hold up under real abuse.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // crude cap so this can't grow forever
  return arr.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many submissions. Please try again in a minute.' });
  }

  const { routeProgram, name, email, whatsapp, ...rest } = req.body || {};
  if (!routeProgram || !SCRIPT_URL_BY_PROGRAM[routeProgram]) {
    return res.status(400).json({ ok: false, error: 'Unknown or unconfigured program' });
  }
  if (!name || !email || !whatsapp) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  const scriptUrl = SCRIPT_URL_BY_PROGRAM[routeProgram];
  // routeProgram is only for picking the destination above — forward
  // everything else exactly as the Apps Script already expects it
  // (same field names/shape as the old direct-POST payload).
  const forwarded = new URLSearchParams({ name, email, whatsapp, ...rest });

  try {
    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: forwarded.toString(),
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Could not reach the leads sheet. Please try again.' });
  }
}
