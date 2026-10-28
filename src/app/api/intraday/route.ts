import { authorize, dataEnabled } from '@/lib/backend/access';
import { cached } from '@/lib/backend/cache';
import { BackendError } from '@/lib/backend/http';
import { intraday } from '@/lib/backend/intraday';
import { privateJson, errorResponse } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const read = cached(60000, () => intraday(process.env));
export async function GET(request: Request) {
  try {
    await authorize(request);
    if (!dataEnabled()) throw new BackendError('REAL_DATA_ACCESS_DISABLED');
    return privateJson(request, await read());
  } catch (error) { return errorResponse(error); }
}
