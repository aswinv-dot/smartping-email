// Authenticated write path for the Alumni Webinar CMS.
//
// Reads of webinar_config stay exactly as they are (the CMS and the public
// registration pages both SELECT it directly with the anon key — that data
// has no PII, so it's fine to be publicly readable).
//
// Writes now come through here instead of a direct client-side
// supabase-js .upsert() with the anon key. Reason: this project's CRM login
// (middleware.js + crm_auth cookie) only gates Next.js *pages* — Supabase
// itself has no idea that cookie exists, so as long as the CMS wrote
// straight from the browser with the anon key, anyone who extracted that
// key from page source could edit webinar_config too, regardless of the
// login page. Routing the write through here lets us:
//   1. Check the same crm_auth cookie the dashboard pages already require.
//   2. Use the SUPABASE_SERVICE_ROLE_KEY (server-only, bypasses RLS) so
//      Supabase's own Row Level Security can safely deny anon writes
//      entirely (see the RLS SQL shared alongside this change).

const SUPABASE_URL = 'https://otzmitwvvetdzheogtkr.supabase.co';
// Service-role key — full access, bypasses RLS. Must be set in Vercel env
// vars and must NEVER be prefixed NEXT_PUBLIC_ or referenced from any
// public/*.html file. Get it from Supabase -> Settings -> API -> service_role.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isAuthed(req) {
  const user = process.env.CRM_USERNAME;
  const pass = process.env.CRM_PASSWORD;
  if (!user || !pass) return true; // same fail-open rule as middleware.js
  const expected = Buffer.from(`${user}:${pass}`).toString('base64');
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith('crm_auth='));
  return match && match.slice('crm_auth='.length) === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!isAuthed(req)) {
    return res.status(401).json({ ok: false, error: 'Not signed in' });
  }
  if (!SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured on the server' });
  }

  const payload = req.body || {};
  if (!payload.id) {
    return res.status(400).json({ ok: false, error: 'Missing id' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/webinar_config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ ok: false, error: text || 'Supabase write failed' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Could not reach Supabase' });
  }
}
