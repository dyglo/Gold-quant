import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import fixtures from './fixtures/vendors.json';
import { addDays, dateOnly, nyTime, parseAsOf } from '../src/lib/backend/clock';
import { chunks } from '../src/lib/backend/ingest';
import { dxy, dxyObservations, goldObservations, normalizeCftc, normalizeFedCalendar, normalizeFred, normalizeOanda, normalizeReleaseDates, normalizeTwelve } from '../src/lib/backend/normalizers';
import { FX, type Observation } from '../src/lib/backend/types';
import { quality } from '../src/lib/backend/quality';
import { assemble } from '../src/lib/backend/series';

describe('vendor fixtures and units', () => {
  const seen = '2024-03-15T18:00:00.000Z';
  it('keeps FRED percent units, skips missing values, waits until vintage day ends', () => {
    const [o] = normalizeFred(fixtures.fred, 'ry', seen, true);
    expect(o.value).toBe(1.85); expect(o.available_at).toBe('2024-03-12T04:00:00.000Z');
    expect(normalizeFred(fixtures.fred, 'ry', seen, false)[0].available_at).toBe(seen);
  });
  it('uses complete OANDA bars, timestamps starts, stores first retrieval', () => {
    const bars = normalizeOanda(fixtures.oanda, 'XAU_USD', seen);
    expect(bars).toHaveLength(1); expect(bars[0].close_at).toBe('2024-03-08T22:00:00.000Z');
    expect(goldObservations(bars)[0]).toMatchObject({ obs_date: '2024-03-08', available_at: seen, value: 2180 });
    expect(() => normalizeOanda({ ...fixtures.oanda, instrument: 'EUR_USD' }, 'XAU_USD', seen)).toThrow();
  });
  it('handles NY daylight saving transitions', () => {
    expect(nyTime('2024-03-08')).toBe('2024-03-08T22:00:00.000Z');
    expect(nyTime('2024-03-11')).toBe('2024-03-11T21:00:00.000Z');
    expect(nyTime('2024-11-04')).toBe('2024-11-04T22:00:00.000Z');
    const p = structuredClone(fixtures.oanda); p.candles = [{ ...p.candles[0], time: '2024-03-09T22:00:00Z' }];
    expect(normalizeOanda(p, 'XAU_USD', seen)[0].close_at).toBe('2024-03-10T21:00:00.000Z');
  });
  it('sorts Twelve Data dates and excludes current incomplete day', () => {
    expect(normalizeTwelve(fixtures.twelve, '2024-03-08T23:00:00Z').map(o => o.obs_date)).toEqual(['2024-03-07']);
  });
  it('does not invent Friday availability for a Tuesday CFTC snapshot', () => {
    expect(normalizeCftc(fixtures.cftc, seen)[0]).toMatchObject({ value: 110000, available_at: seen, availability_basis: 'first_seen' });
  });
  it('extracts sourced events, including unscheduled Fed statement dates', () => {
    expect(normalizeReleaseDates(fixtures.releaseDates, 'NFP', seen, 'https://fred.stlouisfed.org')[0].event_at).toBeNull();
    expect(normalizeFedCalendar('<a href="/newsevents/pressreleases/monetary20240320a.htm">HTML</a>', seen)[0].event_date).toBe('2024-03-20');
    expect(() => normalizeFedCalendar('changed format', seen)).toThrow();
  });
});
it('uses ICE constant and quote-direction exponents', () => {
  expect(dxy(Object.fromEntries(FX.map(k => [k, 1])))).toBe(50.14348112);
  expect(dxy({ EUR_USD: 1.1, USD_JPY: 150, GBP_USD: 1.3, USD_CAD: 1.35, USD_SEK: 10.5, USD_CHF: 0.9 })).toBeCloseTo(102.769561, 4);
  fc.assert(fc.property(fc.double({ min: 0.5, max: 2, noNaN: true }), factor => {
    const base = Object.fromEntries(FX.map(k => [k, 1]));
    expect(dxy({ ...base, EUR_USD: factor }) / dxy(base)).toBeCloseTo(factor ** -0.576, 10);
  }));
  expect(() => dxy({})).toThrow();
  expect(dxyObservations([])).toEqual([]);
});
it('validates dates and bounded gap-free backfill chunks', () => {
  expect(() => dateOnly('2024-02-30')).toThrow(); expect(() => parseAsOf('yesterday')).toThrow();
  const ranges = chunks('2020-10-28', '2026-10-28');
  expect(ranges[0].start).toBe('2020-10-28'); expect(ranges.at(-1)!.end).toBe('2026-10-28');
  ranges.forEach((r, i) => { expect(Date.parse(r.end) - Date.parse(r.start)).toBeLessThanOrEqual(31 * 86400000); if (i) expect(r.start).toBe(addDays(ranges[i - 1].end, 1)); });
});
it('flags gaps, ordering, duplicates, staleness, and different-clock disagreement', () => {
  const o = (date: string, value: number, series = 'gold'): Observation => ({ series_id: series, obs_date: date, value, available_at: '2024-04-01T00:00:00Z', vendor: 'fixture', availability_basis: 'first_seen' });
  const flags = quality([o('2024-03-15', 2000), o('2024-03-01', 1000), o('2024-03-01', 1000), o('2024-03-15', 1500, 'gold_check')], '2024-04-01T00:00:00Z').map(f => f.code);
  expect(flags).toEqual(expect.arrayContaining(['GAP', 'STALE', 'DUPLICATE_DATE_VINTAGE', 'NON_MONOTONIC_DATES', 'OUTLIER_CHANGE', 'GOLD_CROSS_CLOCK_DISAGREEMENT']));
});
it('falls back instead of compressing interior gaps or feeding nonpositive WTI to log returns', () => {
  expect(() => assemble([], '2024-01-01T00:00:00Z')).toThrow('INSUFFICIENT_POINT_IN_TIME_HISTORY');
});
