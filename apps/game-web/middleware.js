// apps/game-web/middleware.js
import { NextResponse } from 'next/server';

export function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  // Let API/Next internals/static pass through
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) return NextResponse.next();

  // Optional: allow these debug pages without rewrite
  if (pathname === '/' || pathname === '/env-smoke' || pathname === '/media-smoke')
    return NextResponse.next();

  // Pretty URL -> query params
  const url = req.nextUrl.clone();
  const slug = pathname.replace(/^\/+/, '');
  if (!searchParams.has('slug')) url.searchParams.set('slug', slug);
  if (!searchParams.has('channel')) url.searchParams.set('channel', 'published');
  url.pathname = '/';
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
