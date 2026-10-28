export class BackendError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function readJson(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new BackendError('INVALID_JSON', 400);
  const decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new BackendError('PAYLOAD_TOO_LARGE', 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { throw new BackendError('INVALID_JSON', 400); }
}
export async function requestJson<T>(url: string, init: RequestInit = {}, attempts = 3, beforeAttempt?: () => Promise<void>): Promise<T> {
  for (let n = 0; n < attempts; n++) {
    await beforeAttempt?.();
    try {
      const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && n + 1 < attempts) {
          const retry = Number(response.headers.get('retry-after'));
          // A long provider cooldown exceeds an interactive request's budget.
          // Fail honestly instead of holding the function or retrying too soon.
          if (retry > 2) throw new BackendError('VENDOR_COOLDOWN');
          await pause(Math.min(2000, Math.max(500 * 2 ** n, Number.isFinite(retry) ? retry * 1000 : 0)));
          continue;
        }
        // Never include the URL, headers, or vendor response (may contain keys).
        const error = await response.json().catch(() => null);
        const code = typeof error?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code) ? `_${error.code}` : '';
        throw new BackendError(`HTTP_${response.status}${code}`);
      }
      if (response.status === 204) return undefined as T;
      const result = await response.json();
      if (result?.status === 'error' || result?.error_code) throw new BackendError('VENDOR_REJECTED');
      return result as T;
    } catch (error) {
      if (error instanceof BackendError) throw error;
      if (n + 1 === attempts) throw new BackendError('CONNECTION_FAILED');
      await pause(500 * 2 ** n);
    }
  }
  throw new BackendError('CONNECTION_FAILED');
}
