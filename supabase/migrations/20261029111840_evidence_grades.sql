-- Evidence describes the value at its declared availability, never its observation date.
alter table public.observations drop constraint observations_availability_basis_check;
alter table public.observations add constraint observations_availability_basis_check check(availability_basis in ('first_seen','vintage_day_end','release_evidence','vendor_history','unverified'));
alter table public.observations add column evidence_grade text generated always as (
 case when availability_basis in ('vintage_day_end','release_evidence','first_seen') then 'A'
 when availability_basis='vendor_history' then 'B' else 'C' end) stored;
create table public.daily_snapshots (
 id bigint generated always as identity primary key, captured_at timestamptz not null default clock_timestamp(),
 snapshot_date date not null default (clock_timestamp() at time zone 'America/New_York')::date,
 series_id text not null references public.series(id), payload jsonb not null, snapshot_hash text not null,
 unique(snapshot_date,series_id)
);
alter table public.daily_snapshots enable row level security;
revoke all on public.daily_snapshots from anon,authenticated;
grant select,insert on public.daily_snapshots to service_role;
grant usage,select on sequence public.daily_snapshots_id_seq to service_role;
create trigger snapshots_immutable before update or delete on public.daily_snapshots for each row execute function public.reject_vintage_mutation();
create or replace function public.series_as_of(
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
      'vendor',o.vendor,'availability_basis',o.availability_basis,'evidence_grade',o.evidence_grade)) filter(where o.id is not null),'{}'::jsonb)
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

