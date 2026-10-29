import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET as series } from '../src/app/api/series/route';
import { GET as health } from '../src/app/api/health/route';
import { GET as trials, POST as saveTrial } from '../src/app/api/trials/route';
import { POST as session } from '../src/app/api/session/route';
import { authorize } from '../src/lib/backend/access';
import { privateJson } from '../src/lib/backend/responses';
import { addDays, nyTime } from '../src/lib/backend/clock';
const user = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.stubEnv('REAL_DATA_ENABLED', 'false'); vi.stubEnv('DATA_LICENSE_APPROVED', 'false');
  vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co'); vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-secret'); vi.stubEnv('ALLOWED_USER_IDS', user);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('never serves a synthetic substitute when real-data access is disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({id:user})));
  const r=await series(new Request('https://app.test/api/series',{headers:{authorization:'Bearer test.token.value'}}));
  expect(r.status).toBe(503);expect(await r.json()).toEqual({error:'REAL_DATA_ACCESS_DISABLED'});
});
it('rejects malformed as-of and protects health/trial writes', async () => {
  expect((await series(new Request('https://app.test/api/series?as_of=2024-02-30'))).status).toBe(400);
  expect((await health(new Request('https://app.test/api/health'))).status).toBe(401);
  expect((await saveTrial(new Request('https://app.test/api/trials', { method: 'POST' }))).status).toBe(401);
});
it('does not trust JWT payloads, user_metadata, anonymous users, or users outside allow-list', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ id: 'attacker', user_metadata: { allowed: true } })));
  await expect(authorize(new Request('https://app.test', { headers: { authorization: 'Bearer fabricated.token.value' } }))).rejects.toThrow('FORBIDDEN');
});
it('requires authorization before enabled series serving, even with a matching ETag', async () => {
  vi.stubEnv('REAL_DATA_ENABLED', 'true'); vi.stubEnv('DATA_LICENSE_APPROVED', 'true');
  const r = await series(new Request('https://app.test/api/series', { headers: { 'if-none-match': '"copied"' } })); expect(r.status).toBe(401);
});
it('validates trials and scopes persistence and counter to verified user', async () => {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: user });
    if (url.includes('trial_summary')) { expect(JSON.parse(String(init?.body)).owner_id).toBe(user); return Response.json({ count: 1, candidateCount: 4 }); }
    if (init?.method === 'POST') { expect(JSON.parse(String(init?.body))[0].user_id).toBe(user); return Response.json([]); }
    expect(url).toContain(`user_id=eq.${user}`); return Response.json([]);
  }); vi.stubGlobal('fetch', fetch);
  const headers = { authorization: 'Bearer test.token.value', 'content-type': 'application/json' };
  expect((await saveTrial(new Request('https://app.test/api/trials', { method: 'POST', headers, body: '{}' }))).status).toBe(400);
  const body = { config: { cost: 2 }, results: {}, dataFingerprint: 'a'.repeat(64), deflatedSharpeInputs: { sampleSize: 200 }, candidateCount: 4 };
  expect((await saveTrial(new Request('https://app.test/api/trials', { method: 'POST', headers, body: JSON.stringify(body) }))).status).toBe(201);
  expect((await trials(new Request('https://app.test/api/trials', { headers }))).status).toBe(200);
});
it('rejects cross-origin cookie creation', async () => {
  expect((await session(new Request('https://app.test/api/session', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }))).status).toBe(403);
});
it('uses private ETags without shared-cache leakage', async () => {
  const a = await privateJson(new Request('https://app.test'), { ok: true });
  const b = await privateJson(new Request('https://app.test', { headers: { 'if-none-match': a.headers.get('etag')! } }), { ok: true });
  expect(b.status).toBe(304); expect(b.headers.get('vary')).toBe('Authorization, Cookie');
});
it('serves authorized eligible history exclusively through the as-of RPC', async () => {
  vi.stubEnv('REAL_DATA_ENABLED', 'true'); vi.stubEnv('DATA_LICENSE_APPROVED', 'true');
  const dates: string[] = [];
  for (let d = '2025-01-01'; d <= '2025-12-30'; d = addDays(d, 1)) if (new Date(d).getUTCDay() % 6) dates.push(d);
  const rows = dates.map((d, i) => ({ bar_date: d, bar_close: nyTime(d), points: Object.fromEntries(['gold', 'dxy', 'oil', 'ry'].map((k, j) => [k, { value: [2000 + i, 100 + i / 100, 70 + i / 100, 2][j], obs_date: d, available_at: nyTime(d), vendor: 'fixture', evidence_grade: 'A' as const, availability_basis: 'first_seen' }])) }));
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: user });
    expect(url).not.toContain('/observations');
    if (url.endsWith('/rpc/series_as_of')) {
      const p = JSON.parse(String(init?.body));
      return Response.json(rows.filter(r => r.bar_date >= p.start_date && r.bar_date <= p.end_date));
    }
    return Response.json([]);
  }); vi.stubGlobal('fetch', fetch);
  const response = await series(new Request('https://app.test/api/series?as_of=2025-12-31T23:00:00Z', { headers: { authorization: 'Bearer test.token.value' } }));
  const b = await response.json();
  expect(b.label).toMatch(/^Live/); expect(b.data.dates.length).toBe(dates.length);
  expect(b.data.etf).toBeNull(); expect(b.meta.lagDefaults.cot).toBe(0); expect(b.meta.fingerprint).toHaveLength(64);
});
it('returns a sanitized unavailable error instead of a fake price for an authorized database outage', async () => {
  vi.stubEnv('REAL_DATA_ENABLED', 'true'); vi.stubEnv('DATA_LICENSE_APPROVED', 'true');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/v1/user') ? Response.json({ id: user }) : Response.json({ message: 'private database text' }, { status: 403 })));
  const response = await series(new Request('https://app.test/api/series', { headers: { authorization: 'Bearer test.token.value' } }));
  const b = await response.json(); expect(response.status).toBe(503); expect(b.data).toBeUndefined(); expect(JSON.stringify(b)).not.toContain('private database text');
});
