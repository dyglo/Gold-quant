import { BackendError, requestJson } from './http';
import type { Env } from './types';

/** Internal REST client, imported only by server routes / ingestion scripts.
 * Explicit service credentials; no session is attached to this client. */
export class Database {
  readonly url: string;
  private readonly key: string;
  constructor(env: Env, private readonly attempts = 3) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new BackendError('DATABASE_NOT_CONFIGURED');
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new BackendError('DATABASE_NOT_CONFIGURED');
    this.url = url.origin;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  async call<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
    return requestJson<T>(`${this.url}/rest/v1/${path}`, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', Prefer: prefer ?? 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, this.attempts);
  }
  async insert<T>(table: string, rows: unknown): Promise<T> { return this.call(table, 'POST', rows); }
  async now(): Promise<string> { return this.call('rpc/ingestion_clock', 'POST', {}); }
  async append(table: string, rows: unknown[]) {
    // DO NOTHING against unique constraints. Never UPDATE an existing vintage.
    // PostgREST requires identical object keys in bulk inserts. Optional flag
    // fields are NULL, not missing from selected rows in a mixed batch.
    const objects = rows as Record<string, unknown>[];
    const keys = [...new Set(objects.flatMap(row => Object.keys(row)))];
    const uniform = objects.map(row => Object.fromEntries(keys.map(key => [key, row[key] ?? null])));
    const conflicts: Record<string, string> = { daily_snapshots:'snapshot_date,series_id',ledger_inputs:'snapshot_hash',ledger_gaps:'bar_date',ledger_outcomes:'ledger_id,horizon',research_results:'model_version,horizon,data_snapshot_hash', fx_bars: 'instrument,vendor,start_at,content_hash', events: 'kind,event_date,available_at', trials: 'user_id,request_key' };
    const target = conflicts[table] ? `${table}?on_conflict=${conflicts[table]}` : table;
    let written = 0;
    for (let i = 0; i < uniform.length; i += 250) written += (await this.call<unknown[]>(target, 'POST', uniform.slice(i, i + 250), 'resolution=ignore-duplicates,return=representation')).length;
    return written;
  }
  async patch(table: string, id: string, values: unknown) { return this.call(`${table}?id=eq.${encodeURIComponent(id)}`, 'PATCH', values); }
}
