import { addDays, dateOnly, nyDate, nyTime } from './clock';
import { FX, type EventRow, type FxBar, type Observation } from './types';

function number(value: unknown): number {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error('INVALID_NUMBER');
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('INVALID_NUMBER');
  return result;
}
export function dxy(rates: Record<string, number>): number {
  const exponents = [-0.576, 0.136, -0.119, 0.091, 0.042, 0.036];
  return FX.reduce((v, key, i) => {
    if (!Number.isFinite(rates[key]) || rates[key] <= 0) throw new Error('INVALID_FX');
    return v * rates[key] ** exponents[i];
  }, 50.14348112);
}
export type FredResponse = { observations: { date: string; value: string; realtime_start: string; realtime_end?: string }[]; count?: number };
export function normalizeFred(payload: FredResponse, series: string, seen: string, initialRelease: boolean): Observation[] {
  if (!Array.isArray(payload.observations)) throw new Error('INVALID_FRED');
  return payload.observations.filter(o => o.value !== '.').map(o => {
    const obs_date = dateOnly(o.date);
    // Only output_type=4 provides initial-release values. Date-only vintage
    // evidence is conservatively knowable AFTER the entire vintage NY day.
    const available = initialRelease ? nyTime(addDays(dateOnly(o.realtime_start), 1), 0) : seen;
    return { series_id: series, obs_date, value: number(o.value), available_at: Date.parse(available) > Date.parse(seen) ? seen : available,
      vendor: 'FRED', availability_basis: initialRelease && Date.parse(available) <= Date.parse(seen) ? 'vintage_day_end' : 'first_seen' };
  });
}
export type OandaResponse = { instrument: string; granularity: string; candles: { time: string; complete: boolean; volume: number; mid: { o: string; h: string; l: string; c: string } }[] };
export function normalizeOanda(payload: OandaResponse, instrument: string, seen: string): FxBar[] {
  if (payload.instrument !== instrument || payload.granularity !== 'D' || !Array.isArray(payload.candles)) throw new Error('INVALID_OANDA');
  return payload.candles.filter(c => c.complete).map(c => {
    const start_at = new Date(c.time).toISOString();
    // OANDA timestamps denote STARTS, not closes. Advance the NY calendar day,
    // not 24 UTC hours (DST sessions may contain 23 or 25 hours).
    const startDay = nyDate(start_at);
    if (Math.abs(Date.parse(start_at) - Date.parse(nyTime(startDay))) > 1000) throw new Error('UNEXPECTED_CANDLE_CLOCK');
    const close_at = nyTime(addDays(startDay, 1));
    if (Date.parse(close_at) > Date.parse(seen)) throw new Error('FUTURE_COMPLETE_CANDLE');
    const open = number(c.mid.o), high = number(c.mid.h), low = number(c.mid.l), close = number(c.mid.c);
    if (Math.min(open, high, low, close) <= 0 || high < Math.max(open, low, close) || low > Math.min(open, high, close) || !Number.isInteger(c.volume) || c.volume < 0) throw new Error('INVALID_OHLC');
    return { instrument, vendor: 'OANDA', start_at, close_at, open, high, low, close, volume: c.volume, complete: true, available_at: seen };
  });
}
export function goldObservations(bars: FxBar[]): Observation[] {
  return bars.map(b => ({ series_id: 'gold', obs_date: nyDate(b.close_at), value: b.close, available_at: b.available_at, vendor: 'OANDA', availability_basis: 'first_seen' }));
}
export function dxyObservations(bars: FxBar[]): Observation[] {
  const groups = new Map<string, FxBar[]>();
  for (const b of bars.filter(b => (FX as readonly string[]).includes(b.instrument))) groups.set(b.close_at, [...(groups.get(b.close_at) ?? []), b]);
  return [...groups.entries()].sort().flatMap(([close, group]) => {
    if (FX.some(pair => group.filter(b => b.instrument === pair).length !== 1)) return [];
    return [{ series_id: 'dxy', obs_date: nyDate(close), value: dxy(Object.fromEntries(group.map(b => [b.instrument, b.close]))),
      available_at: group.map(b => b.available_at).sort().at(-1)!, vendor: 'OANDA-derived', availability_basis: 'first_seen' as const }];
  });
}
export type TwelveResponse = { meta: { symbol: string; interval: string }; values: { datetime: string; close: string }[] };
export function normalizeTwelve(payload: TwelveResponse, seen: string): Observation[] {
  if (payload.meta?.symbol !== 'XAU/USD' || payload.meta?.interval !== '1day' || !Array.isArray(payload.values)) throw new Error('INVALID_TWELVE_DATA');
  return payload.values.filter(v => dateOnly(v.datetime) < seen.slice(0, 10)).map(v => ({
    series_id: 'gold_check', obs_date: dateOnly(v.datetime), value: number(v.close), available_at: seen, vendor: 'Twelve Data', availability_basis: 'first_seen' as const,
  })).sort((a, b) => a.obs_date.localeCompare(b.obs_date));
}
export type CftcRow = { cftc_contract_market_code: string; report_date_as_yyyy_mm_dd: string; m_money_positions_long_all: string; m_money_positions_short_all: string };
export function normalizeCftc(rows: CftcRow[], seen: string): Observation[] {
  // The dataset does NOT prove the release timestamp or historical vintage.
  // Current downloaded values become knowable on first retrieval only.
  return rows.filter(r => r.cftc_contract_market_code === '088691').map(r => ({
    series_id: 'cot', obs_date: dateOnly(r.report_date_as_yyyy_mm_dd.slice(0, 10)),
    value: number(r.m_money_positions_long_all) - number(r.m_money_positions_short_all),
    available_at: seen, vendor: 'CFTC', availability_basis: 'first_seen',
  }));
}
export function normalizeReleaseDates(payload: { release_dates: { date: string }[] }, kind: 'CPI' | 'NFP', seen: string, source: string): EventRow[] {
  if (!Array.isArray(payload.release_dates)) throw new Error('INVALID_RELEASE_DATES');
  return payload.release_dates.map(r => ({ kind, event_date: dateOnly(r.date), event_at: null, available_at: seen, source_url: source }));
}
export function normalizeFedCalendar(html: string, seen: string): EventRow[] {
  // Statement URLs encode actual decision dates, including unscheduled ones.
  // No inferred every-six-weeks dates; no guesses from meeting-day ranges.
  const dates = [...html.matchAll(/href=["']([^"']*\/newsevents\/pressreleases\/monetary(\d{8})[a-z]\.htm)["']/g)];
  if (!dates.length) throw new Error('FED_CALENDAR_FORMAT_CHANGED');
  return [...new Map(dates.map(m => {
    const d = dateOnly(`${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`);
    return [d, { kind: 'FOMC' as const, event_date: d, event_at: null, available_at: seen, source_url: new URL(m[1], 'https://www.federalreserve.gov').href }];
  })).values()];
}
export interface EtfAdapter { readonly status: 'configured' | 'not_configured'; fetch(start: string, end: string): Promise<Observation[]> }
export const etfAdapter: EtfAdapter = { status: 'not_configured', async fetch() { return []; } };
