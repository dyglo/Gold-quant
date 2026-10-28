# Verification — dashboard/live-data repair (2026-10-28, Africa/Nairobi)

## Completed checks

- Fetched `origin/main` after merged PRs #1/#2 and created `codex/restore-dashboard-live-data` from `db39949`.
- Inspected all four specified files at reference commit `e9e27a5d740a1aeb62305357ae0a4d670713cc6a`. Kept the complete original panel/section/canvas/control hierarchy and design. Changes to markup are limited to accurate data wording and Refresh; added 1W/1D chart range controls at the user's request. CSS additions contain sidebar overflow and narrow-screen tables.
- Local credentials were checked for presence without disclosure. At the user's request, set only local REAL_DATA_ENABLED/DATA_LICENSE_APPROVED to true. Confirmed both existing Vercel flags are true for production/preview; allow-list exists in both targets. CRON_SECRET remains empty locally and scheduling remains disabled.
- Real OANDA practice account pricing returned HTTP 200 for XAU_USD, including top bid/ask, tradeable status, and price timestamp. Independently checked daily candle response semantics: timestamps are starts; complete/incomplete flags distinguish prior closes from current-session candles.
- Bounded live history retrieval completed in 3.5 seconds after reusing timezone formatters: 389 completed gold/FX bars from 2025-04-28 through 2026-10-27. FRED initial releases support 108 contiguous eligible model bars from 2026-05-29. Earlier oil availability gaps remain explicit, not imputed. Real yields, VIX, CFTC current context, FRED event dates and a qualified Twelve Data cross-check returned successfully. The latest oil observation was 2026-10-20 with vintage-day-end availability 2026-10-22; it is not a live oil quote.
- 49 tests passed, covering immutable SQL/as-of properties, auth/allow-list/session, real quote semantics, provider retrieval without usable storage, missing factors, publication timing, model suffixes, bounded caches/deduplication, original DOM engine rendering, refresh/poll disposal and real M15 intraday parsing. Synthetic values are used only as labeled test fixtures, not runtime fallbacks.
- TypeScript and production build passed before the final added intraday route; final build result is recorded below when available. Regenerated the prepared Edge bundle because shared ingestion helpers changed; no Edge deployment or scheduling activation occurred.
- In-app browser: unauthenticated local navigation redirected to `/login?next=%2F`. After the user signed in, the full dashboard rendered with current midpoint/timestamp, oil overlay, populated factor/correlation/bias/context panels, and panel-local research limitation.
- Browser DOM geometry after the overflow fix: document scrollWidth=974, viewport clientWidth=974, sidebar=380px, Data wiring table=338px. No page-level horizontal overflow at that width. Visual screenshot confirmed the original two-column layout, black/green palette and all overlay colors.

## Remaining acceptance work

- Final Vercel preview browser verification and authenticated preview flow.
- Responsive width checks and visual comparison against an isolated runnable reference snapshot. The newly supplied screenshot documents the overflow regression; the original pre-backend screenshot has not been supplied.
- Final 1D/1W browser interaction and refresh checks after the latest implementation.

## Preserved limitations

Downloaded prices are conventional history, not certified original vintages. The strict SQL research path retains its 200 eligible bar requirement. Backtests are withheld for default downloaded history; no verified performance claim or automatic unverified trial is emitted. CFTC historical release evidence remains absent; only current downloaded context is shown. ETF is unavailable. Optional missing sources do not hide the application. No production merge or deployment has been performed.
