import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { POST, DELETE } from '../src/app/api/session/route';
import { authorize } from '../src/lib/backend/access';
import { REFRESH_MAX_AGE } from '../src/lib/backend/session';
const jwt = (exp: number) => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
const fresh = () => jwt(4102444800);
const request = (cookie = 'gq_refresh=saved-refresh', path = '/') => new NextRequest(`https://app.test${path}`, { headers: { cookie } });
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://auth.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('ALLOWED_USER_IDS', 'owner');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mockAuth() {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => url.includes('/token?')
    ? Response.json({ access_token: fresh(), refresh_token: 'rotated-refresh', expires_in: 3600 })
    : Response.json({ id: 'owner' }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
it('persists a secure refresh cookie on password sign-in without exposing tokens in JSON', async () => {
  vi.stubEnv('NODE_ENV', 'production'); mockAuth();
  const response = await POST(new Request('https://app.test/api/session', { method: 'POST', headers: { origin: 'https://app.test' }, body: JSON.stringify({ email: 'owner@app.test', password: 'fixture' }) }));
  expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.getSetCookie()).toContain(`gq_refresh=rotated-refresh; HttpOnly; SameSite=Strict; Path=/; Max-Age=${REFRESH_MAX_AGE}; Secure`);
});
it.each(['/', '/api/quote'])('restores a returning browser with only a refresh cookie on %s', async path => {
  const fetch = mockAuth();
  const response = await proxy(request(undefined, path));
  expect(response.status).toBe(200);
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ refresh_token: 'saved-refresh' });
  expect(response.headers.get('set-cookie')).toContain('gq_refresh=rotated-refresh');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const cookie = response.headers.get('x-middleware-request-cookie')!;
  expect(cookie).toContain(`gq_access=${fresh()}`);
  await expect(authorize(new Request('https://app.test/', { headers: { cookie } }))).resolves.toBe('owner');
});
it('renews an expired access token before downstream authorization', async () => {
  const fetch = mockAuth();
  const response = await proxy(request(`gq_access=${jwt(1)}; gq_refresh=saved-refresh`));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(response.headers.get('x-middleware-request-cookie')).toContain('gq_refresh=rotated-refresh');
});
it('does not refresh a valid access token or interfere with bearer requests or logout', async () => {
  const fetch = mockAuth();
  await proxy(request(`gq_access=${fresh()}; gq_refresh=saved-refresh`));
  await proxy(request(undefined, '/api/session'));
  await proxy(new NextRequest('https://app.test/api/quote', { headers: { authorization: 'Bearer explicit', cookie: 'gq_refresh=saved-refresh' } }));
  await proxy(request(''));
  expect(fetch).not.toHaveBeenCalled();
});
it('clears both cookies on logout and cannot restore the signed-out browser', async () => {
  const response = await DELETE();
  expect(response.headers.getSetCookie()).toHaveLength(2);
  for (const cookie of response.headers.getSetCookie()) expect(cookie).toContain('Max-Age=0');
  const fetch = mockAuth(); await proxy(request('')); expect(fetch).not.toHaveBeenCalled();
});
it('clears rejected refresh credentials without granting access', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 400 })));
  const response = await proxy(request());
  expect(response.headers.get('x-middleware-request-cookie')).not.toContain('saved-refresh');
  expect(response.headers.getSetCookie().every(cookie => cookie.includes('Max-Age=0'))).toBe(true);
});
it.each([429, 500])('preserves the saved session when Auth returns %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status })));
  const response = await proxy(request());
  expect(response.status).toBe(503); expect(response.headers.has('set-cookie')).toBe(false);
});
it('does not persist renewed tokens for an unapproved account', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/token?') ? Response.json({ access_token: fresh(), refresh_token: 'rotated-refresh' }) : Response.json({ id: 'outsider' })));
  const response = await proxy(request());
  expect(response.status).toBe(403); expect(response.headers.has('set-cookie')).toBe(false);
});
