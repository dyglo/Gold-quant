import { addDays, nyDate, nyTime } from './clock';
import { Database } from './db';
import { BackendError, digest } from './http';
import { dxyObservations, normalizeCftc, normalizeFedCalendar, normalizeFred, normalizeOanda, normalizeReleaseDates, normalizeTwelve } from './normalizers';
import { FX, type Env, type Observation, type FxBar, type EventRow } from './types';
import { fetchCftc, fetchFred, fetchOanda, fetchReleaseDates, fetchTwelve } from './vendors';
import type { Series } from '../data/synthetic';

/** Ordinary price history, NOT a reconstructed original-vintage archive.
 * Macro values are initial releases and become eligible after vintage NY day end. */
export function alignHistory(bars: FxBar[], factors: Record<string, Observation[]>, now: string) {
  const gold = bars.filter(b => b.instrument === 'XAU_USD').sort((a, b) => a.close_at.localeCompare(b.close_at));
  if (!gold.length) throw new BackendError('HISTORY_UNAVAILABLE');
  const data: Series = { dates: gold.map(b => nyDate(b.close_at)), gold: gold.map(b => b.close), dxy: null, oil: null, ry: null, vix: null, etf: null, cot: null };
  const lastBar: Record<string, Observation | null> = { gold: { series_id: 'gold', value: gold.at(-1)!.close, obs_date: data.dates.at(-1)!, available_at: now, vendor: 'OANDA', availability_basis: 'first_seen' } };
  const flags: { series: string; code: string }[] = [];
  const aligned: Record<string, (number | null)[]> = {};
  const derived = dxyObservations(bars);
  const indexed = new Map(derived.map(p => [p.obs_date, p.value]));
  if (data.dates.every(d => indexed.has(d))) data.dxy = data.dates.map(d => indexed.get(d)!);
  else flags.push({ series: 'dxy', code: 'INCOMPLETE_FX_BASKET' });
  lastBar.dxy = derived.at(-1) ?? null;
  aligned.dxy = data.dates.map(d => indexed.get(d) ?? null);
  for (const k of ['oil', 'ry', 'vix'] as const) {
    const points = (factors[k] ?? []).filter(p => p.availability_basis === 'vintage_day_end')
      .sort((a, b) => a.obs_date.localeCompare(b.obs_date) || a.available_at.localeCompare(b.available_at));
    const values = gold.map(b => {
      const point = points.findLast(p => p.obs_date <= nyDate(b.close_at) && p.available_at <= b.close_at);
      return point && Date.parse(b.close_at) - Date.parse(point.obs_date) <= 10 * 86400000 ? point.value : null;
    });
    aligned[k] = values;
    // Missing factors remain null; never insert zero or revised current values.
    if (values.every((v): v is number => v !== null && Number.isFinite(v)) && (k !== 'oil' || values.every(v => v > 0))) data[k] = values;
    else flags.push({ series: k, code: 'HISTORICAL_AVAILABILITY_INCOMPLETE' });
    lastBar[k] = points.findLast(p => p.available_at <= now) ?? null;
  }
  lastBar.cot = factors.cot?.at(-1) ?? null;
  flags.push({ series: 'cot', code: 'CURRENT_DOWNLOAD_NO_HISTORICAL_RELEASE_EVIDENCE' }, { series: 'etf', code: 'SOURCE_UNAVAILABLE' });
  if (Date.parse(now) - Date.parse(gold.at(-1)!.close_at) > 5 * 86400000) flags.push({ series: 'gold', code: 'STALE_HISTORY' });
  // A hole in an older macro release must not disable current descriptive models.
  // Use a contiguous suffix, keeping the entire gold history for the main chart.
  let start = gold.length;
  while (start > 0 && ['dxy', 'oil', 'ry'].every(k => Number.isFinite(aligned[k]?.[start - 1]) && (k === 'ry' || aligned[k][start - 1]! > 0))) start--;
  const analysisData: Series | null = gold.length - start >= 91 ? {
    dates: data.dates.slice(start), gold: data.gold.slice(start),
    dxy: aligned.dxy.slice(start) as number[], oil: aligned.oil.slice(start) as number[], ry: aligned.ry.slice(start) as number[],
    vix: aligned.vix.slice(start).every(Number.isFinite) ? aligned.vix.slice(start) as number[] : null, etf: null, cot: null,
  } : null;
  return { data, chartFactors: aligned, analysisData, lastBar, flags };
}

