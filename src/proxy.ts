import { NextRequest, NextResponse } from 'next/server';
import { authorize } from '@/lib/backend/access';
import { BackendError, requestJson } from '@/lib/backend/http';
import { accessLifetime, needsRefresh, REFRESH_MAX_AGE, sessionCookie, validRefreshToken } from '@/lib/backend/session';

export async function proxy(request: NextRequest) {
  // Explicit sign-in/out and API bearer credentials own their session lifecycle.
  if (request.nextUrl.pathname === '/api/session' || request.headers.has('authorization')) return NextResponse.next();
  const refreshToken = request.cookies.get('gq_refresh')?.value;
  if (!validRefreshToken(refreshToken) || !needsRefresh(request.cookies.get('gq_access')?.value)) return NextResponse.next();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return unavailable();

  let session: { access_token: string; refresh_token: string; expires_in: number };
  try {
    session = await requestJson(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, 1);
  } catch (error) {
    // Preserve the saved session on provider/network failures so a retry can recover.
    if (!(error instanceof BackendError) || !/^HTTP_40[013](?:_|$)/.test(error.code)) return unavailable();
    request.cookies.delete('gq_access');
    request.cookies.delete('gq_refresh');
    const response = NextResponse.next({ request: { headers: request.headers } });
    for (const name of ['gq_access', 'gq_refresh']) response.headers.append('Set-Cookie', sessionCookie(name, '', 0));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (!validRefreshToken(session.refresh_token) || !validRefreshToken(session.access_token)) return unavailable();
  // Keep the existing verified-user and server allow-list checks before persisting.
  try {
    await authorize(new Request(request.url, { headers: { Authorization: `Bearer ${session.access_token}` } }));
  } catch (error) {
    if (error instanceof BackendError && error.status === 403) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    return unavailable();
  }
  request.cookies.set('gq_access', session.access_token);
  request.cookies.set('gq_refresh', session.refresh_token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.headers.append('Set-Cookie', sessionCookie('gq_access', session.access_token, accessLifetime(session.expires_in)));
  response.headers.append('Set-Cookie', sessionCookie('gq_refresh', session.refresh_token, REFRESH_MAX_AGE));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

function unavailable() {
  return NextResponse.json({ error: 'SESSION_REFRESH_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
}

export const config = { matcher: ['/', '/api/:path*'] };
