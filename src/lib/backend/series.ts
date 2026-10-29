import { addDays, nyDate } from './clock';
import { Database } from './db';
import { BackendError, digest } from './http';
import type { BarRow, Env, EventRow, Point } from './types';
import type { Series } from '../data/synthetic';
import { panelGrade } from './evidence';

const CORE = ['gold', 'dxy', 'oil', 'ry'] as const;
const OPTIONAL = ['etf', 'cot', 'vix'] as const;
export async function readSeries(db: Database, asOf: string): Promise<BarRow[]> {
  const result: BarRow[] = [];
  const end = nyDate(asOf);
  // < 1000 rows per RPC response: avoid silently truncated six-year histories.
  for (let start = addDays(end, -2192); start <= end;) {
    const to = [addDays(start, 300), end].sort()[0];
    const rows = await db.call<BarRow[]>('rpc/series_as_of', 'POST', { series_ids: [...CORE, ...OPTIONAL], as_of: asOf, start_date: start, end_date: to });
    result.push(...rows); start = addDays(to, 1);
  }
  return result;
}
export function assemble(rows: BarRow[], asOf: string) {
  // Keep only a contiguous suffix with required factors. Dropping arbitrary
  // interior missing bars would fabricate multi-day "daily" returns.
  let start = rows.length;
  while (start > 0 && CORE.every(k => Number.isFinite(rows[start - 1].points[k]?.value))) start--;
  const usable = rows.slice(start);
  if (usable.length < 200) throw new BackendError('INSUFFICIENT_POINT_IN_TIME_HISTORY');
  if (panelGrade(usable.flatMap(r => CORE.map(k => r.points[k]))) === 'C') throw new BackendError('GRADE_C_BLOCKED_UNVERIFIED_INPUT');
  const last = usable.at(-1)!;
  if (Date.parse(asOf) - Date.parse(last.bar_close) > 5 * 86400000) throw new BackendError('STALE_BAR');
  for (const k of CORE) {
    if (Date.parse(asOf) - Date.parse(last.points[k].obs_date) > (k === 'gold' || k === 'dxy' ? 5 : 10) * 86400000) throw new BackendError('STALE_REQUIRED_SERIES');
  }
  const data = { dates: usable.map(r => r.bar_date) } as Series;
  for (const k of CORE) data[k] = usable.map(r => r.points[k].value);
  // The legacy engine cannot handle partially-null context arrays. A series
  // missing anywhere in the selected history is wholly unavailable, never zero.
  for (const k of OPTIONAL) data[k] = usable.every(r => Number.isFinite(r.points[k]?.value)) ? usable.map(r => r.points[k].value) : null;
  if (data.gold.some(x => x <= 0) || data.dxy!.some(x => x <= 0) || data.oil!.some(x => x <= 0)) throw new BackendError('NONPOSITIVE_LOG_RETURN_INPUT');
  const lastBar: Record<string, Point | null> = Object.fromEntries([...CORE, ...OPTIONAL].map(k => [k, last.points[k] ?? null]));
  const flags: { series: string; code: string; from?: string }[] = [...CORE, ...OPTIONAL].flatMap(k => {
    const p = last.points[k];
    return !p ? [{ series: k, code: 'UNAVAILABLE' }] : p.obs_date < last.bar_date ? [{ series: k, code: 'FORWARD_FILLED', from: p.obs_date }] : [];
  });
  if (OPTIONAL.some(k => !data[k])) flags.push({ series: 'context', code: 'PARTIAL_CONTEXT_DISABLED' });
  return { data, lastBar, flags };
}
export async function liveSeries(env: Env, asOf: string) {
  const db = new Database(env);
  const assembled = assemble(await readSeries(db, asOf), asOf);
  const catalog = await db.call<{ id: string; vendor: string; unit: string; license_note: string }[]>('series?select=id,vendor,unit,license_note&active=eq.true');
  const events = await db.call<EventRow[]>(`events?select=kind,event_date,event_at,available_at,source_url&available_at=lte.${encodeURIComponent(asOf)}&event_date=gte.${assembled.data.dates[0]}&event_date=lte.${assembled.data.dates.at(-1)}&order=event_date.asc&limit=1000`);
  const quality = await db.call<unknown[]>(`data_quality_flags?select=series_id,code,severity,obs_date,details&created_at=lte.${encodeURIComponent(asOf)}&order=created_at.desc&limit=100`);
  return { data: assembled.data, label: 'Live · Supabase (conservative point-in-time alignment)', meta: {
    lastBar: assembled.lastBar, sources: catalog, qualityFlags: [...assembled.flags, ...quality], asOf,
    fingerprint: await digest(assembled.data), events, researchEligible: true, availability: 'Conservative vintage dates / first retrieval; exact historical vendor timestamps are not implied.',
    lagDefaults: { gold: 0, dxy: 0, oil: 0, ry: 0, etf: 0, cot: 0, vix: 0 },
  } };
}
