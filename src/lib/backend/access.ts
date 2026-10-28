import type { Env } from './types';
import { BackendError, requestJson } from './http';

/** Verify with Supabase Auth on every request, THEN check a server allow-list.
 * Never authorize from unverified JWT decoding or user-editable metadata. */
export async function authorize(request: Request, env: Env = process.env): Promise<string> {
  const header = request.headers.get('authorization');
  const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('gq_access='))?.slice('gq_access='.length);
  const token = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1] ?? cookie;
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new BackendError('UNAUTHORIZED', 401);
  let user: { id: string; is_anonymous?: boolean };
  try {
    user = await requestJson(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }, 1);
  } catch { throw new BackendError('UNAUTHORIZED', 401); }
  const allowed = (env.ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!user.id || user.is_anonymous || !allowed.includes(user.id)) throw new BackendError('FORBIDDEN', 403);
  return user.id;
}
export function dataEnabled(env: Env = process.env) {
  return env.REAL_DATA_ENABLED === 'true' && env.DATA_LICENSE_APPROVED === 'true';
}
