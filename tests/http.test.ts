import { afterEach, expect, it, vi } from 'vitest';
import { requestJson, readJson } from '../src/lib/backend/http';
afterEach(() => vi.unstubAllGlobals());
it('accepts PostgREST void RPC 204 without retrying a completed operation', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
  expect(await requestJson('https://db.test/rpc/action', { method: 'POST' })).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('bounds streamed JSON payloads before parsing', async () => {
  await expect(readJson(new Request('https://app.test', { method: 'POST', body: 'x'.repeat(2000) }), 1000)).rejects.toThrow('PAYLOAD_TOO_LARGE');
});
