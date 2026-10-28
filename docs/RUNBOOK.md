# Operations

## Local setup and credentials

Use Node 24, `npm ci`. Copy `.env.example` to `.env.local` only when the latter
does not exist. Preserve existing credentials. No `NEXT_PUBLIC_` credentials;
the service role is used only by server routes and ingestion. `.env.local` is
gitignored. Never put keys in issue comments, URLs, screenshots, CLI arguments,
commits or PR bodies. Connection checks print presence/status only.

```
npm run data:check
npm test
npm run build
```

`data:check` verifies real response shapes for Supabase, FRED, OANDA XAU_USD,
Twelve Data XAU/USD and CFTC. It consumes a Twelve Data budget slot. The OANDA
account ID is retained for future account/instrument entitlements; public candle
requests themselves only use the token. Practice/live is selected explicitly
with `OANDA_ENV` (defaults to practice).

## Database

Migrations in `supabase/migrations` are versioned and applied to Goldquant
(`quvadhcskcmnnqtemarh`). All tables have RLS, explicit deny policies and revoked
anon/authenticated grants. Market RPCs and operations RPCs are service-only,
security invoker, with pinned search paths. No direct raw-data browser access.
Generated types are in `src/lib/backend/database.types.ts`.

For a fresh project, inspect `npx supabase --help`, `npx supabase link --help`,
`npx supabase db push --help` before linking/pushing migrations with the CLI.
Use connected Supabase migration/advisor/type-generation tools when available.
Do not blindly reapply SQL to an existing project. The remote migration ledger
records MCP-generated versions; the locally CLI-created files were renamed to
those applied versions so both histories match. Check `migration list` before a
later CLI push, rather than executing already-applied migrations twice.

## Manual collection and backfill

Each invocation logs a run. A job range is at most 32 elapsed days; the CLI
splits longer ranges into 31-calendar-day chunks. Commands are safe to rerun:
unchanged observations and raw bars deduplicate; corrected values append.

```
# Defaults: all jobs, last 14 days, through today
npm run data:ingest

# One job / explicit bounded period
npm run data:ingest -- --job oanda --start 2026-10-01 --end 2026-10-28
npm run data:ingest -- --job fred --start 2026-10-01 --end 2026-10-28
npm run data:ingest -- --job twelve --start 2026-10-01 --end 2026-10-28
npm run data:ingest -- --job cftc --start 2026-10-01 --end 2026-10-28
npm run data:ingest -- --job events --start 2026-10-01 --end 2026-10-28
npm run data:ingest -- --job etf

# Approximately six years (or omit dates for a rolling six years)
npm run data:backfill -- --start 2020-10-28 --end 2026-10-28
# Resume a failed job/chunk with --job and the corresponding --start / --end.
```

`etf` returns `not_configured`. No source is scraped. Backfill is private data
collection, **not certification of historical tradable information**; see DATA.md.
OANDA/Twelve/CFTC downloaded history is first-seen and cannot retrospectively
populate historical bars. The dashboard requires 200 eligible bars and will
therefore still use synthetic data initially even after a six-year backfill.
Historical original-vintage market archives require additional approved evidence.

Twelve Data reservations are serialized in Postgres, count every HTTP attempt,
and enforce at most 8 per rolling minute / 800 per UTC day. Retries reserve anew.
Budget denial stops an Edge job; the local CLI waits once and retries once. If the
daily allowance is exhausted, resume after UTC midnight; do not loop to evade it.
Reservations conservatively count timeouts/failures. Other consumers of the same
vendor key are outside this counter and must share the budget operationally.

Requests have 12-second timeouts, bounded retries and capped backoff. No error
logs include request URLs, tokens or raw vendor bodies. `HTTP_*` codes distinguish
auth, quota, vendor and database failures. A failed run may have persisted valid
earlier batches; rerun the same chunk to finish. Running jobs older than 15 minutes
are reported stuck; inspect before retrying. Empty feeds and unavailable ETF are
not claimed as valid data. Stop/resume backfills by chunk if vendor limits apply.

## Access gate and deployment

The synthetic dashboard is public. Protected APIs never release raw market data
without an access token verified against Supabase Auth **and** a server-side UUID
allow-list. Authenticated but unapproved users and anonymous Auth users are denied.
Neither JWT decoding nor user-editable metadata is trusted. Deployment protection
is not assumed. Leave these defaults until the operator approves access/licensing:

```
REAL_DATA_ENABLED=false
DATA_LICENSE_APPROVED=false
ALLOWED_USER_IDS=
CRON_SECRET=
```

To enable private real-data use later:

1. Confirm each vendor's permitted use, storage and redistribution scope; record
   approval externally. Select an approved ETF provider separately.
2. Create the permitted Supabase Auth user(s) under Goldquant → Authentication →
   Users → Add user → Create user, set their password directly in the dashboard,
   and confirm their email through the appropriate operator/verification process.
   A Supabase dashboard account does not create an app Auth user. Configure their auth method,
   and set `ALLOWED_USER_IDS` to their UUIDs on the server. Keep sign-up restricted
   operationally. Tokens are verified against Auth on every protected API request.