export async function historicalSeries(env: Env) {
  const now = new Date().toISOString(), end = nyDate(now), start = addDays(end, -550);
  const flags: { series: string; code: string }[] = [];
  async function optional<T>(series: string, load: () => Promise<T>, fallback: T): Promise<T> {
    try { return await load(); }
    catch { flags.push({ series, code: 'PROVIDER_UNAVAILABLE' }); return fallback; }
  }
  // Fetch all six legs at the same NY session clock. No unrelated dollar index substitution.
  const seen = () => new Date().toISOString();
  const goldPromise = fetchOanda(env, 'XAU_USD', start, end, 2).then(p => normalizeOanda(p, 'XAU_USD', seen()));
  const fxPromise = Promise.all(FX.map(pair => optional('dxy', async () => normalizeOanda(await fetchOanda(env, pair, start, end, 2), pair, seen()), [])));
  const macroPromise = Promise.all(([['DCOILWTICO', 'oil'], ['DFII10', 'ry'], ['VIXCLS', 'vix']] as const).map(async ([id, key]) =>
    [key, await optional(key, async () => normalizeFred(await fetchFred(env, id, addDays(start, -30), end, true, 2), key, seen(), true), [])] as const));
  const cotPromise = optional('cot', async () => normalizeCftc(await fetchCftc(start, end, 2), seen()), []);
  const eventsPromise = Promise.all(([[10, 'CPI'], [50, 'NFP']] as const).map(([release, kind]) => optional<EventRow[]>('events', async () =>
    normalizeReleaseDates(await fetchReleaseDates(env, release, 2), kind, seen(), `https://fred.stlouisfed.org/release?rid=${release}`), [])));
  // Reservation is mandatory even when storage is otherwise empty/unavailable.
  const crossPromise = optional('gold_check', async () => {
    const db = new Database(env, 1);
    const result = await fetchTwelve(env, addDays(end, -10), end, async () => {
      if (!await db.call<boolean>('rpc/reserve_twelve_request', 'POST', {})) throw new BackendError('TWELVE_BUDGET_EXHAUSTED');
    }, 1);
    const points = normalizeTwelve(result, seen());
    const grouped = new Map<string, Set<number>>();
    for (const p of points) { if (!grouped.has(p.obs_date)) grouped.set(p.obs_date, new Set()); grouped.get(p.obs_date)!.add(p.value); }
    if ([...grouped.values()].some(v => v.size > 1)) flags.push({ series: 'gold_check', code: 'CONFLICTING_DUPLICATES_QUARANTINED' });
    return points.filter(p => grouped.get(p.obs_date)!.size === 1);
  }, []);
  const fedPromise = optional<EventRow[]>('events', () => new Database(env, 1).call(`events?select=kind,event_date,source_url,available_at&kind=eq.FOMC&event_date=gte.${start}&event_date=lte.${end}&available_at=lte.${encodeURIComponent(now)}&limit=1000`), []);
  const fedCalendarPromise = optional<EventRow[]>('events', async () => {
    const r = await fetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new BackendError('FED_CALENDAR_UNAVAILABLE');
    return normalizeFedCalendar(await r.text(), seen()).filter(e => e.event_date >= start && e.event_date <= end);
  }, []);
  const [gold, fx, macro, cot, events, cross, fed, fedCalendar] = await Promise.all([goldPromise, fxPromise, macroPromise, cotPromise, eventsPromise, crossPromise, fedPromise, fedCalendarPromise]);
  const fetchedAt = seen();
  const assembled = alignHistory([...gold, ...fx.flat()], { ...Object.fromEntries(macro), cot }, fetchedAt);
  // These clocks differ: this is a qualified price cross-check, never an exact daily-close equality test.
  const check = cross.at(-1), last = gold.at(-1);
  if (check && last && Math.abs(check.value / last.close - 1) > .02) flags.push({ series: 'gold_check', code: 'CROSS_CLOCK_DISAGREEMENT' });
  const sourcedEvents = events.flat().filter(e => e.event_date >= start && e.event_date <= end);
  // Read stored Fed evidence if present, but storage must never gate provider charts.
  return { data: assembled.data, label: 'Provider history · daily', meta: {
    asOf: fetchedAt, fetchedAt, lastBar: assembled.lastBar, qualityFlags: [...assembled.flags, ...flags], analysisData: assembled.analysisData, chartFactors: assembled.chartFactors,
    sources: ['OANDA daily midpoint', 'ICE formula / OANDA FX', 'FRED initial releases', 'CFTC current download', 'Twelve Data cross-check'],
    fingerprint: await digest(assembled.data), events: [...new Map([...sourcedEvents, ...fed, ...fedCalendar].map(e => [`${e.kind}:${e.event_date}`, e])).values()],
    researchEligible: false, availability: 'Conventional downloaded price history; macro initial releases aligned after vintage NY day end. Not certified original-vintage research.',
    crossCheck: check ? { date: check.obs_date, value: check.value, qualification: 'Different daily clocks; not an equivalent close' } : null,
    lagDefaults: { gold: 0, dxy: 0, oil: 0, ry: 0, etf: 0, cot: 0, vix: 0 }, cacheSeconds: 300,
  } };
}
