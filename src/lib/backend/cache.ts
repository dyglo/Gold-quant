/** Bounded per-instance cache. Rejected loads are never cached.
 * Cold Vercel instances fetch independently; Twelve's DB reservation is global. */
export function cached<T>(ttlMs: number, load: () => Promise<T>) {
  let entry: { value: T; expires: number } | undefined;
  let pending: Promise<T> | undefined;
  return async () => {
    if (entry && entry.expires > Date.now()) return entry.value;
    if (pending) return pending;
    pending = load().then(value => {
      entry = { value, expires: Date.now() + ttlMs };
      return value;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
