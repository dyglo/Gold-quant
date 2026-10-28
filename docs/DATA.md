# Data contract and availability

The dashboard is private and retrieves current pricing and existing historical bars directly from providers. Empty Supabase price storage never triggers synthetic prices or a collection waiting period. Strict point-in-time research remains a separate evidence-gated path.

## Catalog

| ID | Source | Unit / clock | Access and limitations |
| --- | --- | --- | --- |
| gold | OANDA XAU_USD, midpoint | USD/troy oz; NY 17:00 | Private; redistribution unapproved |
| dxy | Six OANDA FX pairs, ICE-weight basket | Index; same NY clock | Synthetic reconstruction, not the licensed ICE index feed |
| gold_check | Twelve Data XAU/USD | USD/oz; vendor daily session | Different clock; diagnostic only; redistribution unapproved |
| ry | FRED DFII10 | Percent, not fraction | Review upstream rights |
| breakeven | FRED T5YIE | Percent | Review upstream rights |
| nominal_yield | FRED DGS10 | Percent | Review upstream rights |
| oil | FRED DCOILWTICO | USD/barrel | WTI spot, not a continuous futures series; no roll adjustment |
| vix | FRED VIXCLS | Index | Cboe redistribution rights unapproved |
| broad_dollar | FRED DTWEXBGS | Broad trade-weighted index | Different currency universe and weighting from DXY |
| cot | CFTC 72hh-3qpy, contract 088691 | Managed-money net futures-only, contracts | First retrieval until historical release/vintage evidence exists |
| etf | GLD adapter not configured | Tonnes | No approved source; no scraping |

Default `/api/series` returns daily arrays, oldest first. Gold is always required. Other fields are full-length numeric arrays or `null`; missing values are never zero-filled. `meta.chartFactors` carries equal-length arrays with explicit null gaps for chart overlays. `meta.analysisData` is the latest contiguous suffix of valid gold/DXY/oil/real-yield values, only supplied with at least 91 bars. It supplies 60-day models and 90-day correlations while the main gold chart retains full coverage. Baseline length and model sample coverage are labeled. All macro observations must satisfy publication timing and the existing ten-calendar-day freshness bound at each bar; old interior gaps are never compressed into daily returns.

`/api/quote` calls OANDA account pricing, displaying (top bid + top ask)/2 in USD per troy ounce and the price object's timestamp. Tradeable quotes older than two minutes are stale; non-tradeable prices are marked market closed. A failed request can leave a clearly labeled last-cached quote in the browser. Completed daily closes are separately labeled when current pricing is unavailable.

Quote TTL is 10 seconds per server instance; visible-tab polling is 15 seconds. History TTL is five minutes per instance, with concurrent request deduplication. Refresh always makes server requests, which may reuse unexpired successful caches. Failed requests are not cached and expiry never silently extends. All HTTP responses remain private and authorized before cache access. Cold instances can fetch independently; Twelve's shared SQL reservation protects its quota across instances.

## Availability and vintages

Every observation has `obs_date`, `available_at`, `ingested_at`, vendor, run, hash,
and availability basis. First-seen and completion timestamps use the database's
authoritative clock after payload retrieval, avoiding worker clock skew.
Updates/deletes on observations, raw bars and events are
rejected by database triggers. An unchanged first-seen snapshot is skipped under
a per-series transaction lock; a changed value, including A → B → A, appends a
new vintage. Raw bars deduplicate by instrument/vendor/start/content hash.

* **FRED initial releases:** request `output_type=4` over a bounded real-time
  interval. Keep the supplied `realtime_start`; assume availability only after
  that entire New York calendar day ends. If an initial value is actually
  retrieved earlier on that day, first retrieval is direct availability evidence.
  Missing `.` values are skipped. A separate current snapshot is first-seen only.
  This stores initial releases plus snapshots collected by this system; it does
  **not** reconstruct every intervening historical revision. Initial-release
  histories are conservative, incomplete models of the historical information set.
* **OANDA/Twelve Data:** a historical download may contain corrections. No
  certified original-vintage archive has been supplied. `available_at` is the
  retrieval timestamp, never retrospectively the candle close. Consequently,
  backfilled bars cannot appear in historical simulations before retrieval.
  Ongoing collection gradually builds a usable, conservative history.
* **CFTC:** use `m_money_positions_long_all - m_money_positions_short_all`, not
  legacy noncommercial positions, not the combined futures/options report.
  The report date usually describes Tuesday; normal publication is Friday
  15:30 ET, but shutdowns and other delays occur. The dataset response does not
  prove the actual publication time or original historical value. Use first
  retrieval and flag missing historical release evidence. Never add a fixed lag
  or retroactively assign a release schedule date to a current revised value.
* `release_evidence` is reserved for adapters with evidence supporting both the
  specific vintage value and its actual publication timestamp. No current
  adapter asserts that basis.

`series_as_of(series_ids, as_of, start_date, end_date)` is the observation
query used only by explicit strict research requests (`mode=research` or `as_of`). For **each** historical bar it selects the newest
observation date, then newest stored vintage satisfying:

```
obs_date <= bar_date
available_at <= min(requested_as_of, that_bar_close)
bar_close <= requested_as_of
```

