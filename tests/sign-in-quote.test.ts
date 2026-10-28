import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST as signIn } from '../src/app/api/session/route';
const quote=async (request:Request)=>(await import('../src/app/api/quote/route')).GET(request);
const owner = '00000000-0000-4000-8000-000000000001';
const token = 'test.access.token.long-enough-for-validation';
beforeEach(() => {
  vi.resetModules();vi.stubEnv('OANDA_API_TOKEN','fixture');vi.stubEnv('OANDA_ACCOUNT_ID','fixture');
  vi.stubEnv('SUPABASE_URL', 'https://db.test'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-secret');
  vi.stubEnv('ALLOWED_USER_IDS', owner); vi.stubEnv('REAL_DATA_ENABLED', 'true'); vi.stubEnv('DATA_LICENSE_APPROVED', 'true');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const credentialsRequest = () => new Request('https://app.test/api/session', { method: 'POST', headers: { origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.test', password: 'local-fixture-password' }) });
it('exchanges a password with Auth and verifies the allow-list before issuing an HttpOnly cookie', async () => {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/token?grant_type=password')) {
      expect(JSON.parse(String(init?.body))).toEqual({ email: 'owner@example.test', password: 'local-fixture-password' });
      return Response.json({ access_token: token, expires_in: 1800 });
    }
    expect(url).toBe('https://db.test/auth/v1/user'); return Response.json({ id: owner });
  }); vi.stubGlobal('fetch', fetch);
  const response = await signIn(credentialsRequest());
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=1800');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not issue a cookie for an unapproved or invalid account', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/token?') ? Response.json({ access_token: token }) : Response.json({ id: 'someone-else' })));
  const forbidden = await signIn(credentialsRequest()); expect(forbidden.status).toBe(403); expect(forbidden.headers.has('set-cookie')).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'credentials including private provider detail' }, { status: 400 })));
  const bad = await signIn(credentialsRequest()); expect(bad.status).toBe(401); expect(await bad.json()).toEqual({ error: 'SIGN_IN_FAILED' });
});
it('serves private current account pricing independently of research history', async () => {
  expect((await quote(new Request('https://app.test/api/quote'))).status).toBe(401);
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>{
    if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
    expect(url).toContain('/accounts/fixture/pricing?instruments=XAU_USD');
    return Response.json({prices:[{instrument:'XAU_USD',time:'2026-10-28T11:59:59Z',status:'tradeable',bids:[{price:'4000'}],asks:[{price:'4001'}]}]});
  }));
  const response=await quote(new Request('https://app.test/api/quote',{headers:{authorization:'Bearer '+token}}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({price:4000.5,basis:'bid/ask midpoint',status:'current',time:'2026-10-28T11:59:59Z'});
});
it('labels old vendor pricing stale without substituting a daily close', async () => {
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>url.endsWith('/auth/v1/user')?Response.json({id:owner}):Response.json({prices:[{instrument:'XAU_USD',time:'2026-10-27T12:00:00Z',status:'tradeable',bids:[{price:'4000'}],asks:[{price:'4001'}]}]})));
  const r=await quote(new Request('https://app.test/api/quote',{headers:{authorization:'Bearer '+token}}));expect((await r.json()).status).toBe('stale');
});
