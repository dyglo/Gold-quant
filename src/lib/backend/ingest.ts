import { addDays, dateOnly } from './clock';
import { Database } from './db';
import { BackendError, digest } from './http';
import { dxyObservations, etfAdapter, goldObservations, normalizeCftc, normalizeFedCalendar, normalizeFred, normalizeOanda, normalizeReleaseDates, normalizeTwelve } from './normalizers';
import { quality } from './quality';
import { FRED_SERIES, FX, type Env, type EventRow, type Flag, type FxBar, type Observation } from './types';
import { fetchCftc, fetchFred, fetchOanda, fetchReleaseDates, fetchTwelve } from './vendors';

export const JOBS = ['fred', 'oanda', 'twelve', 'cftc', 'events', 'etf'] as const;
export type Job = typeof JOBS[number];
export function validateJob(job: string, start: string, end: string): asserts job is Job {
  if (!(JOBS as readonly string[]).includes(job) || dateOnly(start) > dateOnly(end) || Date.parse(end) - Date.parse(start) > 32 * 86400000) throw new BackendError('INVALID_JOB_RANGE', 400);
  if (end > new Date().toISOString().slice(0, 10)) throw new BackendError('FUTURE_RANGE', 400);
}
export async function ingest(env: Env, job: string, start: string, end: string) {
  validateJob(job, start, end);
  const db = new Database(env);
  const [run] = await db.insert<{ id: string }[]>('ingestion_runs', { job, parameters: { start, end } });
  let observations: Observation[] = [], bars: FxBar[] = [], events: EventRow[] = [], flags: Flag[] = [];
  try {
    if (job === 'etf') {
      await db.patch('ingestion_runs', run.id, { status: etfAdapter.status === 'not_configured' ? 'not_configured' : 'failed', finished_at: await db.now() });
      return { runId: run.id, status: 'not_configured', rows: 0 };
    }
    if (job === 'fred') {
      for (const [id, series] of Object.entries(FRED_SERIES)) {
        for (const initial of [true, false]) {
          const payload = await fetchFred(env, id, start, end, initial);
          observations.push(...normalizeFred(payload, series, await db.now(), initial));
        }
      }
    }
    if (job === 'oanda') {
      for (const instrument of ['XAU_USD', ...FX]) {
        const payload = await fetchOanda(env, instrument, start, end);
        bars.push(...normalizeOanda(payload, instrument, await db.now()));
      }
      observations = [...goldObservations(bars.filter(b => b.instrument === 'XAU_USD')), ...dxyObservations(bars)];
      if (!observations.some(o => o.series_id === 'dxy')) flags.push({ series_id: 'dxy', code: 'INCOMPLETE_FX_BASKET', severity: 'error' });
    }
    if (job === 'twelve') {
      // Database-backed reservation counts every attempt, including retries and
      // concurrent jobs. Never more than 8 requests/minute or 800/UTC day.
      const payload = await fetchTwelve(env, start, end, async () => {
        const allowed = await db.call<boolean>('rpc/reserve_twelve_request', 'POST', {});
        if (!allowed) throw new BackendError('TWELVE_BUDGET_EXHAUSTED');
      });
      observations = normalizeTwelve(payload, await db.now());
      flags.push({ series_id: 'gold_check', code: 'DAILY_CLOCK_NOT_EQUIVALENT', severity: 'info' });
    }
    if (job === 'cftc') {
      observations = normalizeCftc(await fetchCftc(start, end), await db.now());
      flags.push({ series_id: 'cot', code: 'ACTUAL_HISTORICAL_RELEASE_EVIDENCE_MISSING', severity: 'warning', details: { policy: 'first_seen', contract: '088691', dataset: '72hh-3qpy' } });
    }
    if (job === 'events') {
      for (const [release, kind] of [[10, 'CPI'], [50, 'NFP']] as const) {
        events.push(...normalizeReleaseDates(await fetchReleaseDates(env, release), kind, await db.now(), `https://fred.stlouisfed.org/release?rid=${release}`));
      }
      const response = await fetch('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new BackendError('FED_CALENDAR_UNAVAILABLE');
      events.push(...normalizeFedCalendar(await response.text(), await db.now()));
      events = events.filter(e => e.event_date >= start && e.event_date <= end);
    }
    const now = await db.now();
    flags.push(...quality(observations, now));
    const groups = new Map<string, Observation[]>();
    for (const o of observations) { const k = `${o.series_id}:${o.obs_date}:${o.available_at}`; groups.set(k, [...(groups.get(k) ?? []), o]); }
    observations = [...groups.values()].flatMap(group => {
      if (new Set(group.map(o => o.value)).size > 1) {
        flags.push({ series_id: group[0].series_id, obs_date: group[0].obs_date, code: 'CONFLICTING_DUPLICATES_QUARANTINED', severity: 'error' });
        return [];
      }
      return [group[0]];
    });
    if (!observations.length && !events.length) flags.push({ code: 'EMPTY_RESPONSE', severity: 'warning' });
    // Check vendor gold against saved cross-checks when jobs run separately.
    if (job === 'oanda' || job === 'twelve') {
      const other = job === 'oanda' ? 'gold_check' : 'gold';
      const saved = await db.call<Observation[]>(`observations?select=series_id,obs_date,value,available_at,vendor,availability_basis&series_id=eq.${other}&obs_date=gte.${start}&obs_date=lte.${end}&order=available_at.desc&limit=1000`);
      flags.push(...quality([...saved, ...observations], now).filter(f => f.code === 'GOLD_CROSS_CLOCK_DISAGREEMENT'));
    }
    if (job === 'fred' || job === 'oanda') {
      const saved = await db.call<Observation[]>(`observations?select=series_id,obs_date,value,available_at,vendor,availability_basis&series_id=in.(dxy,broad_dollar)&obs_date=gte.${start}&obs_date=lte.${end}&order=available_at.asc&limit=1000`);
      const latest = [...new Map([...saved, ...observations].filter(o => o.series_id === 'dxy' || o.series_id === 'broad_dollar').map(o => [`${o.series_id}:${o.obs_date}`, o])).values()];
      flags.push(...quality(latest, now).filter(f => f.code === 'DIFFERENT_DOLLAR_BASKETS_DIVERGE'));
    }
    const observationRows = await Promise.all(observations.map(async o => ({ ...o, run_id: run.id, content_hash: await digest({ series: o.series_id, date: o.obs_date, value: o.value, basis: o.availability_basis }) })));
    const barRows = await Promise.all(bars.map(async b => ({ ...b, run_id: run.id, content_hash: await digest({ ...b, available_at: undefined }) })));
    // Atomic RPC handles observation idempotency and reverted values under a
    // per-series lock; raw bars/events are immutable deduplicated evidence.
    const written = observationRows.length ? await db.call<number>('rpc/append_observations', 'POST', { batch: observationRows }) : 0;
    const rawWritten = await db.append('fx_bars', barRows);
    let eventWritten = 0;
    // Events are first-seen evidence; avoid claiming a newly fetched calendar
    // was known in prior historical simulations.
    for (const event of events) {
      const old = await db.call<EventRow[]>(`events?select=event_date&kind=eq.${event.kind}&event_date=eq.${event.event_date}&limit=1`);
      if (!old.length) eventWritten += await db.append('events', [{ ...event, run_id: run.id }]);
    }
    if (flags.length) await db.append('data_quality_flags', flags.map(f => ({ ...f, details: f.details ?? {}, run_id: run.id })));
    // One serialized transaction prevents concurrent jobs duplicating open
    // alerts, and preserves first_seen while updating last_seen/resolution.
    await db.call('rpc/reconcile_quality_alerts', 'POST', { job_name: job, flags });
    const totalWritten = written + rawWritten + eventWritten;
    await db.patch('ingestion_runs', run.id, { status: 'success', rows_written: totalWritten, finished_at: await db.now() });
    return { runId: run.id, status: 'success', rows: totalWritten, observationRows: written, rawRows: rawWritten, eventRows: eventWritten, flags: flags.map(f => f.code) };
  } catch (error) {
    const code = error instanceof BackendError ? error.code : 'NORMALIZATION_OR_PERSISTENCE_FAILED';
    await db.append('data_quality_flags', [{ run_id: run.id, code, severity: 'error' }]);
    await db.patch('ingestion_runs', run.id, { status: 'failed', error_code: code, finished_at: await db.now() });
    throw new BackendError(code);
  }
}
export function chunks(start: string, end: string): { start: string; end: string }[] {
  dateOnly(start); dateOnly(end);
  if (start > end) throw new BackendError('INVALID_JOB_RANGE', 400);
  const ranges = [];
  for (let day = start; day <= end;) { const to = [addDays(day, 30), end].sort()[0]; ranges.push({ start: day, end: to }); day = addDays(to, 1); }
  return ranges;
}
