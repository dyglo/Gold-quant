import { BackendError, digest } from './http';
export async function privateJson(request: Request, body: unknown, status = 200): Promise<Response> {
  const etag = `"${await digest(body)}"`;
  const headers = { 'Cache-Control': 'private, no-cache, max-age=0, must-revalidate', Vary: 'Authorization, Cookie', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (status === 200 && request.method === 'GET' && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return Response.json(body, { status, headers });
}
export function errorResponse(error: unknown): Response {
  const known = error instanceof BackendError;
  return Response.json({ error: known ? error.code : 'BACKEND_UNAVAILABLE' }, { status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' } });
}
