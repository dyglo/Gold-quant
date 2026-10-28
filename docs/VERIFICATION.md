# Acceptance record — 2026-10-28 (Africa/Nairobi)

## Verified

* All required credentials are present in local, gitignored `.env.local`; checks
  report presence only. FRED's supplied key successfully returned normalized
  observations, including initial releases. The earlier handover's 28-character
  concern does not apply to the currently saved, successfully checked key.
* Real responses and normalization passed for Supabase, FRED DFII10, OANDA
  practice XAU_USD, Twelve Data XAU/USD, CFTC dataset 72hh-3qpy / gold 088691.
* All six FRED series and all seven OANDA instruments ingested successfully for
  October 2026. 133 immutable OANDA bars were stored in the acceptance window.
  Re-running that OANDA chunk inserted zero observations and zero raw bars.
  FRED and CFTC unchanged snapshots also inserted zero observations on rerun.
* Twelve Data ingestion is operational, but its returned sample included a
  conflicting duplicate daily date. Conflicting duplicate observations are now
  quarantined and flagged, rather than arbitrarily selecting a value. It remains
  a qualified cross-check with a different daily session, never the primary feed.
* CPI/NFP October dates and CPI/NFP/FOMC March 2024 dates were ingested from
  official source responses/calendar links. The March check inserted three
  sourced events. No guessed dates are used by the engine.
* Six migrations are applied in Goldquant. Local filenames match the remote
  ledger; generated TypeScript types reflect the applied schema.
* Security advisor: no findings after revoking public execution of the existing
  auto-RLS helper and restricting every new RPC/table. Performance advisor:
  informational unused indexes only on the new workload; retained FK/lookup
  indexes are intentional. No performance warning/error was reported.
* All 31 tests pass. PostgreSQL property tests execute the actual migrations and as-of RPC over
  randomized observations/cutoffs and compare an independent selection oracle.
  Additional tests cover DST/calendar, A-B-A vintages, immutability and grants,
  rate reservations, alert reconciliation, trial idempotency/ownership, vendor
  fixtures, sanitization, private ETags and API access controls.
* Production build and TypeScript checks passed. Production HTTP checks passed
  for the page, synthetic contract, ETag/304, invalid as-of, protected health and
  trials, rejected cross-origin session creation, and 404 for `.env.local`.
* Production dependency audit: no known vulnerabilities. Vitest was advanced
  from the handover version to a patched exact version after npm audit found
  advisories. The tools are used through batch tests, not a public test UI server.

## Deliberately pending / not claimed

* At initial acceptance, real-data serving remained disabled: vendor licensing approval and approved
  Supabase Auth user UUIDs have not been supplied. The gate is implemented and
  tested, but no operator/end-user account or production sign-in has been
  provisioned during the initial backend work. The follow-up data-state fix adds
  an email/password sign-in interface, never silently falls back to mock data in
  real mode, and separates the latest real daily close from research history.
* No six-year verified market-price archive exists in this implementation.
  Approximately six-year chunked collection commands are supplied; only bounded
  live acceptance windows were run. First-seen OANDA/Twelve/CFTC downloads cannot
  populate earlier historical bars. Initial FRED releases are conservative, not
  a reconstruction of every historical revision.
* The database does not yet have 200 eligible core bars. The API therefore must
  remain synthetic until eligibility is established, even if access is enabled.
* ETF is explicitly `not_configured`; no approved source/terms or scraper.
* Exact historical CFTC publication evidence is missing. Friday 15:30 ET is not
  retrospectively assigned to downloaded historical values.
* No scheduled jobs or database scheduling extensions have been activated, and
  the Edge Function has not been deployed. The prepared generated function and
  guarded SQL are provided for later opt-in; `CRON_SECRET` stays empty.
* No production deployment was requested or performed. The PR is the reviewable
  delivery. The legacy strategy and its normal/iid Deflated Sharpe approximation
  remain unvalidated as a trading edge.
