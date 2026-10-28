-- Closed by default. No cron jobs or public vendor-data grants are installed.
create table public.series (
  id text primary key, name text not null, vendor text not null, unit text not null,
  frequency text not null, license_note text not null, active boolean not null default true,
  max_age_days integer not null check (max_age_days between 1 and 60)
);
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(), job text not null,
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed','not_configured')),
  rows_written integer not null default 0, error_code text, parameters jsonb not null default '{}'
);
create index ingestion_job_time on public.ingestion_runs(job, started_at desc);
create table public.observations (
  id bigint generated always as identity primary key,
  series_id text not null references public.series(id), obs_date date not null,
  value double precision not null check (value > '-Infinity'::float8 and value < 'Infinity'::float8),
  available_at timestamptz not null, vendor text not null,
  ingested_at timestamptz not null default now(), run_id uuid not null references public.ingestion_runs(id),
  availability_basis text not null check (availability_basis in ('first_seen','vintage_day_end','release_evidence')),
  evidence_url text, content_hash text not null,
  unique(series_id,obs_date,available_at), unique(series_id,obs_date,content_hash),
  check (available_at >= obs_date::timestamp at time zone 'UTC')
);
create index observations_asof on public.observations(series_id,obs_date desc,available_at desc);
create index observations_run on public.observations(run_id);
create table public.fx_bars (
  id bigint generated always as identity primary key, instrument text not null,
  vendor text not null, start_at timestamptz not null, close_at timestamptz not null,
  open double precision not null, high double precision not null, low double precision not null,
  close double precision not null check (close > 0), volume bigint not null,
  complete boolean not null check (complete), available_at timestamptz not null,
  run_id uuid not null references public.ingestion_runs(id), content_hash text not null,
  unique(instrument,vendor,start_at,content_hash), check(high >= low), check(close_at > start_at)
);
create index fx_bars_run on public.fx_bars(run_id);
create table public.events (
  id bigint generated always as identity primary key,
  kind text not null check(kind in ('CPI','NFP','FOMC')), event_date date not null,
  event_at timestamptz, available_at timestamptz not null, source_url text not null,
  run_id uuid not null references public.ingestion_runs(id),
  unique(kind,event_date,available_at)
);
create index events_run on public.events(run_id);
create index events_date on public.events(event_date,available_at);
create table public.data_quality_flags (
  id bigint generated always as identity primary key, run_id uuid not null references public.ingestion_runs(id),
  series_id text references public.series(id), code text not null,
  severity text not null check(severity in ('info','warning','error')),
  obs_date date, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index quality_run on public.data_quality_flags(run_id);
create index quality_series on public.data_quality_flags(series_id,created_at desc);
create table public.trials (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  config jsonb not null, data_fingerprint text not null, results jsonb not null,
  deflated_sharpe_inputs jsonb not null, candidate_count integer not null check(candidate_count between 1 and 100),
  request_key text not null, created_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create index trials_user_created on public.trials(user_id,created_at desc);
create table public.alert_events (
  id uuid primary key default gen_random_uuid(), rule text not null, severity text not null,
  payload jsonb not null, first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(), resolved_at timestamptz
);
create unique index alert_open_rule on public.alert_events(rule) where resolved_at is null;

-- US federal business days, including observed fixed holidays. Full 17:00 closes;
-- deliberately NOT an exchange trading calendar (no early closes / Good Friday).
create function public.us_business_day(d date) returns boolean
language sql immutable security invoker set search_path = '' as $$
  with fixed as (
    select make_date(y,m,dd) as h from
      generate_series(extract(year from d)::int-1,extract(year from d)::int+1) y
      cross join (values (1,1),(6,19),(7,4),(11,11),(12,25)) f(m,dd)
      where m <> 6 or y >= 2021
  ), observed as (
    select case extract(isodow from h) when 6 then h-1 when 7 then h+1 else h end as h from fixed
  )
  select extract(isodow from d) between 1 and 5
    and not exists(select 1 from observed where h=d)
    and not (extract(month from d)=1 and extract(isodow from d)=1 and extract(day from d) between 15 and 21)
    and not (extract(month from d)=2 and extract(isodow from d)=1 and extract(day from d) between 15 and 21)
    and not (extract(month from d)=5 and extract(isodow from d)=1 and extract(day from d)>=25)
    and not (extract(month from d)=9 and extract(isodow from d)=1 and extract(day from d)<=7)
    and not (extract(month from d)=10 and extract(isodow from d)=1 and extract(day from d) between 8 and 14)
    and not (extract(month from d)=11 and extract(isodow from d)=4 and extract(day from d) between 22 and 28);
$$;

-- The ONLY observation read path for the market API. Bound each selection by
-- BOTH the requested cutoff and EACH bar's close. Prefer newest observation
-- date, THEN newest knowable vintage for that date. Never backfill future values.
create function public.series_as_of(
  series_ids text[], as_of timestamptz,
  start_date date default null, end_date date default null
) returns table(bar_date date,bar_close timestamptz,points jsonb)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select greatest(coalesce(start_date,(as_of at time zone 'America/New_York')::date-2192),
      (as_of at time zone 'America/New_York')::date-2192) as lo,
      least(coalesce(end_date,(as_of at time zone 'America/New_York')::date),
      (as_of at time zone 'America/New_York')::date) as hi
  ), bars as (
    select d::date as dt, (d::date+time '17:00') at time zone 'America/New_York' as close_at
    from bounds cross join lateral generate_series(lo::timestamp,hi::timestamp,interval '1 day') d
    where public.us_business_day(d::date)
  )
  select b.dt,b.close_at,coalesce(jsonb_object_agg(s.id,jsonb_build_object(
      'value',o.value,'obs_date',o.obs_date,'available_at',o.available_at,
      'vendor',o.vendor,'availability_basis',o.availability_basis)) filter(where o.id is not null),'{}'::jsonb)
  from bars b cross join public.series s
  left join lateral (
    select o.* from public.observations o
    where o.series_id=s.id and o.obs_date<=b.dt and o.obs_date>=b.dt-s.max_age_days
      and o.available_at<=least(as_of,b.close_at)
    order by o.obs_date desc,o.available_at desc limit 1
  ) o on true
  where s.id=any(series_ids) and s.active and b.close_at<=as_of
  group by b.dt,b.close_at order by b.dt;
$$;

create function public.reject_vintage_mutation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Append-only table: insert a new vintage'; end;
$$;
create trigger observations_append_only before update or delete on public.observations
  for each row execute function public.reject_vintage_mutation();
create trigger fx_bars_append_only before update or delete on public.fx_bars
  for each row execute function public.reject_vintage_mutation();
create trigger events_append_only before update or delete on public.events
  for each row execute function public.reject_vintage_mutation();

insert into public.series(id,name,vendor,unit,frequency,license_note,max_age_days) values
('gold','XAU/USD midpoint','OANDA','USD/oz','daily','Private use only; redistribution unapproved',5),
('dxy','Synthetic ICE-weight dollar basket','OANDA-derived','index','daily','Synthetic, not ICE licensed feed; redistribution unapproved',5),
('gold_check','XAU/USD cross-check','Twelve Data','USD/oz','daily','Different daily clock; redistribution unapproved',5),
('ry','DFII10','FRED','percent','daily','Review upstream series rights',10),
('breakeven','T5YIE','FRED','percent','daily','Review upstream series rights',10),
('nominal_yield','DGS10','FRED','percent','daily','Review upstream series rights',10),
('vix','VIXCLS','FRED','index','daily','Cboe rights; redistribution unapproved',10),
('oil','DCOILWTICO','FRED','USD/barrel','daily','Spot WTI; not a futures continuation',10),
('broad_dollar','DTWEXBGS','FRED','index','daily','Different index definition from DXY',14),
('cot','COMEX gold managed money net futures only','CFTC','contracts','weekly','Public government data; release evidence required',21),
('etf','GLD holdings','not configured','tonnes','daily','No approved provider; no scraping',10);

-- Intentional deny policies make the closed access model explicit to advisors.
do $$ declare t text; begin
  foreach t in array array['series','observations','fx_bars','events','ingestion_runs','data_quality_flags','trials','alert_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy closed_access on public.%I for all to anon,authenticated using (false) with check (false)',t);
  end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
revoke all on function public.series_as_of(text[],timestamptz,date,date) from public,anon,authenticated;
revoke all on function public.us_business_day(date) from public,anon,authenticated;
revoke all on function public.reject_vintage_mutation() from public,anon,authenticated;
grant execute on function public.series_as_of(text[],timestamptz,date,date),public.us_business_day(date) to service_role;
