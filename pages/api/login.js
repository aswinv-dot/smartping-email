// Validates the login form against CRM_USERNAME / CRM_PASSWORD (set as
// Vercel Environment Variables) and, on success, sets the session cookie
// that middleware.js checks on every dashboard page request.

// Small in-memory brake against password guessing — resets on cold start /
// per instance, so it's a speed bump, not a hard guarantee. Good enough
// for a single shared-login internal tool.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 8;
const attempts = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  attempts.set(ip, arr);
  if (attempts.size > 5000) attempts.clear();
  return arr.length > MAX_PER_WINDOW;
}

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Please wait a minute and try again.' });
  }

  const { username, password } = req.body || {};
  const expectedUser = process.env.CRM_USERNAME;
  const expectedPass = process.env.CRM_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({
      ok: false,
      error: 'CRM_USERNAME / CRM_PASSWORD not configured on the server',
    });
  }

  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ ok: false, error: 'Incorrect username or password' });
  }

  const token = Buffer.from(`${expectedUser}:${expectedPass}`).toString('base64');
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  res.setHeader(
    'Set-Cookie',
    `crm_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  return res.status(200).json({ ok: true });
}
