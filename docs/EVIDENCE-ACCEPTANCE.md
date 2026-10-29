# Evidence collection acceptance — 2026-10-29

Branch: codex/trustworthy-bias-evidence. PR: https://github.com/dyglo/Gold-quant/pull/7 (draft).

Archive requested 2020-10-28 through 2026-10-28. Distinct observation dates, not vintage row counts:

| Series | Dates | Historical grade |
| --- | ---: | --- |
| gold | 1549 | B (A first-seen also retained) |
| dxy | 1557 | B (A first-seen also retained) |
| gold_check | 1726 | B (different vendor clock) |
| ry | 1499 | A |
| breakeven | 1500 | A |
| nominal_yield | 1499 | A |
| oil | 1502 | A |
| vix | 1540 | A |
| broad_dollar | 1495 | A |
| cot | 312 | A only from actual retrieval |
| etf | 0 | C / source unavailable |

Events: CPI 75, NFP 73, FOMC 50. These are event histories, not daily series. COT is weekly, not daily; missing daily observations are not fabricated.

Largest consecutive calendar-date gaps: gold/DXY/Twelve/rates/VIX 4 days, oil/broad dollar 5 days; no gaps longer than a week in daily feeds. COT maximum 8 days, three intervals longer than seven days. These diagnostics include weekends and holidays and do not certify complete exchange-session coverage. Twelve flagged conflicting duplicates in its final annual range; they were quarantined. Different session clocks preclude an exact-price agreement claim. ETF remains an explicit complete gap.

Own snapshots: one date, eight series. Ledger: valid empty chain, firstBreak=null, checked=0; no live rows backfilled. Registered model: 8c104b446645e50bff345ff86f29bb5f6affc4f22f4f7f011db1ee23f0b585e6.

Live database smoke: horizon-1 grade B research IC 0.01089; 95% paired block interval [-0.04342, 0.06364]; 980 labels, 98 conservative independent blocks, seeded block-permutation p=0.695. Buckets are not monotone. No reliable positive association. 451 potential dates lacked sufficient contiguous warmup. This is an interim research run, not prospective performance or executable PnL.

54 tests pass; npm run build passes. Supabase migrations applied, RLS and mutation protection checked. Scheduling workflow is committed but only activates after default-branch merge and repository-secret provisioning. Open requirements are explicitly listed in DATA.md and RUNBOOK.md: real spread-cost PnL, full walk-forward evaluation, applicable DSR/PBO candidate matrices, all-horizon UI and panel-specific grade badges. Do not mark this PR ready until those are completed.
