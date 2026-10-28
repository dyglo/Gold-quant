import type { Series } from "./synthetic";

export type Loaded = { data: Series; label: string; meta?: {
  lastBar?: Record<string, { obs_date: string; value: number; available_at: string } | null>;
  sources?: unknown[]; qualityFlags?: unknown[]; asOf?: string; fingerprint?: string;
  events?: { kind: string; event_date: string; source_url: string }[];
  lagDefaults?: Record<string, number>;
  researchEligible?: boolean; fetchedAt?: string;
} };

export class SeriesUnavailable extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
/** An API failure is an unavailable state, never permission to fabricate prices. */
export async function loadSeries(): Promise<Loaded> {
  let r: Response;
  try {
    r = await fetch('/api/series', { cache: 'no-store' });
  } catch { throw new SeriesUnavailable('CONNECTION_FAILED', 503); }
  const body = await r.json().catch(() => null);
  if ((r.status === 401 || r.status === 403) && typeof window !== 'undefined') window.location.assign('/login?next=%2F&reason=session');
  if (!r.ok) throw new SeriesUnavailable(typeof body?.error === 'string' ? body.error : 'DATA_UNAVAILABLE', r.status);
  if (!body?.data?.dates?.length || typeof body.label !== 'string') throw new SeriesUnavailable('INVALID_DATA_RESPONSE', 503);
  return { ...body, label: body.label.startsWith('Synthetic') ? 'Demo data · not market prices' : body.label };
}

export async function loadQuote() {
  const r = await fetch('/api/quote', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if ((r.status === 401 || r.status === 403) && typeof window !== 'undefined') window.location.assign('/login?next=%2F&reason=session');
  if (!r.ok) throw new SeriesUnavailable('QUOTE_UNAVAILABLE', r.status);
  return r.json();
}
export async function loadIntraday() {
  const r = await fetch('/api/intraday', { cache: 'no-store', signal: AbortSignal.timeout(45000) });
  if ((r.status === 401 || r.status === 403) && typeof window !== 'undefined') window.location.assign('/login?next=%2F&reason=session');
  if (!r.ok) throw new SeriesUnavailable('INTRADAY_UNAVAILABLE', r.status);
  return r.json();
}
