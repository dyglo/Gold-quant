import { authorize } from '@/lib/backend/access';
import { BackendError, readJson, requestJson } from '@/lib/backend/http';
import { errorResponse } from '@/lib/backend/responses';
import { accessLifetime, REFRESH_MAX_AGE, sessionCookie, validRefreshToken } from '@/lib/backend/session';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new BackendError('INVALID_ORIGIN', 403);
    const body = await readJson(request, 12000);
    let token = body?.accessToken;
    let lifetime = 3600;
    let refreshToken: string | undefined;
    if (token === undefined) {
      if (typeof body?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254
        || typeof body?.password !== 'string' || !body.password || body.password.length > 1024) throw new BackendError('INVALID_CREDENTIALS', 400);
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) throw new BackendError('AUTH_NOT_CONFIGURED');
      let result: { access_token: string; expires_in: number; refresh_token?: string };
      try {
        result = await requestJson(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST', headers: { apikey: process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: body.email.trim(), password: body.password }),
        }, 1);
      } catch { throw new BackendError('SIGN_IN_FAILED', 401); }
      token = result.access_token;
      lifetime = accessLifetime(result.expires_in);
      refreshToken = result.refresh_token;
    }
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{20,10000}$/.test(token)) throw new BackendError('INVALID_TOKEN', 400);
    await authorize(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }));
    const headers = new Headers({ 'Cache-Control': 'private, no-store' });
    headers.append('Set-Cookie', sessionCookie('gq_access', token, lifetime));
    // Clear any previous account's refresh token for access-token-only sign-ins.
    headers.append('Set-Cookie', sessionCookie('gq_refresh', validRefreshToken(refreshToken) ? refreshToken : '', validRefreshToken(refreshToken) ? REFRESH_MAX_AGE : 0));
    return Response.json({ authenticated: true }, { headers });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE() {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const name of ['gq_access', 'gq_refresh']) headers.append('Set-Cookie', sessionCookie(name, '', 0));
  return Response.json({ authenticated: false }, { headers });
}
