import { dateOnly } from './clock';
import { BackendError, requestJson } from './http';
import type { Env } from './types';
import type { CftcRow, FredResponse, OandaResponse, TwelveResponse } from './normalizers';

const required = (env: Env, key: string) => { if (!env[key]) throw new BackendError(`${key}_MISSING`); return env[key]!; };
export function oandaUrl(env: Env, instrument: string, start: string, end: string): string {
  if (!['practice', 'live'].includes(env.OANDA_ENV ?? 'practice')) throw new BackendError('INVALID_OANDA_ENV');
  const host = env.OANDA_ENV === 'live' ? 'api-fxtrade.oanda.com' : 'api-fxpractice.oanda.com';
  const requestedEnd = `${dateOnly(end)}T23:59:59Z`;
  const latest = new Date(Date.now() - 5000).toISOString();
  const params = new URLSearchParams({ price: 'M', granularity: 'D', from: `${dateOnly(start)}T00:00:00Z`, to: Date.parse(requestedEnd) > Date.parse(latest) ? latest : requestedEnd, dailyAlignment: '17', alignmentTimezone: 'America/New_York', smooth: 'false' });
  return `https://${host}/v3/instruments/${instrument}/candles?${params}`;
}
export async function fetchOanda(env: Env, instrument: string, start: string, end: string, attempts = 3) {
  return requestJson<OandaResponse>(oandaUrl(env, instrument, start, end), { headers: { Authorization: `Bearer ${required(env, 'OANDA_API_TOKEN')}`, 'Accept-Datetime-Format': 'RFC3339' } }, attempts);
}
export async function fetchFred(env: Env, id: string, start: string, end: string, initial: boolean, attempts = 3) {
  const params = new URLSearchParams({ api_key: required(env, 'FRED_API_KEY'), file_type: 'json', series_id: id, observation_start: dateOnly(start), observation_end: dateOnly(end),
    realtime_start: initial ? start : new Date().toISOString().slice(0, 10), realtime_end: new Date().toISOString().slice(0, 10), output_type: initial ? '4' : '1', sort_order: 'asc', limit: '100000' });
  const result = await requestJson<FredResponse>(`https://api.stlouisfed.org/fred/series/observations?${params}`, {}, attempts);
  if (result.count && result.count > result.observations.length) throw new BackendError('FRED_PAGINATION_REQUIRED');
  return result;
}
export async function fetchTwelve(env: Env, start: string, end: string, reserve: () => Promise<void>, attempts = 3) {
  const params = new URLSearchParams({ apikey: required(env, 'TWELVE_DATA_API_KEY'), symbol: 'XAU/USD', interval: '1day', start_date: dateOnly(start), end_date: dateOnly(end), outputsize: '5000', order: 'ASC', timezone: 'UTC' });
  return requestJson<TwelveResponse>(`https://api.twelvedata.com/time_series?${params}`, {}, attempts, reserve);
}
export async function fetchCftc(start: string, end: string, attempts = 3) {
  const params = new URLSearchParams({ '$where': `cftc_contract_market_code='088691' AND report_date_as_yyyy_mm_dd between '${dateOnly(start)}T00:00:00' and '${dateOnly(end)}T23:59:59'`, '$order': 'report_date_as_yyyy_mm_dd ASC', '$limit': '1000' });
  const rows = await requestJson<CftcRow[]>(`https://publicreporting.cftc.gov/resource/72hh-3qpy.json?${params}`, {}, attempts);
  if (!Array.isArray(rows) || rows.length === 1000) throw new BackendError('CFTC_INVALID_OR_TRUNCATED');
  return rows;
}
export async function fetchReleaseDates(env: Env, release: number, attempts = 3) {
  const params = new URLSearchParams({ api_key: required(env, 'FRED_API_KEY'), file_type: 'json', release_id: String(release), realtime_start: '1776-07-04', realtime_end: '9999-12-31', include_release_dates_with_no_data: 'true', limit: '1000', sort_order: 'desc' });
  return requestJson<{ release_dates: { date: string }[] }>(`https://api.stlouisfed.org/fred/release/dates?${params}`, {}, attempts);
}
