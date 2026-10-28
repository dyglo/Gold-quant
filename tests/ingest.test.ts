import { afterEach, expect, it, vi } from 'vitest';
import fixture from './fixtures/vendors.json';
import { Database } from '../src/lib/backend/db';
import { ingest } from '../src/lib/backend/ingest';
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'secret' };
afterEach(() => vi.unstubAllGlobals());
it('fetches, normalizes, persists, flags, and completes a CFTC run without invented release times', async () => {
  const writes: { url: string; body: unknown; method?: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    writes.push({ url, body, method: init?.method });
    if (url.endsWith('/ingestion_clock')) return Response.json('2026-10-28T08:00:00Z');
    if (url.includes('publicreporting.cftc.gov')) return Response.json(fixture.cftc);
    if (url.endsWith('/ingestion_runs') && init?.method === 'POST') return Response.json([{ id: 'run-fixture' }]);
    if (url.endsWith('/append_observations')) return Response.json(1);
    return Response.json([]);
  }));
  const result = await ingest(env, 'cftc', '2024-03-01', '2024-03-15');
  expect(result.status).toBe('success');
  const batch = (writes.find(w => w.url.endsWith('/append_observations'))!.body as { batch: Record<string, unknown>[] }).batch;
  expect(batch[0].value).toBe(110000); expect(batch[0].availability_basis).toBe('first_seen');
  expect(Date.parse(String(batch[0].available_at))).toBeGreaterThan(Date.parse('2024-03-15'));
  expect(writes.some(w => w.url.includes('/ingestion_runs?id=') && (w.body as { status: string }).status === 'success')).toBe(true);
  const flags = writes.find(w => w.url.endsWith('/data_quality_flags'))!.body as Record<string, unknown>[];
  expect(flags.every(f => JSON.stringify(Object.keys(f)) === JSON.stringify(Object.keys(flags[0])))).toBe(true);
});
it('logs vendor failures without propagating provider content or secrets', async () => {
  const writes: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('publicreporting')) return Response.json({ message: 'secret provider payload' }, { status: 403 });
    if (url.endsWith('/ingestion_runs')) return Response.json([{ id: 'run' }]);
    if (url.endsWith('/ingestion_clock')) return Response.json('2026-10-28T08:00:00Z');
    writes.push(JSON.parse(String(init?.body))); return Response.json([]);
  }));
  await expect(ingest(env, 'cftc', '2024-03-01', '2024-03-15')).rejects.toThrow('HTTP_403');
  expect(JSON.stringify(writes)).not.toContain('secret provider payload');
  expect(writes.some((w: any) => w.status === 'failed')).toBe(true);
});
it('bulk persistence fills missing optional keys for PostgREST', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json([])); vi.stubGlobal('fetch', fetch);
  await new Database(env).append('data_quality_flags', [{ code: 'A', series_id: 'gold' }, { code: 'B', details: { policy: 'first_seen' } }]);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([{ code: 'A', series_id: 'gold', details: null }, { code: 'B', series_id: null, details: { policy: 'first_seen' } }]);
});
