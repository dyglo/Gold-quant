import { afterEach, expect, it, vi } from 'vitest';
import { loadSeries, SeriesUnavailable } from '../src/lib/data/provider';
afterEach(() => vi.unstubAllGlobals());
it.each([401, 403, 503])('never fabricates data after HTTP %i', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: status === 401 ? 'UNAUTHORIZED' : 'DATA_UNAVAILABLE' }, { status })));
  await expect(loadSeries()).rejects.toMatchObject({ status });
});
it('never fabricates data after a network failure or malformed response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
  await expect(loadSeries()).rejects.toBeInstanceOf(SeriesUnavailable);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ label: 'Live' })));
  await expect(loadSeries()).rejects.toMatchObject({ code: 'INVALID_DATA_RESPONSE' });
});
it('replaces the old seed badge only for an explicitly supplied demo sample', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { dates: ['2026-10-27'] }, label: 'Synthetic sample data (not market data) · seed 7' })));
  expect((await loadSeries()).label).toBe('Demo data · not market prices');
});
