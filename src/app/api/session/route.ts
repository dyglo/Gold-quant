import { authorize } from '@/lib/backend/access';
import { BackendError, readJson } from '@/lib/backend/http';
import { errorResponse } from '@/lib/backend/responses';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new BackendError('INVALID_ORIGIN', 403);
    const body = await readJson(request, 12000);
    const token = body?.accessToken;
    if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{20,10000}$/.test(token)) throw new BackendError('INVALID_TOKEN', 400);
    await authorize(new Request(request.url, { headers: { Authorization: `Bearer ${token}` } }));
    return Response.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `gq_access=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` } });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE() {
  return Response.json({ authenticated: false }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': 'gq_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' } });
}
