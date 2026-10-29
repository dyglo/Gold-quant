import { addDays, dateOnly } from '../src/lib/backend/clock';
import { Database } from '../src/lib/backend/db';
import { BackendError, pause } from '../src/lib/backend/http';
import { chunks, ingest, JOBS } from '../src/lib/backend/ingest';
import { normalizeCftc, normalizeFred, normalizeOanda, normalizeTwelve } from '../src/lib/backend/normalizers';
import { fetchCftc, fetchFred, fetchOanda, fetchTwelve } from '../src/lib/backend/vendors';

try { process.loadEnvFile('.env.local'); } catch { /* CI may supply environment directly */ }
const args = process.argv.slice(2), command = args[0];
const option = (key: string, fallback: string) => { const i = args.indexOf(`--${key}`); return i < 0 ? fallback : args[i + 1] ?? ''; };
const today = new Date().toISOString().slice(0, 10);

async function check() {
  for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FRED_API_KEY', 'TWELVE_DATA_API_KEY', 'OANDA_API_TOKEN', 'OANDA_ACCOUNT_ID']) console.log(`${key}: ${process.env[key] ? 'populated' : 'missing'}`);
  console.log(`Scheduling: ${process.env.CRON_SECRET ? 'secret present (activation still requires separate setup)' : 'disabled'}`);
  const start = addDays(today, -14), seen = new Date().toISOString();
  const checks = {
    supabase: async () => { const rows = await new Database(process.env).call<unknown[]>('series?select=id&limit=1'); if (!rows.length) throw new BackendError('SCHEMA_EMPTY'); },
    fred: async () => { if (!normalizeFred(await fetchFred(process.env, 'DFII10', start, today, true), 'ry', seen, true).length) throw new BackendError('EMPTY_FRED'); },
    oanda: async () => { if (!normalizeOanda(await fetchOanda(process.env, 'XAU_USD', start, today), 'XAU_USD', seen).length) throw new BackendError('EMPTY_OANDA'); },
    twelve: async () => { const db = new Database(process.env); if (!normalizeTwelve(await fetchTwelve(process.env, start, today, async () => { if (!await db.call<boolean>('rpc/reserve_twelve_request', 'POST', {})) throw new BackendError('TWELVE_BUDGET_EXHAUSTED'); }), seen).length) throw new BackendError('EMPTY_TWELVE'); },
    cftc: async () => { if (!normalizeCftc(await fetchCftc(addDays(today, -60), today), seen).length) throw new BackendError('EMPTY_CFTC'); },
  };
  for (const [vendor, fn] of Object.entries(checks)) {
    try { await fn(); console.log(`${vendor}: verified response and normalization`); }
    catch (error) { process.exitCode = 1; console.log(`${vendor}: ${error instanceof BackendError ? error.code : 'NORMALIZATION_FAILED'}`); }
  }
}
async function main() {
  if (command === 'check') return check();
  if (command !== 'ingest' && command !== 'backfill') throw new BackendError('Use check, ingest, or backfill', 400);
  const sixYears = new Date(today); sixYears.setUTCFullYear(sixYears.getUTCFullYear() - 6);
  const start = dateOnly(option('start', command === 'backfill' ? sixYears.toISOString().slice(0,10) : addDays(today, -14)));
  const end = dateOnly(option('end', today));
  if (Date.parse(end) - Date.parse(start) > 2192 * 86400000) throw new BackendError('RANGE_EXCEEDS_SIX_YEARS', 400);
  const selected = option('job', 'all');
  const jobs = selected === 'all' ? [...JOBS] : JOBS.filter(j => j === selected);
  if (!jobs.length) throw new BackendError('INVALID_JOB', 400);
  for (const range of chunks(start, end, command === 'backfill' ? 365 : 31)) for (const job of jobs) {
    const db = new Database(process.env);
    const prior = await db.call<unknown[]>(`ingestion_runs?select=id&job=eq.${job}&status=eq.success&parameters->>start=eq.${range.start}&parameters->>end=eq.${range.end}&parameters->>policy=eq.grades-v1&parameters->>historical=eq.${command === 'backfill'}&limit=1`);
    if (command === 'backfill' && prior.length) { console.log(JSON.stringify({ job, ...range, status: 'already_complete' })); continue; }
    try { console.log(JSON.stringify({ job, ...range, ...await ingest(process.env, job, range.start, range.end, command === 'backfill') })); }
    catch (error) {
      if (error instanceof BackendError && error.code === 'TWELVE_BUDGET_EXHAUSTED') {
        console.error('Quota reached: resume after the vendor budget resets. Completed chunks are skipped.');
        process.exitCode = 1; return;
      } else throw error;
    }
  }
}
main().catch(error => { console.error(error instanceof BackendError ? error.code : 'DATA_COMMAND_FAILED'); process.exitCode = 1; });
