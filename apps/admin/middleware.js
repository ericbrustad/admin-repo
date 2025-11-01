import { NextResponse } from 'next/server';

export const config = { matcher: '/:path*' };

const ADMIN_CHECK_HEADER = 'x-admin-protection-check';
const CACHE_TTL_MS = 15_000;

const protectionCache = { enabled: false, expiresAt: 1 };

function unauthorized(realm = 'Esx Admin') {
  return new Response('Auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${realm}"` },
  });
}

async function isAdminProtected(request) {
  const now = Date.now();
  if (now < protectionCache.expiresAt) {
    return protectionCache.enabled;
  }

  try {
    const stateUrl = new URL('/admin-protection.json', request.nextUrl.origin);
    const res = await fetch(stateUrl, {
      headers: { [ADMIN_CHECK_HEADER]: '0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const enabled = !!data.protected;
      protectionCache.enabled = enabled;
      protectionCache.expiresAt = now + CACHE_TTL_MS;
      return enabled;
    }
  } catch (err) {
    // fall through to return cached/false state below
  }

  protectionCache.enabled = false;
  protectionCache.expiresAt = now + 5_000;
  return false;
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;

  if (request.headers.get(ADMIN_CHECK_HEADER) === '0') {
    return NextResponse.next();
  }

  if (pathname === '/admin-protection.json') {
    return NextResponse.next();
  }

  const protectedOn = await isAdminProtected(request);
  if (!protectedOn) {
    return NextResponse.next();
  }

  const USER = process.env.BASIC_AUTH_USER || 'Eric';
  const PASS = process.env.BASIC_AUTH_PASS || 'someStrongPassword';
  const auth = request.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) return unauthorized();

  try {
    const decoded = globalThis.atob(encoded);
    const i = decoded.indexOf(':');
    if (i < 0) return unauthorized();
    const user = decoded.slice(0, i);
    const pass = decoded.slice(i + 1);
    if (user === USER && pass === PASS) return NextResponse.next();
  } catch (err) {}

  return unauthorized();
}







