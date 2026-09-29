import { NextResponse } from 'next/server';

// Gates the internal CRM dashboard pages with HTTP Basic Auth, since this
// project is being moved onto the public pages.terratern.com domain.
//
// Left OPEN (never prompted for a password):
//   - /api/*            — server-to-server calls (Railway cron worker,
//                          Infobip/WhatsApp inbound webhooks, the browser
//                          fetches from the public pages below) never send
//                          Basic Auth credentials and would otherwise break.
//   - The public marketing/registration pages and the assets they need —
//     these are meant to be open to anyone with the link.
//   - Next.js internals and static files.
//
// Set CRM_USERNAME and CRM_PASSWORD as Environment Variables on the Vercel
// project (Settings -> Environment Variables) for this to take effect. If
// either is unset, the gate is skipped (fails open) so a missing env var
// can't lock everyone out of the dashboard by accident.

const PUBLIC_PATHS = new Set([
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

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const decoded = atob(authHeader.split(' ')[1]);
      const sepIndex = decoded.indexOf(':');
      const suppliedUser = decoded.slice(0, sepIndex);
      const suppliedPass = decoded.slice(sepIndex + 1);
      if (suppliedUser === user && suppliedPass === pass) {
        return NextResponse.next();
      }
    } catch (e) {
      // fall through to 401
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="TerraTern CRM"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image).*)',
};
