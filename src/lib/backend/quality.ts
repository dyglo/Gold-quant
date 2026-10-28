import type { Flag, Observation } from './types';
export function quality(rows: Observation[], now: string): Flag[] {
  const flags: Flag[] = [];
  const groups = new Map<string, Observation[]>();
  for (const row of rows) groups.set(row.series_id, [...(groups.get(row.series_id) ?? []), row]);
  for (const [series_id, input] of groups) {
    const flag = (code: string, obs_date?: string, details?: Record<string, unknown>) => flags.push({ series_id, code, severity: 'warning', obs_date, details });
    const seen = new Set<string>();
    for (let i = 0; i < input.length; i++) {
      const r = input[i];
      const key = `${r.obs_date}|${r.available_at}`;
      if (seen.has(key)) flag('DUPLICATE_DATE_VINTAGE', r.obs_date);
      seen.add(key);
      if (i && r.availability_basis === input[i - 1].availability_basis && r.vendor === input[i - 1].vendor && r.obs_date < input[i - 1].obs_date) flag('NON_MONOTONIC_DATES', r.obs_date);
    }
    const sorted = [...new Map(input.map(r => [r.obs_date, r])).values()].sort((a, b) => a.obs_date.localeCompare(b.obs_date));
    const weekly = series_id === 'cot';
    const newest = sorted.at(-1)!;
    if (Date.parse(now) - Date.parse(newest.obs_date) > (weekly ? 21 : 7) * 86400000) flag('STALE', newest.obs_date);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (Date.parse(b.obs_date) - Date.parse(a.obs_date) > (weekly ? 14 : 5) * 86400000) flag('GAP', b.obs_date, { previous: a.obs_date });
      if (series_id === 'ry' ? Math.abs(b.value - a.value) > 0.5 : a.value > 0 && Math.abs(b.value / a.value - 1) > (series_id === 'vix' ? 0.6 : 0.15)) flag('OUTLIER_CHANGE', b.obs_date);
    }
    if (input.some(r => r.availability_basis === 'first_seen')) flags.push({ series_id, code: 'HISTORICAL_AVAILABILITY_NOT_VERIFIED', severity: 'info', details: { policy: 'First retrieved value is unavailable before retrieval; no historical release time assumed.' } });
  }
  const check = new Map(rows.filter(r => r.series_id === 'gold_check').map(r => [r.obs_date, r.value]));
  for (const gold of rows.filter(r => r.series_id === 'gold')) {
    const other = check.get(gold.obs_date);
    if (other && Math.abs(gold.value / other - 1) > 0.02) flags.push({ series_id: 'gold', code: 'GOLD_CROSS_CLOCK_DISAGREEMENT', severity: 'warning', obs_date: gold.obs_date, details: { relative: gold.value / other - 1, comparable_clocks: false } });
  }
  // Broad dollar and DXY levels are not comparable. Only compare daily changes,
  // and treat disagreement as a warning about different baskets, not an error.
  const broad = rows.filter(r => r.series_id === 'broad_dollar').sort((a, b) => a.obs_date.localeCompare(b.obs_date));
  const dx = new Map(rows.filter(r => r.series_id === 'dxy').map(r => [r.obs_date, r.value]));
  for (let i = 1; i < broad.length; i++) {
    const a = broad[i - 1], b = broad[i], x = dx.get(a.obs_date), y = dx.get(b.obs_date);
    if (x && y && Math.abs(Math.log(y / x) - Math.log(b.value / a.value)) > 0.02) flags.push({ series_id: 'dxy', code: 'DIFFERENT_DOLLAR_BASKETS_DIVERGE', severity: 'info', obs_date: b.obs_date });
  }
  return flags;
}
