# Gold Quant

Private gold dashboard built with Next.js 16.4.3, React 19 and Supabase. The original dashboard layout, charts, controls and design are retained from commit `e9e27a5d740a1aeb62305357ae0a4d670713cc6a`.

## Run

Use Node 24.x and `npm ci`, then `npm run dev`. Preserve the existing gitignored `.env.local`; `.env.example` lists the required names. Both `REAL_DATA_ENABLED=true` and `DATA_LICENSE_APPROVED=true` are required for approved private use. Keep `ALLOWED_USER_IDS` configured and `CRON_SECRET` empty.

Open `/`: unauthenticated visitors are directed to `/login`. Sign in with the approved app Auth account. Vendor and service-role credentials stay on the server. No synthetic prices are served after an error or when data access is disabled.

## Data flow

Dashboard → verified, allow-listed server route → provider API → quote/history/analysis.

- `/api/quote`: OANDA account pricing for XAU_USD. Displayed price is the top bid/ask midpoint, with the vendor timestamp. Current, stale, market-closed and last-cached values are labeled separately. The visible tab polls every 15 seconds; Refresh also requests a quote. The server coalesces concurrent calls and caches successful responses for at most 10 seconds per instance. Old quote timestamps remain old when fetched again.
- `/api/series`: downloads 550 calendar days of completed OANDA gold and all six FX legs; no stored-history prerequisite. DXY uses the ICE basket at identical 17:00 New York session closes. FRED initial-release oil, real yields and VIX obey conservative vintage-day-end availability. CFTC current positioning is qualified; ETF is unavailable. Events are sourced from FRED/Fed calendars and existing stored evidence.
- History uses a five-minute per-instance success cache. Cold instances retrieve independently. Every Twelve Data attempt first reserves the shared database budget (8/minute, 800/UTC day); reservation failure omits that optional cross-check. There is no shared/public HTTP cache. Refresh requests the server again, subject to these explicit TTLs.
- Gold chart coverage is independent of macro gaps. Nullable chart overlays leave visible gaps. Factor calculations use only the latest contiguous eligible sample (at least 91 daily bars), label its size, and shorten the baseline label honestly if fewer than 250 bars are available. Missing factors/context do not hide the dashboard.
- `/api/series?mode=research` or `?as_of=<ISO timestamp>` retains the strict SQL as-of path, append-only availability evidence and 200-bar research requirement. Downloaded prices are not certified original vintages. The backtest panel explains this limitation; ordinary historical charts and descriptive analysis remain usable. No unverified trial is automatically recorded.

The dashboard reads providers without rewriting stored observations. Existing ingestion, immutable bars/vintages, logs, quality alerts, trial persistence and migrations remain available for research. No migrations or schedules are applied by this change.

## Verify and operate

```
npm test
npm run build
npm run data:check
npm run data:ingest
npm run data:backfill -- --start 2020-10-28 --end 2026-10-28
```

Manual collection is optional for viewing the dashboard. It does not manufacture historical publication evidence. `data:check` consumes provider requests, including one reserved Twelve Data slot.

See [DATA.md](docs/DATA.md), [RUNBOOK.md](docs/RUNBOOK.md), and [verification evidence and pending checks](docs/VERIFICATION.md).

Bias weights, residual fade rules and regime labels remain descriptive, unvalidated heuristics. No strategy-validation claim follows from a price download.

Deploy previews through the existing Vercel Git integration. Production deployment and merging require explicit authorization. Scheduling remains disabled.

Chart ranges include 1W (five daily return intervals) and 1D (last 24 hours of completed M15 OANDA midpoint candles). Intraday data is private, uses a 60-second server cache, and is refreshed while selected; daily factor overlays remain unavailable in that view.
