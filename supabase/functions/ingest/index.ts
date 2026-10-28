// Generated shared module: npm run edge:bundle. No schedules are installed.
import { ingest } from '../_shared/ingest.js';
declare const Deno: { env: { toObject(): Record<string, string>; get(key: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return Response.json({ error: 'SCHEDULING_DISABLED' }, { status: 503 });
  const a = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('x-cron-secret') ?? ''));
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  const diff = new Uint8Array(a).reduce((v, byte, i) => v | (byte ^ new Uint8Array(b)[i]), 0);
  if (diff) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const text = await request.text();
    if (text.length > 4096) return new Response(null, { status: 413 });
    const { job, start, end } = JSON.parse(text);
    if (typeof job !== 'string' || typeof start !== 'string' || typeof end !== 'string') return new Response(null, { status: 400 });
    // One job, one <=32-day chunk. Never a six-year backfill in one invocation.
    return Response.json(await ingest(Deno.env.toObject(), job, start, end));
  } catch { return Response.json({ error: 'INGESTION_FAILED' }, { status: 503 }); }
});