3. Set both `REAL_DATA_ENABLED=true` and `DATA_LICENSE_APPROVED=true` only after
   approval; deploy using Vercel's Next.js/Node 24 preset and server env variables.
   Never expose the service-role key to browser code.
4. Open the dashboard and sign in using the app user's email/password. The server
   exchanges those credentials with Supabase Auth, verifies the UUID allow-list,
   and sets an HttpOnly, SameSite=Strict cookie. Passwords are never stored by the
   application or returned in responses. Supabase rate limits apply; the password
   grant is never automatically retried. An authenticated API client can also use
   `Authorization: Bearer <user access token>`. Advanced clients may still POST
   `{ "accessToken": "<user access token>" }`
   as JSON to `/api/session` from the same origin using a trusted client (e.g.
   browser developer tools after the chosen Supabase sign-in flow). It verifies
   the token/allow-list and sets an HttpOnly, SameSite=Strict cookie, Secure in
   production, with a one-hour maximum lifetime. Reload the dashboard. Tokens
   expire at their own JWT expiry even if the cookie remains. Repeat after token
   refresh; no custom refresh-token store is implemented. The sign-in form appears
   again after session expiry. DELETE `/api/session` logs this browser out.
5. Check `/api/health`, `/api/series`, and `/api/trials` as an authorized user.
   Unauthenticated enabled series requests return 401, unapproved users 403.
   Authorized empty/stale/unavailable research requests return an explicit 503
   error. The browser does not replace failures with a seed-7 mock sample. It may
   show `/api/quote`'s latest stored completed OANDA daily close independently,
   clearly labeled with its candle timestamp. Charts/signals/backtests stay absent
   until eligible history exists. Missing/stale quotes remain unavailable.
   `?as_of=` requires an ISO timestamp with timezone and may not be in the future.
   With both enabling switches off, the server still provides a labeled demo.
   Adding environment variables requires a new Vercel deployment to take effect.

Protected responses use private caches, vary on Authorization/Cookie, and use
ETags only after authorization. Default `asOf` is floored to a minute to bound
ETag churn. No CDN/public caching of real market data or experiments.
GET `/api/trials` includes recent history and the all-history candidate counter;
POST validates JSON, limits payload size, sets user ownership on the server and
deduplicates config+data fingerprint. Counts remain per user across reloads.
Without a session, UI explicitly identifies the candidate counter as session-only.
`/api/health` includes last success per job, latest failure, stuck runs, and actual
observation staleness; a recently completed old backfill does not imply fresh data.

## Scheduling remains OFF

No cron jobs, database scheduling extensions or Edge deployment are activated by
the migrations. Keep `CRON_SECRET` empty. The prepared Edge handler returns 503
when it is absent. It requires both the Supabase gateway JWT and a matching
`x-cron-secret`, processes one job/chunk, and uses the same tested ingestion code.

```
npm run edge:bundle
# After an explicit future scheduling decision, inspect CLI help before deployment:
npx supabase functions deploy --help
npx supabase secrets set --help
```

`supabase/functions/_shared/ingest.js` is generated from the TypeScript source;
regenerate after ingestion changes. Do not edit it manually. Set vendor keys in
Edge secrets through the secure dashboard or an ignored env file, never command
arguments. Supabase supplies its database URL/service role in the Edge runtime.
When ready later, set a strong CRON_SECRET securely, deploy `ingest` with JWT
verification enabled, enable pg_cron/pg_net and store the gateway JWT, Edge URL and
cron secret in Vault. Then deliberately opt in to `supabase/scheduling.sql`.
Its guard refuses execution without a session opt-in and all Vault entries.
Nothing in this repository automatically executes it. Read the
[official scheduling guide](https://supabase.com/docs/guides/functions/schedule-functions).

## Verification and incident handling

Tests use fixed vendor-shaped fixtures plus an embedded PostgreSQL runtime. The
property test invokes the **actual migration SQL** with random observations,
release times and request cutoffs, compares an independent oracle, and checks
both timestamp bounds. Tests cover DST, observed holidays, immutable vintages,
A-B-A correction history, retry deduplication, budgets, quality, user isolation,
sanitized failures, auth and private ETags. They do not prove vendor SLA/licensing.

On failure: inspect `ingestion_runs`, `data_quality_flags`, `alert_events` using
service-only tools; resolve credentials/entitlements, then rerun the failed chunk.
Never remove availability restrictions to make a dashboard look live. Run
security/performance advisors after migrations. Unused-index INFO findings on a
new database are expected; retain FK/as-of indexes until workload evidence says
otherwise. The pre-existing auto-RLS helper's public execute grants are revoked.

Live acceptance and remaining limitations are recorded in `docs/VERIFICATION.md`.
