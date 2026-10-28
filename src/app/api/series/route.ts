import { synth } from "@/lib/data/synthetic";
import { authorize, dataEnabled } from '@/lib/backend/access';
import { parseAsOf } from '@/lib/backend/clock';
import { BackendError, digest } from '@/lib/backend/http';
import { liveSeries } from '@/lib/backend/series';
import { errorResponse, privateJson } from '@/lib/backend/responses';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let asOf: string;
  try { asOf = parseAsOf(new URL(request.url).searchParams.get('as_of')); }
  catch { return errorResponse(new BackendError('INVALID_AS_OF', 400)); }
  let reason = 'REAL_DATA_ACCESS_DISABLED';
  if (dataEnabled()) {
    try { await authorize(request); }
    catch (error) { return errorResponse(error); }
    try { return await privateJson(request, await liveSeries(process.env, asOf)); }
    catch (error) { return errorResponse(error instanceof BackendError ? error : new BackendError('DATABASE_UNAVAILABLE')); }
  }
  const data = synth(7);
  // A synthetic fallback is never historical evidence, even with as_of set.
  return privateJson(request, { data, label: 'Synthetic sample data (not market data) · seed 7', meta: {
    lastBar: {}, sources: ['synthetic'], qualityFlags: [{ code: reason }], asOf,
    events: [], historicalRequestApplied: false, fingerprint: await digest(data),
  } });
}
