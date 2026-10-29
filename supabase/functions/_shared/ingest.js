// src/lib/backend/clock.ts
function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("INVALID_DATE");
  return value;
}
var addDays = (day, n) => new Date(Date.parse(dateOnly(day)) + n * 864e5).toISOString().slice(0, 10);
var nyDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
var nyOffsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" });
function nyDate(time) {
  return nyDayFormatter.format(new Date(time));
}
function nyTime(day, hour = 17) {
  const target = Date.parse(`${dateOnly(day)}T${String(hour).padStart(2, "0")}:00:00Z`);
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const parts = nyOffsetFormatter.formatToParts(utc);
    const offset = parts.find((p) => p.type === "timeZoneName").value.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
    utc = target - minutes * 6e4;
  }
  return new Date(utc).toISOString();
}

// src/lib/backend/http.ts
var BackendError = class extends Error {
  constructor(code, status = 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
};
async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function requestJson(url, init = {}, attempts = 3, beforeAttempt) {
  for (let n = 0; n < attempts; n++) {
    await beforeAttempt?.();
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12e3) });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && n + 1 < attempts) {
          const retry = Number(response.headers.get("retry-after"));
          if (retry > 2) throw new BackendError("VENDOR_COOLDOWN");
          await pause(Math.min(2e3, Math.max(500 * 2 ** n, Number.isFinite(retry) ? retry * 1e3 : 0)));
          continue;
        }
        const error = await response.json().catch(() => null);
        const code = typeof error?.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error.code) ? `_${error.code}` : "";
        throw new BackendError(`HTTP_${response.status}${code}`);
      }
      if (response.status === 204) return void 0;
      const result = await response.json();
      if (result?.status === "error" || result?.error_code) throw new BackendError("VENDOR_REJECTED");
      return result;
    } catch (error) {
      if (error instanceof BackendError) throw error;
      if (n + 1 === attempts) throw new BackendError("CONNECTION_FAILED");
      await pause(500 * 2 ** n);
    }
  }
  throw new BackendError("CONNECTION_FAILED");
}

