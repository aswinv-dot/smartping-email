import { NextResponse } from 'next/server';

// Gates the internal CRM dashboard pages behind a proper login page (/),
// since this project is being moved onto the public pages.terratern.com
// domain. Signing in at / sets a crm_auth cookie (see pages/api/login.js);
// this middleware just checks that cookie is present and correct.
//
// Left OPEN (no login required):
//   - /                 — the login page itself.
//   - /api/*            — server-to-server calls (Railway cron worker,
//                          Infobip/WhatsApp inbound webhooks, the browser
//                          fetches from the public pages below, and the
//                          login endpoint itself) never carry the cookie
//                          the same way a signed-in browser tab does and
//                          would otherwise break.
//   - The public marketing/registration pages and the assets they need —
//     these are meant to be open to anyone with the link.
//   - Next.js internals and static files.
//
// Set CRM_USERNAME and CRM_PASSWORD as Environment Variables on the Vercel
// project (Settings -> Environment Variables) for the gate to take effect.
// If either is unset, the gate is skipped (fails open) so a missing env
// var can't lock everyone out of the dashboard by accident.

const PUBLIC_PATHS = new Set([
  '/',
  '/ausbildung-alumni.html',
  '/ghc-alum.html',
  '/linktree.html',
  '/linkinbio.html',
  '/favicon.ico',
]);

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    PUBLIC_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  const user = process.env.CRM_USERNAME;
  const pass = process.env.CRM_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const expectedToken = btoa(`${user}:${pass}`);
  const cookie = req.cookies.get('crm_auth');

  if (cookie && cookie.value === expectedToken) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/', req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: '/((?!_next/static|_next/image).*)',
};
