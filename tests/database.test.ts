import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';
import fc from 'fast-check';
import type { BarRow } from '../src/lib/backend/types';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for (const file of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
});
afterAll(async () => { await db?.close(); });

it('actual SQL function never selects values unavailable at the historical close or requested cutoff', async () => {
  await fc.assert(fc.asyncProperty(fc.array(fc.record({ day: fc.integer({ min: 2, max: 26 }), availableDay: fc.integer({ min: 2, max: 31 }), hour: fc.integer({ min: 0, max: 23 }), value: fc.integer({ min: 1, max: 10000 }) }), { minLength: 1, maxLength: 45 }), fc.integer({ min: 10, max: 31 }), async (generated, cutoffDay) => {
    await db.exec('begin');
    try {
      const { rows: [run] } = await db.query<{ id: string }>("insert into ingestion_runs(job) values('property-test') returning id");
      const observations = generated.map((g, i) => ({ series_id: 'gold', obs_date: `2024-01-${String(g.day).padStart(2, '0')}`, value: g.value,
        available_at: `2024-01-${String(Math.max(g.day, g.availableDay)).padStart(2, '0')}T${String(g.hour).padStart(2, '0')}:00:${String(i).padStart(2, '0')}Z` }));
      for (const o of observations) await db.query("insert into observations(series_id,obs_date,value,available_at,vendor,availability_basis,content_hash,run_id) values($1,$2,$3,$4,'fixture','first_seen',$5,$6)", [o.series_id, o.obs_date, o.value, o.available_at, String(o.value), run.id]);
      const cutoff = `2024-01-${cutoffDay}T20:30:00Z`;
      const { rows } = await db.query<BarRow>("select * from series_as_of(array['gold'],$1,'2024-01-02','2024-01-31')", [cutoff]);
      for (const row of rows) {
        expect(Date.parse(String(row.bar_close))).toBeLessThanOrEqual(Date.parse(cutoff));
        const day = new Date(row.bar_date).toISOString().slice(0, 10);
        const eligible = observations.filter(o => o.obs_date <= day && Date.parse(o.obs_date) >= Date.parse(day) - 5 * 86400000 && Date.parse(o.available_at) <= Math.min(Date.parse(String(row.bar_close)), Date.parse(cutoff)))
          .sort((a, b) => b.obs_date.localeCompare(a.obs_date) || b.available_at.localeCompare(a.available_at));
        if (!eligible.length) expect(row.points.gold).toBeUndefined();
        else {
          expect(row.points.gold.value).toBe(eligible[0].value);
          expect(Date.parse(row.points.gold.available_at)).toBeLessThanOrEqual(Date.parse(String(row.bar_close)));
          expect(Date.parse(row.points.gold.available_at)).toBeLessThanOrEqual(Date.parse(cutoff));
        }
      }
    } finally { await db.exec('rollback'); }
  }), { numRuns: 60 });
});
it('honors US observed holidays, federal conventions, and NY DST closes', async () => {
  const { rows } = await db.query<{ holiday: boolean; friday: boolean; juneteenth: boolean; christmas: boolean }>("select us_business_day('2024-07-04') as holiday,us_business_day('2024-03-29') as friday,us_business_day('2020-06-19') as juneteenth,us_business_day('2022-12-26') as christmas");
  expect(rows[0]).toEqual({ holiday: false, friday: true, juneteenth: true, christmas: false });
  const bars = await db.query<BarRow>("select * from series_as_of(array['gold'],'2024-03-12T00:00:00Z','2024-03-08','2024-03-11')");
  expect(new Date(bars.rows[0].bar_close).toISOString()).toBe('2024-03-08T22:00:00.000Z');
  expect(new Date(bars.rows[1].bar_close).toISOString()).toBe('2024-03-11T21:00:00.000Z');
});
it('enforces deny-by-default tables, functions, and immutable vintages', async () => {
  for (const role of ['anon', 'authenticated']) {
    const table = await db.query<{ allowed: boolean }>("select has_table_privilege($1,'observations','select') as allowed", [role]);
    expect(table.rows[0].allowed).toBe(false);
    const fn = await db.query<{ allowed: boolean }>("select has_function_privilege($1,'public.series_as_of(text[],timestamptz,date,date)','execute') as allowed", [role]);
    expect(fn.rows[0].allowed).toBe(false);
  }
  const rls = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
  expect(rls.rows.every(r => r.relrowsecurity)).toBe(true);
  const truncate = await db.query<{ allowed: boolean }>("select has_table_privilege('service_role','observations','truncate') as allowed");
  expect(truncate.rows[0].allowed).toBe(false);
});
it('reconciles alerts idempotently and resolves absent rules', async () => {
  const flag = { series_id: 'gold', code: 'GAP', severity: 'warning' };
  for (let i = 0; i < 2; i++) await db.query("select reconcile_quality_alerts('oanda',$1)", [JSON.stringify([flag])]);
  const count = await db.query<{ n: number }>("select count(*)::int as n from alert_events where rule='oanda:gold:GAP' and resolved_at is null");
  expect(count.rows[0].n).toBe(1);
  await db.exec("select reconcile_quality_alerts('oanda','[]')");
  const state = await db.query<{ resolved: boolean }>("select resolved_at is not null as resolved from alert_events where rule='oanda:gold:GAP'");
  expect(state.rows[0].resolved).toBe(true);
});
it('atomically deduplicates unchanged snapshots, retains A-B-A vintages, rejects updates', async () => {
  const { rows: [run] } = await db.query<{ id: string }>("insert into ingestion_runs(job) values('idempotency') returning id");
  const row = { series_id: 'cot', obs_date: '2024-01-02', value: 10, available_at: '2024-01-05T21:00:00Z', vendor: 'fixture', availability_basis: 'first_seen', content_hash: 'A', run_id: run.id };
  const append = async (r: typeof row) => (await db.query<{ n: number }>('select append_observations($1::jsonb) as n', [JSON.stringify([r])])).rows[0].n;
  expect(await append(row)).toBe(1); expect(await append({ ...row, available_at: '2024-01-06T21:00:00Z' })).toBe(0);
  expect(await append({ ...row, value: 20, content_hash: 'B', available_at: '2024-01-07T21:00:00Z' })).toBe(1);
  expect(await append({ ...row, available_at: '2024-01-08T21:00:00Z' })).toBe(1);
  await expect(db.exec("update observations set value=0 where series_id='cot'")).rejects.toThrow('Append-only');
});
it('serializes Twelve Data budgets to eight attempts per rolling minute', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => db.query<{ ok: boolean }>('select reserve_twelve_request() as ok')));
  expect(results.filter(r => r.rows[0].ok)).toHaveLength(8);
});
it('counts persisted candidates across history and isolates experiment owners', async () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  await db.query("insert into trials(user_id,config,data_fingerprint,results,deflated_sharpe_inputs,candidate_count,request_key) values($1,'{}','sample','{}','{}',4,'same') on conflict(user_id,request_key) do nothing", [owner]);
  await db.query("insert into trials(user_id,config,data_fingerprint,results,deflated_sharpe_inputs,candidate_count,request_key) values($1,'{}','sample','{}','{}',4,'same') on conflict(user_id,request_key) do nothing", [owner]);
  const summary = await db.query<{ summary: { count: number; candidateCount: number } }>('select trial_summary($1) as summary', [owner]);
  expect(summary.rows[0].summary).toEqual({ count: 1, candidateCount: 4 });
  const other = await db.query<{ summary: { count: number; candidateCount: number } }>("select trial_summary('00000000-0000-4000-8000-000000000002') as summary");
  expect(other.rows[0].summary).toEqual({ count: 0, candidateCount: 0 });
});