// src/lib/backend/db.ts
var Database = class {
  constructor(env, attempts = 3) {
    this.attempts = attempts;
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new BackendError("DATABASE_NOT_CONFIGURED");
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new BackendError("DATABASE_NOT_CONFIGURED");
    this.url = url.origin;
    this.key = env.SUPABASE_SERVICE_ROLE_KEY;
  }
  async call(path, method = "GET", body, prefer) {
    return requestJson(`${this.url}/rest/v1/${path}`, {
      method,
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", Prefer: prefer ?? "return=representation" },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    }, this.attempts);
  }
  async insert(table, rows) {
    return this.call(table, "POST", rows);
  }
  async now() {
    return this.call("rpc/ingestion_clock", "POST", {});
  }
  async append(table, rows) {
    const objects = rows;
    const keys = [...new Set(objects.flatMap((row) => Object.keys(row)))];
    const uniform = objects.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
    const conflicts = { daily_snapshots: "snapshot_date,series_id", ledger_inputs: "snapshot_hash", ledger_gaps: "bar_date", ledger_outcomes: "ledger_id,horizon", research_results: "model_version,horizon,data_snapshot_hash", fx_bars: "instrument,vendor,start_at,content_hash", events: "kind,event_date,available_at", trials: "user_id,request_key" };
    const target = conflicts[table] ? `${table}?on_conflict=${conflicts[table]}` : table;
    let written = 0;
    for (let i = 0; i < uniform.length; i += 250) written += (await this.call(target, "POST", uniform.slice(i, i + 250), "resolution=ignore-duplicates,return=representation")).length;
    return written;
  }
  async patch(table, id, values) {
    return this.call(`${table}?id=eq.${encodeURIComponent(id)}`, "PATCH", values);
  }
};

// src/lib/backend/types.ts
var FRED_SERIES = { DFII10: "ry", T5YIE: "breakeven", DGS10: "nominal_yield", VIXCLS: "vix", DCOILWTICO: "oil", DTWEXBGS: "broad_dollar" };
var FX = ["EUR_USD", "USD_JPY", "GBP_USD", "USD_CAD", "USD_SEK", "USD_CHF"];

// src/lib/backend/normalizers.ts
function number(value) {
  if (value === null || value === void 0 || String(value).trim() === "") throw new Error("INVALID_NUMBER");
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("INVALID_NUMBER");
  return result;
}
function dxy(rates) {
  const exponents = [-0.576, 0.136, -0.119, 0.091, 0.042, 0.036];
  return FX.reduce((v, key, i) => {
    if (!Number.isFinite(rates[key]) || rates[key] <= 0) throw new Error("INVALID_FX");
    return v * rates[key] ** exponents[i];
  }, 50.14348112);
}
function normalizeFred(payload, series, seen, initialRelease) {
  if (!Array.isArray(payload.observations)) throw new Error("INVALID_FRED");
  return payload.observations.filter((o) => o.value !== ".").map((o) => {
    const obs_date = dateOnly(o.date);
    const available = initialRelease ? nyTime(addDays([dateOnly(o.realtime_start), obs_date].sort().at(-1), 1), 0) : seen;
    return {
      series_id: series,
      obs_date,
      value: number(o.value),
      available_at: Date.parse(available) > Date.parse(seen) ? seen : available,
      vendor: "FRED",
      availability_basis: initialRelease && Date.parse(available) <= Date.parse(seen) ? "vintage_day_end" : "first_seen"
    };
  });
}
function normalizeOanda(payload, instrument, seen) {
  if (payload.instrument !== instrument || payload.granularity !== "D" || !Array.isArray(payload.candles)) throw new Error("INVALID_OANDA");
  return payload.candles.filter((c) => c.complete).map((c) => {
    const start_at = new Date(c.time).toISOString();
    const startDay = nyDate(start_at);
    if (Math.abs(Date.parse(start_at) - Date.parse(nyTime(startDay))) > 1e3) throw new Error("UNEXPECTED_CANDLE_CLOCK");
    const close_at = nyTime(addDays(startDay, 1));
    if (Date.parse(close_at) > Date.parse(seen)) throw new Error("FUTURE_COMPLETE_CANDLE");
    const open = number(c.mid.o), high = number(c.mid.h), low = number(c.mid.l), close = number(c.mid.c);
    if (Math.min(open, high, low, close) <= 0 || high < Math.max(open, low, close) || low > Math.min(open, high, close) || !Number.isInteger(c.volume) || c.volume < 0) throw new Error("INVALID_OHLC");
    return { instrument, vendor: "OANDA", start_at, close_at, open, high, low, close, volume: c.volume, complete: true, available_at: seen };
  });
}
function goldObservations(bars) {
  return bars.map((b) => ({ series_id: "gold", obs_date: nyDate(b.close_at), value: b.close, available_at: b.available_at, vendor: "OANDA", availability_basis: "first_seen" }));
}
function dxyObservations(bars) {
  const groups = /* @__PURE__ */ new Map();
  for (const b of bars.filter((b2) => FX.includes(b2.instrument))) groups.set(b.close_at, [...groups.get(b.close_at) ?? [], b]);
  return [...groups.entries()].sort().flatMap(([close, group]) => {
    if (FX.some((pair) => group.filter((b) => b.instrument === pair).length !== 1)) return [];
    return [{
      series_id: "dxy",
      obs_date: nyDate(close),
      value: dxy(Object.fromEntries(group.map((b) => [b.instrument, b.close]))),
      available_at: group.map((b) => b.available_at).sort().at(-1),
      vendor: "OANDA-derived",
      availability_basis: "first_seen"
    }];
  });
}
function normalizeTwelve(payload, seen) {
  if (payload.meta?.symbol !== "XAU/USD" || payload.meta?.interval !== "1day" || !Array.isArray(payload.values)) throw new Error("INVALID_TWELVE_DATA");
  return payload.values.filter((v) => dateOnly(v.datetime) < seen.slice(0, 10)).map((v) => ({
    series_id: "gold_check",
    obs_date: dateOnly(v.datetime),
    value: number(v.close),
    available_at: seen,
    vendor: "Twelve Data",
    availability_basis: "first_seen"
  })).sort((a, b) => a.obs_date.localeCompare(b.obs_date));
}
function normalizeCftc(rows, seen) {
  return rows.filter((r) => r.cftc_contract_market_code === "088691").map((r) => ({
    series_id: "cot",
    obs_date: dateOnly(r.report_date_as_yyyy_mm_dd.slice(0, 10)),
    value: number(r.m_money_positions_long_all) - number(r.m_money_positions_short_all),
    available_at: seen,
    vendor: "CFTC",
    availability_basis: "first_seen"
  }));
}
function normalizeReleaseDates(payload, kind, seen, source) {
  if (!Array.isArray(payload.release_dates)) throw new Error("INVALID_RELEASE_DATES");
  return payload.release_dates.map((r) => ({ kind, event_date: dateOnly(r.date), event_at: null, available_at: seen, source_url: source }));
}
function normalizeFedCalendar(html, seen) {
  const dates = [...html.matchAll(/href=["']([^"']*\/newsevents\/pressreleases\/monetary(\d{8})[a-z]\.htm)["']/g)];
  if (!dates.length) throw new Error("FED_CALENDAR_FORMAT_CHANGED");
  return [...new Map(dates.map((m) => {
    const d = dateOnly(`${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`);
    return [d, { kind: "FOMC", event_date: d, event_at: null, available_at: seen, source_url: new URL(m[1], "https://www.federalreserve.gov").href }];
  })).values()];
}
var etfAdapter = { status: "not_configured", async fetch() {
  return [];
} };

// src/lib/backend/quality.ts
function quality(rows, now) {
  const flags = [];
  const groups = /* @__PURE__ */ new Map();
  for (const row of rows) groups.set(row.series_id, [...groups.get(row.series_id) ?? [], row]);
  for (const [series_id, input] of groups) {
    const flag = (code, obs_date, details) => flags.push({ series_id, code, severity: "warning", obs_date, details });
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < input.length; i++) {
      const r = input[i];
      const key = `${r.obs_date}|${r.available_at}`;
      if (seen.has(key)) flag("DUPLICATE_DATE_VINTAGE", r.obs_date);
      seen.add(key);
      if (i && r.availability_basis === input[i - 1].availability_basis && r.vendor === input[i - 1].vendor && r.obs_date < input[i - 1].obs_date) flag("NON_MONOTONIC_DATES", r.obs_date);
    }
    const sorted = [...new Map(input.map((r) => [r.obs_date, r])).values()].sort((a, b) => a.obs_date.localeCompare(b.obs_date));
    const weekly = series_id === "cot";
    const newest = sorted.at(-1);
    if (Date.parse(now) - Date.parse(newest.obs_date) > (weekly ? 21 : 7) * 864e5) flag("STALE", newest.obs_date);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      if (Date.parse(b.obs_date) - Date.parse(a.obs_date) > (weekly ? 14 : 5) * 864e5) flag("GAP", b.obs_date, { previous: a.obs_date });
      if (series_id === "ry" ? Math.abs(b.value - a.value) > 0.5 : a.value > 0 && Math.abs(b.value / a.value - 1) > (series_id === "vix" ? 0.6 : 0.15)) flag("OUTLIER_CHANGE", b.obs_date);
    }
    if (input.some((r) => r.availability_basis === "first_seen")) flags.push({ series_id, code: "HISTORICAL_AVAILABILITY_NOT_VERIFIED", severity: "info", details: { policy: "First retrieved value is unavailable before retrieval; no historical release time assumed." } });
  }
  const check = new Map(rows.filter((r) => r.series_id === "gold_check").map((r) => [r.obs_date, r.value]));
  for (const gold of rows.filter((r) => r.series_id === "gold")) {
    const other = check.get(gold.obs_date);
    if (other && Math.abs(gold.value / other - 1) > 0.02) flags.push({ series_id: "gold", code: "GOLD_CROSS_CLOCK_DISAGREEMENT", severity: "warning", obs_date: gold.obs_date, details: { relative: gold.value / other - 1, comparable_clocks: false } });
  }
  const broad = rows.filter((r) => r.series_id === "broad_dollar").sort((a, b) => a.obs_date.localeCompare(b.obs_date));
  const dx = new Map(rows.filter((r) => r.series_id === "dxy").map((r) => [r.obs_date, r.value]));
  for (let i = 1; i < broad.length; i++) {
    const a = broad[i - 1], b = broad[i], x = dx.get(a.obs_date), y = dx.get(b.obs_date);
    if (x && y && Math.abs(Math.log(y / x) - Math.log(b.value / a.value)) > 0.02) flags.push({ series_id: "dxy", code: "DIFFERENT_DOLLAR_BASKETS_DIVERGE", severity: "info", obs_date: b.obs_date });
  }
  return flags;
}

