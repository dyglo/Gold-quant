import { authorize } from '@/lib/backend/access';
import { Database } from '@/lib/backend/db';
import { BackendError, digest, readJson } from '@/lib/backend/http';
import { errorResponse, privateJson } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await authorize(request), db = new Database(process.env);
    const trials = await db.call(`trials?select=id,config,data_fingerprint,results,deflated_sharpe_inputs,candidate_count,created_at&user_id=eq.${encodeURIComponent(user)}&order=created_at.desc&limit=100`);
    const summary = await db.call('rpc/trial_summary', 'POST', { owner_id: user });
    return privateJson(request, { trials, summary });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await authorize(request);
    if (!request.headers.has('authorization') && request.headers.get('origin') !== new URL(request.url).origin) throw new BackendError('INVALID_ORIGIN', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BackendError('JSON_REQUIRED', 415);
    const body = await readJson(request, 64000);
    const object = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x);
    if (!object(body) || !object(body.config) || !object(body.results) || !object(body.deflatedSharpeInputs)
      || typeof body.dataFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.dataFingerprint)
      || !Number.isInteger(body.candidateCount) || body.candidateCount < 1 || body.candidateCount > 100) throw new BackendError('INVALID_TRIAL', 400);
    const request_key = await digest({ user, config: body.config, fingerprint: body.dataFingerprint });
    const db = new Database(process.env);
    await db.append('trials', [{ user_id: user, config: body.config, data_fingerprint: body.dataFingerprint, results: body.results, deflated_sharpe_inputs: body.deflatedSharpeInputs, candidate_count: body.candidateCount, request_key }]);
    return privateJson(request, { summary: await db.call('rpc/trial_summary', 'POST', { owner_id: user }) }, 201);
  } catch (error) { return errorResponse(error); }
}
