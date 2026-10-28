import { authorize, dataEnabled } from '@/lib/backend/access';
import { cached } from '@/lib/backend/cache';
import { BackendError } from '@/lib/backend/http';
import { currentQuote } from '@/lib/backend/quote';
import { errorResponse, privateJson } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const read = cached(10000, () => currentQuote(process.env));
export async function GET(request: Request) {
  try {
    await authorize(request);
    if (!dataEnabled()) throw new BackendError('REAL_DATA_ACCESS_DISABLED', 503);
    const quote = await read();
    const status = quote.status === 'current' && Date.now() - Date.parse(quote.time) > 120000 ? 'stale' : quote.status;
    return privateJson(request, { ...quote, status, cached: Date.now() - Date.parse(quote.fetchedAt) > 1000, cacheSeconds: 10 });
  } catch (error) { return errorResponse(error); }
}