// src/lib/backend/vendors.ts
var required = (env, key) => {
  if (!env[key]) throw new BackendError(`${key}_MISSING`);
  return env[key];
};
function oandaUrl(env, instrument, start, end) {
  if (!["practice", "live"].includes(env.OANDA_ENV ?? "practice")) throw new BackendError("INVALID_OANDA_ENV");
  const host = env.OANDA_ENV === "live" ? "api-fxtrade.oanda.com" : "api-fxpractice.oanda.com";
  const requestedEnd = `${dateOnly(end)}T23:59:59Z`;
  const latest = new Date(Date.now() - 5e3).toISOString();
  const params = new URLSearchParams({ price: "M", granularity: "D", from: `${dateOnly(start)}T00:00:00Z`, to: Date.parse(requestedEnd) > Date.parse(latest) ? latest : requestedEnd, dailyAlignment: "17", alignmentTimezone: "America/New_York", smooth: "false" });
  return `https://${host}/v3/instruments/${instrument}/candles?${params}`;
}
async function fetchOanda(env, instrument, start, end, attempts = 3) {
  return requestJson(oandaUrl(env, instrument, start, end), { headers: { Authorization: `Bearer ${required(env, "OANDA_API_TOKEN")}`, "Accept-Datetime-Format": "RFC3339" } }, attempts);
}
async function fetchFred(env, id, start, end, initial, attempts = 3) {
  const params = new URLSearchParams({
    api_key: required(env, "FRED_API_KEY"),
    file_type: "json",
    series_id: id,
    observation_start: dateOnly(start),
    observation_end: dateOnly(end),
    realtime_start: initial ? start : (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    realtime_end: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    output_type: initial ? "4" : "1",
    sort_order: "asc",
    limit: "100000"
  });
  const result = await requestJson(`https://api.stlouisfed.org/fred/series/observations?${params}`, {}, attempts);
  if (result.count && result.count > result.observations.length) throw new BackendError("FRED_PAGINATION_REQUIRED");
  return result;
}
async function fetchTwelve(env, start, end, reserve, attempts = 3) {
  const params = new URLSearchParams({ apikey: required(env, "TWELVE_DATA_API_KEY"), symbol: "XAU/USD", interval: "1day", start_date: dateOnly(start), end_date: dateOnly(end), outputsize: "5000", order: "ASC", timezone: "UTC" });
  return requestJson(`https://api.twelvedata.com/time_series?${params}`, {}, attempts, reserve);
}
async function fetchCftc(start, end, attempts = 3) {
  const params = new URLSearchParams({ "$where": `cftc_contract_market_code='088691' AND report_date_as_yyyy_mm_dd between '${dateOnly(start)}T00:00:00' and '${dateOnly(end)}T23:59:59'`, "$order": "report_date_as_yyyy_mm_dd ASC", "$limit": "1000" });
  const rows = await requestJson(`https://publicreporting.cftc.gov/resource/72hh-3qpy.json?${params}`, {}, attempts);
  if (!Array.isArray(rows) || rows.length === 1e3) throw new BackendError("CFTC_INVALID_OR_TRUNCATED");
  return rows;
}
async function fetchReleaseDates(env, release, attempts = 3) {
  const params = new URLSearchParams({ api_key: required(env, "FRED_API_KEY"), file_type: "json", release_id: String(release), realtime_start: "1776-07-04", realtime_end: "9999-12-31", include_release_dates_with_no_data: "true", limit: "1000", sort_order: "desc" });
  return requestJson(`https://api.stlouisfed.org/fred/release/dates?${params}`, {}, attempts);
}

// src/lib/backend/ingest.ts
var JOBS = ["fred", "oanda", "twelve", "cftc", "events", "etf"];
function validateJob(job, start, end) {
  if (!JOBS.includes(job) || dateOnly(start) > dateOnly(end) || Date.parse(end) - Date.parse(start) > 366 * 864e5) throw new BackendError("INVALID_JOB_RANGE", 400);
  if (end > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) throw new BackendError("FUTURE_RANGE", 400);
}
async function ingest(env, job, start, end, historical = false) {
  validateJob(job, start, end);
  const db = new Database(env);
  const [run] = await db.insert("ingestion_runs", { job, parameters: { start, end, historical, policy: "grades-v1" } });
  let observations = [], bars = [], events = [], flags = [];
  try {
    if (job === "etf") {
      await db.patch("ingestion_runs", run.id, { status: etfAdapter.status === "not_configured" ? "not_configured" : "failed", finished_at: await db.now() });
      return { runId: run.id, status: "not_configured", rows: 0 };
    }
    if (job === "fred") {
      for (const [id, series] of Object.entries(FRED_SERIES)) {
        for (const initial of [true, false]) {
          const payload = await fetchFred(env, id, start, end, initial);
          observations.push(...normalizeFred(payload, series, await db.now(), initial));
        }
      }
    }
    if (job === "oanda") {
      for (const instrument of ["XAU_USD", ...FX]) {
        const payload = await fetchOanda(env, instrument, start, end);
        bars.push(...normalizeOanda(payload, instrument, await db.now()));
      }
      observations = [...goldObservations(bars.filter((b) => b.instrument === "XAU_USD")), ...dxyObservations(bars)];
      if (!observations.some((o) => o.series_id === "dxy")) flags.push({ series_id: "dxy", code: "INCOMPLETE_FX_BASKET", severity: "error" });
    }
    if (job === "twelve") {
      const payload = await fetchTwelve(env, start, end, async () => {
        const allowed = await db.call("rpc/reserve_twelve_request", "POST", {});
        if (!allowed) throw new BackendError("TWELVE_BUDGET_EXHAUSTED");
      });
      observations = normalizeTwelve(payload, await db.now());
      flags.push({ series_id: "gold_check", code: "DAILY_CLOCK_NOT_EQUIVALENT", severity: "info" });
    }
    if (job === "cftc") {
      observations = normalizeCftc(await fetchCftc(start, end), await db.now());
      flags.push({ series_id: "cot", code: "ACTUAL_HISTORICAL_RELEASE_EVIDENCE_MISSING", severity: "warning", details: { policy: "first_seen", contract: "088691", dataset: "72hh-3qpy" } });
    }
    if (job === "events") {
      for (const [release, kind] of [[10, "CPI"], [50, "NFP"]]) {
        events.push(...normalizeReleaseDates(await fetchReleaseDates(env, release), kind, await db.now(), `https://fred.stlouisfed.org/release?rid=${release}`));
      }
      const urls = ["https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"];
      for (let year = Number(start.slice(0, 4)); year <= Math.min(2020, Number(end.slice(0, 4))); year++) urls.push(`https://www.federalreserve.gov/monetarypolicy/fomchistorical${year}.htm`);
      for (const url of urls) {
        const response = await fetch(url, { signal: AbortSignal.timeout(12e3) });
        if (!response.ok) throw new BackendError("FED_CALENDAR_UNAVAILABLE");
        events.push(...normalizeFedCalendar(await response.text(), await db.now()));
      }
      events = events.filter((e) => e.event_date >= start && e.event_date <= end);
    }
    const now = await db.now();
    if (historical && ["oanda", "twelve"].includes(job)) observations = observations.map((o) => ({
      ...o,
      available_at: new Date(Math.min(Date.parse(now), Date.parse(nyTime(addDays(o.obs_date, 1))))).toISOString(),
      availability_basis: "vendor_history",
      evidence_url: job === "oanda" ? "https://developer.oanda.com/rest-live-v20/instrument-ep/" : "https://twelvedata.com/docs"
    }));
    flags.push(...quality(observations, now));
    const groups = /* @__PURE__ */ new Map();
    for (const o of observations) {
      const k = `${o.series_id}:${o.obs_date}:${o.available_at}`;
      groups.set(k, [...groups.get(k) ?? [], o]);
    }
    observations = [...groups.values()].flatMap((group) => {
      if (new Set(group.map((o) => o.value)).size > 1) {
        flags.push({ series_id: group[0].series_id, obs_date: group[0].obs_date, code: "CONFLICTING_DUPLICATES_QUARANTINED", severity: "error" });
        return [];
      }
      return [group[0]];
    });
    if (!observations.length && !events.length) flags.push({ code: "EMPTY_RESPONSE", severity: "warning" });
    if (job === "oanda" || job === "twelve") {
      const other = job === "oanda" ? "gold_check" : "gold";
      const saved = await db.call(`observations?select=series_id,obs_date,value,available_at,vendor,availability_basis&series_id=eq.${other}&obs_date=gte.${start}&obs_date=lte.${end}&order=available_at.desc&limit=1000`);
      flags.push(...quality([...saved, ...observations], now).filter((f) => f.code === "GOLD_CROSS_CLOCK_DISAGREEMENT"));
    }
    if (job === "fred" || job === "oanda") {
      const saved = await db.call(`observations?select=series_id,obs_date,value,available_at,vendor,availability_basis&series_id=in.(dxy,broad_dollar)&obs_date=gte.${start}&obs_date=lte.${end}&order=available_at.asc&limit=1000`);
      const latest = [...new Map([...saved, ...observations].filter((o) => o.series_id === "dxy" || o.series_id === "broad_dollar").map((o) => [`${o.series_id}:${o.obs_date}`, o])).values()];
      flags.push(...quality(latest, now).filter((f) => f.code === "DIFFERENT_DOLLAR_BASKETS_DIVERGE"));
    }
    const observationRows = await Promise.all(observations.map(async (o) => ({ ...o, run_id: run.id, content_hash: await digest({ series: o.series_id, date: o.obs_date, value: o.value, basis: o.availability_basis }) })));
    const barRows = await Promise.all(bars.map(async (b) => ({ ...b, run_id: run.id, content_hash: await digest({ ...b, available_at: void 0 }) })));
    let written = 0;
    for (let i = 0; i < observationRows.length; i += 500) written += await db.call("rpc/append_observations", "POST", { batch: observationRows.slice(i, i + 500) });
    const rawWritten = await db.append("fx_bars", barRows);
    let eventWritten = 0;
    for (const event of events) {
      const old = await db.call(`events?select=event_date&kind=eq.${event.kind}&event_date=eq.${event.event_date}&limit=1`);
      if (!old.length) eventWritten += await db.append("events", [{ ...event, run_id: run.id }]);
    }
    if (flags.length) await db.append("data_quality_flags", flags.map((f) => ({ ...f, details: f.details ?? {}, run_id: run.id })));
    await db.call("rpc/reconcile_quality_alerts", "POST", { job_name: job, flags });
    const totalWritten = written + rawWritten + eventWritten;
    await db.patch("ingestion_runs", run.id, { status: "success", rows_written: totalWritten, finished_at: await db.now() });
    return { runId: run.id, status: "success", rows: totalWritten, observationRows: written, rawRows: rawWritten, eventRows: eventWritten, flags: flags.map((f) => f.code) };
  } catch (error) {
    const code = error instanceof BackendError ? error.code : "NORMALIZATION_OR_PERSISTENCE_FAILED";
    await db.append("data_quality_flags", [{ run_id: run.id, code, severity: "error" }]);
    await db.patch("ingestion_runs", run.id, { status: "failed", error_code: code, finished_at: await db.now() });
    throw new BackendError(code);
  }
}
function chunks(start, end, days = 31) {
  dateOnly(start);
  dateOnly(end);
  if (start > end) throw new BackendError("INVALID_JOB_RANGE", 400);
  const ranges = [];
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new BackendError("INVALID_CHUNK_SIZE", 400);
  for (let day = start; day <= end; ) {
    const to = [addDays(day, days - 1), end].sort()[0];
    ranges.push({ start: day, end: to });
    day = addDays(to, 1);
  }
  return ranges;
}
export {
  JOBS,
  chunks,
  ingest,
  validateJob
};
