import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { errorResponse, privateJson } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await authorize(request);
    const db = new Database(process.env);
    const jobs = await db.call<{ job: string; last_success: string | null; latest: { status: string; started_at: string } | null }[]>('rpc/job_health', 'POST', {});
    const data = await db.call<{ series: string; stale: boolean }[]>('rpc/data_health', 'POST', {});
    const thresholds: Record<string, number> = { fred: 4, oanda: 4, twelve: 4, cftc: 14, events: 14 };
    const states = jobs.map(j => ({ ...j, stale: j.job === 'etf' ? null : !j.last_success || Date.now() - Date.parse(j.last_success) > thresholds[j.job] * 86400000,
      stuck: j.latest?.status === 'running' && Date.now() - Date.parse(j.latest.started_at) > 15 * 60000 }));
    return privateJson(request, { status: states.some(s => s.stale || s.stuck || s.latest?.status === 'failed') || data.some(s => s.series !== 'etf' && s.stale) ? 'degraded' : 'healthy', jobs: states, data, scheduling: 'disabled', etf: 'not_configured' });
  } catch (error) { return errorResponse(error); }
}
