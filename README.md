# Gold Quant

Next.js (App Router, TypeScript) port of the Gold Quant prototype: gold vs DXY, oil and real yields, with regime attribution, correlation significance, a bias score, a walk-forward backtest (trial counter, Deflated Sharpe, cost and delay stress) and alerts.

## Run
```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build check
```
Runtime: Node.js 24.x (`.nvmrc`: 24.22.1), Next.js 16.4.3, React/React DOM 19.2.9, TypeScript 5.6.3. Development and production builds use default Turbopack. Use `npm ci` for reproducible installs.

The dashboard preserves the legacy engine and design system. A Supabase backend now provides append-only observations, point-in-time queries, vendor ingestion, sourced events, quality diagnostics and persistent experiments. Public/default operation remains explicitly synthetic until access, licensing and data eligibility pass.

Validation: `npm run build` passes; the dev page and `/api/series` return HTTP 200. In restricted sandboxes, use `npm run dev -- --hostname 127.0.0.1` to avoid network-interface enumeration restrictions.

## Backend

Keep credentials in gitignored `.env.local`; use `.env.example` for variable names. Never overwrite an existing credential file. `CRON_SECRET` intentionally stays empty: scheduling is disabled.

```bash
npm run data:check
npm run data:ingest
npm run data:backfill -- --start 2020-10-28 --end 2026-10-28
npm test
npm run build
```

See [data conventions and limitations](docs/DATA.md), [setup/access/backfill/scheduling runbook](docs/RUNBOOK.md), and [verification evidence](docs/VERIFICATION.md). A historical price download does not prove its historical availability; first-seen feeds cannot populate bars before collection. Live serving requires at least 200 eligible bars and fresh required series. ETF remains not configured.

`GET /api/series?as_of=<ISO timestamp>` preserves `{ data: {dates,gold,dxy,oil,ry,etf,cot,vix}, label, meta }` for eligible history. The service-only SQL function checks both the requested cutoff and every historical NY 17:00 close. Live UI lags default to zero. Metadata carries per-series last values/availability, sources, flags, calendar and a data fingerprint. With real-data mode enabled, empty/stale/unavailable history returns an explicit error, never synthetic prices. The protected `/api/quote` can independently return the latest stored completed OANDA daily close while research history accumulates; it is not a streaming quote.

Real data requires **both** enabling/licensing switches plus verified Supabase Auth and a server UUID allow-list. `/api/trials` (GET/POST) and `/api/health` are protected independently. The dashboard displays an email/password sign-in form when required; `/api/session` verifies credentials with Supabase and provides an HttpOnly cookie. App Auth users are separate from Supabase dashboard accounts. No Vercel protection is assumed; do not enable data until licensed use and users are approved. The browser never synthesizes prices after an API failure. Explicitly disabled data mode remains a labeled demo.

Data checklist before trusting results: point-in-time data, futures roll handling (ratio-adjust, use returns, check signals around roll dates), spot vs COMEX choice, close-time alignment across series.

## Layout
```
src/app/            layout, page, protected APIs, globals.css
src/components/     Dashboard (client), Markup (static markup, generated)
src/lib/data/       synthetic.ts, provider.ts, trials.ts
src/lib/backend/    vendors, normalization, ingestion, quality, clock, DB/security
supabase/           migrations, disabled Edge/scheduling preparation
tests/              vendor fixtures, PostgreSQL properties, API/access integration
src/lib/legacy/     app.ts: the prototype engine + DOM code, lifted as-is
```

## Roadmap (phase 2)
- Split `legacy/app.ts` into typed modules (stats, factor model, bias, backtest, events, alerts) with unit tests, then turn each panel into a React component.
- Approve archival availability evidence and vendor licensing; select an ETF provider.
- Add a sign-in interface if needed; activate scheduling only after an explicit decision.
- Calibrate quality thresholds and implement notification delivery for persistent alerts.

## Deploy
Import the GitHub repository in Vercel with the Next.js preset and Node.js 24.x. The synthetic-data deployment needs no environment variables. Follow the runbook for private data deployment; no schedules are activated by builds or migrations.

Bias weights, thresholds and the regime heuristic are placeholders, not validated. Results on synthetic data are not market results.
