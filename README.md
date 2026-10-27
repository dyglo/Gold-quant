# Gold Quant

Next.js (App Router, TypeScript) port of the Gold Quant prototype: gold vs DXY, oil and real yields, with regime attribution, correlation significance, a bias score, a walk-forward backtest (trial counter, Deflated Sharpe, cost and delay stress) and alerts.

## Run
```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build check
```
Runtime: Node.js 24.x (`.nvmrc`: 24.22.1), Next.js 16.4.3, React/React DOM 19.2.9, TypeScript 5.6.3. Development and production builds use default Turbopack. Use `npm ci` for reproducible installs.

The official `npx @next/codemod@canary upgrade latest` completed and the v16 upgrade guide was reviewed. No application-source changes were needed. `/api/series` remains dynamic and serves synthetic data. The legacy engine, components, and styles are preserved.

Validation: `npm run build` passes; the dev page and `/api/series` return HTTP 200. In restricted sandboxes, use `npm run dev -- --hostname 127.0.0.1` to avoid network-interface enumeration restrictions.

## Wire real data
1. Edit `src/app/api/series/route.ts` (server side, put keys in `.env.local`, see `.env.example`).
2. Return `{ data: { dates, gold, dxy, oil, ry, etf, cot, vix }, label: "Live · <vendor>" }`: daily, equal length, oldest first, `ry` in percent, `etf` in tonnes, `cot` in contracts (`etf`, `cot`, `vix` may be `null`).
3. A label starting with `Live` or `Imported` removes the "synthetic" warnings.
4. In the page, set each series' lag (days) in **Data wiring** to your vendor's real release lag (CFTC is weekly: forward-fill it to daily first).
5. Replace `evs()` (CPI/NFP/FOMC dates are guessed from the calendar) with a real calendar.

Data checklist before trusting results: point-in-time data, futures roll handling (ratio-adjust, use returns, check signals around roll dates), spot vs COMEX choice, close-time alignment across series.

## Layout
```
src/app/            layout, page, /api/series (data seam), globals.css
src/components/     Dashboard (client), Markup (static markup, generated)
src/lib/data/       synthetic.ts, provider.ts
src/lib/legacy/     app.ts: the prototype engine + DOM code, lifted as-is
```

## Roadmap (phase 2)
- Split `legacy/app.ts` into typed modules (stats, factor model, bias, backtest, events, alerts) with unit tests, then turn each panel into a React component.
- Persist the trial log to disk or a DB (it resets on reload today), and add an experiment history.
- Auth, scheduled refresh, notification delivery for alerts.

## Deploy
Import the GitHub repository in Vercel with the Next.js preset and Node.js 24.x. The synthetic-data deployment needs no environment variables. `MARKET_DATA_API_KEY` is only a placeholder for the future real-data integration.

Bias weights, thresholds and the regime heuristic are placeholders, not validated. Results on synthetic data are not market results.