Forward filling is bounded in calendar days: gold/DXY/cross-check 5, FRED
rates/oil/VIX 10, broad dollar 14, COT 21. Carrying a known older observation is
explicitly marked in metadata. Live UI release lags are zero because the server
has already aligned availability; these data are not same-day synchronized
closing quotes. Historical requests cannot see observations collected later.
Strict research requires 200 consecutive eligible core bars and fresh required series; unavailable research returns a sanitized error. Default historical downloads never bypass that requirement: they are descriptive and `researchEligible=false`. The backtest panel stays present and explains the evidence limitation; it does not run or record an unverified backtest. The database append-only timestamps and SQL are unchanged. Data-disabled mode returns an error, with no implicit demo.

## Session clock and calendar

OANDA uses `granularity=D`, `price=M`, `dailyAlignment=17`,
`alignmentTimezone=America/New_York`, `smooth=false`; only complete candles enter
storage. Candle timestamps denote **starts**. Derive the close on the next New
York calendar day at 17:00; do not add a fixed 24 hours across DST changes.
All timestamps are stored as timestamptz/UTC. Twelve Data's timezone parameter
does not establish an equivalent 17:00 trading session. Its daily cross-check
excludes the current UTC date and only raises qualified disagreement warnings.

The strict SQL research calendar is US federal business days: weekdays excluding observed
New Year, MLK, Presidents Day, Memorial Day, Juneteenth (2021 onward), Independence
Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas. Saturday
fixed holidays observe Friday; Sunday holidays observe Monday. Full 17:00 closes;
no early closes or ad hoc closure assumptions. Good Friday remains a federal
business day. This deliberately differs from both the OTC FX and NYSE calendars.
It is not a futures/exchange execution calendar. Default chart history instead uses the completed gold sessions actually returned by OANDA. Invalid/missing values follow
the documented bounded forward-fill rules.

## DXY and quality

```
50.14348112 * EURUSD^-0.576 * USDJPY^0.136 * GBPUSD^-0.119
            * USDCAD^0.091 * USDSEK^0.042 * USDCHF^0.036
```

All six components must share the same candle close. Gold disagreement over 2%
is a warning with `comparable_clocks=false`. DXY vs DTWEXBGS compares changes
(2 percentage-point divergence), never levels or an equality claim. Other flags
cover gaps, stale dates, non-monotonic input, duplicate date/vintage, large changes,
incomplete baskets, missing evidence and empty responses. Flags are diagnostics,
not proof of tradability or a validated economic outlier model. Runs retain
sanitized failure codes and alert state records first/last seen and resolution.

## Events and experiments

CPI/NFP dates come from FRED release IDs 10 and 50. FOMC dates come from actual
statement links on the Fed calendar, including unscheduled decisions. No guessed
monthly dates or six-week intervals. Event time is `null` unless sourced; calendar
snapshots become knowable when retrieved. Future FOMC meetings without statements
are not yet imported. Current page covers 2021 onward; older Fed archives need an
explicit historical source adapter. FRED is not guaranteed to publish a value at
the source's calendar release time. These events support descriptive event studies;
they are not historical announcement forecasts.

Trials are scoped to a verified, allow-listed Supabase user. Config + full SHA-256
data fingerprint deduplicate retries; the counter sums all searched candidates
across persistent history, while GET returns the latest 100 records. Results and
Deflated Sharpe inputs include sample size, daily Sharpe, candidate count, skew,
kurtosis and benchmark assumptions. The inherited UI statistic is now explicitly
labeled a **normal/iid approximation**. It does not estimate the variance across
independent strategy trials or correct their dependence; do not treat it as a
research-grade validation of an edge.

## Official references (checked 2026-10-28)

* [OANDA account pricing](https://developer.oanda.com/rest-live-v20/pricing-ep/)
* [OANDA OpenAPI candle parameters](https://github.com/oanda/v20-openapi/blob/master/yaml/separate/v20_instrument.yaml)
* [OANDA candle definitions](https://developer.oanda.com/rest-live-v20/instrument-df/)
* [ICE USDX rulebook and constant](https://www.ice.com/publicdocs/rulebooks/futures_us/15_ICE_USDX_Futures_and_Options.pdf)
* [FRED observations and output types](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)
* [FRED release dates](https://fred.stlouisfed.org/docs/api/fred/release_dates.html)
* [CFTC futures-only dataset and official fields](https://publicreporting.cftc.gov/resource/72hh-3qpy.json)
* [CFTC publication schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm)
* [Twelve Data API](https://twelvedata.com/docs) and [timezones](https://support.twelvedata.com/en/articles/5745849-timezones)
* [Fed calendar](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm)

## Intraday chart range

The private /api/intraday route retrieves only the last 24 hours of OANDA M15 midpoint candles. Incomplete candles are excluded; timestamps identify closes, 15 minutes after vendor starts. It has a 60-second per-instance success cache. The selected 1D view checks for new completed candles during the 15-second visible-tab polling loop. Daily macro overlays are omitted with an explicit message. 1W spans five daily return intervals. Intraday candles do not change the daily analysis or strict research contract.
