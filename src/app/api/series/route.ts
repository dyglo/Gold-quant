import { authorize, dataEnabled } from '@/lib/backend/access';
import { parseAsOf } from '@/lib/backend/clock';
import { cached } from '@/lib/backend/cache';
import { BackendError } from '@/lib/backend/http';
import { historicalSeries } from '@/lib/backend/history';
import { liveSeries } from '@/lib/backend/series';
import { errorResponse, privateJson } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const history = cached(300000, () => historicalSeries(process.env));
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    let asOf: string;
    try { asOf = parseAsOf(params.get('as_of')); }
    catch { throw new BackendError('INVALID_AS_OF', 400); }
    await authorize(request);
    if (!dataEnabled()) throw new BackendError('REAL_DATA_ACCESS_DISABLED', 503);
    // Explicit as_of retains the strict RPC and its evidence requirements.
    return privateJson(request, params.has('as_of') || params.get('mode') === 'research'
      ? await liveSeries(process.env, asOf) : await history());
  } catch (error) { return errorResponse(error); }
}
