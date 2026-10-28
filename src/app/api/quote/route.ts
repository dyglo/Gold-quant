import { authorize, dataEnabled } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { BackendError } from '@/lib/backend/http';
import { errorResponse, privateJson } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';

/** A stored completed daily close is independent of the 200-bar research gate.
 * It is never labeled as a streaming/current-tick quote. */
export async function GET(request: Request) {
  try {
    if (!dataEnabled()) throw new BackendError('REAL_DATA_ACCESS_DISABLED', 503);
    await authorize(request);
    const now = new Date().toISOString();
    const db = new Database(process.env);
    const rows = await db.call<{ close: number; close_at: string; available_at: string }[]>(
      `fx_bars?select=close,close_at,available_at&instrument=eq.XAU_USD&vendor=eq.OANDA&complete=eq.true&available_at=lte.${encodeURIComponent(now)}&close_at=lte.${encodeURIComponent(now)}&order=close_at.desc,available_at.desc&limit=1`);
    const row = rows[0];
    if (!row || !Number.isFinite(row.close) || row.close <= 0) throw new BackendError('QUOTE_UNAVAILABLE');
    if (Date.parse(now) - Date.parse(row.close_at) > 5 * 86400000) throw new BackendError('QUOTE_STALE');
    return privateJson(request, { price: row.close, closeAt: row.close_at, availableAt: row.available_at, source: 'OANDA', label: 'Latest completed daily close', instrument: 'XAU_USD' });
  } catch (error) { return errorResponse(error); }
}
