-- Hashes deduplicate unchanged snapshots, but A -> B -> A is a real new vintage.
alter table public.observations drop constraint observations_series_id_obs_date_content_hash_key;
create function public.append_observations(batch jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare r record; previous_hash text; n integer := 0; inserted integer;
begin
  if jsonb_typeof(batch)<>'array' or jsonb_array_length(batch)>1000 then raise exception 'Invalid batch'; end if;
  for r in select * from jsonb_to_recordset(batch) as x(
    series_id text,obs_date date,value double precision,available_at timestamptz,
    vendor text,availability_basis text,evidence_url text,content_hash text,run_id uuid)
    order by series_id,obs_date,available_at
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.series_id,0));
    previous_hash := null;
    if r.availability_basis='first_seen' then
      select o.content_hash into previous_hash from public.observations o
      where o.series_id=r.series_id and o.obs_date=r.obs_date and o.availability_basis='first_seen'
      order by o.available_at desc limit 1;
    end if;
    if previous_hash is not distinct from r.content_hash then continue; end if;
    insert into public.observations(series_id,obs_date,value,available_at,vendor,availability_basis,evidence_url,content_hash,run_id)
    values(r.series_id,r.obs_date,r.value,r.available_at,r.vendor,r.availability_basis,r.evidence_url,r.content_hash,r.run_id)
    on conflict(series_id,obs_date,available_at) do nothing;
    get diagnostics inserted = row_count;
    n := n+inserted;
  end loop;
  return n;
end $$;
revoke all on function public.append_observations(jsonb) from public,anon,authenticated;
grant execute on function public.append_observations(jsonb) to service_role;

create table public.vendor_requests (
  id bigint generated always as identity primary key, vendor text not null,
  requested_at timestamptz not null default clock_timestamp()
);
create index vendor_requests_clock on public.vendor_requests(vendor,requested_at);
alter table public.vendor_requests enable row level security;
revoke all on public.vendor_requests from anon,authenticated;
grant all on public.vendor_requests to service_role;
grant usage,select on sequence public.vendor_requests_id_seq to service_role;
create policy closed_access on public.vendor_requests for all to anon,authenticated using(false) with check(false);
create function public.reserve_twelve_request() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare t timestamptz := clock_timestamp(); minute_count integer; day_count integer;
begin
  perform pg_advisory_xact_lock(42719031);
  select count(*) filter(where requested_at > t-interval '60 seconds'),count(*)
    into minute_count,day_count from public.vendor_requests
    where vendor='twelve' and requested_at >= (t at time zone 'UTC')::date::timestamp at time zone 'UTC';
  -- Also count prior-day requests in the rolling minute at UTC midnight.
  select count(*) into minute_count from public.vendor_requests
    where vendor='twelve' and requested_at > t-interval '60 seconds';
  if minute_count>=8 or day_count>=800 then return false; end if;
  insert into public.vendor_requests(vendor,requested_at) values('twelve',t);
  return true;
end $$;
revoke all on function public.reserve_twelve_request() from public,anon,authenticated;
grant execute on function public.reserve_twelve_request() to service_role;

create function public.trial_summary(owner_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('count',count(*),'candidateCount',coalesce(sum(candidate_count),0))
  from public.trials where user_id=owner_id;
$$;
revoke all on function public.trial_summary(uuid) from public,anon,authenticated;
grant execute on function public.trial_summary(uuid) to service_role;

create function public.job_health() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('job',j.job,'latest',to_jsonb(l),'last_success',s.finished_at)),'[]')
  from (values('fred'),('oanda'),('twelve'),('cftc'),('events'),('etf')) j(job)
  left join lateral(select status,finished_at,error_code,started_at from public.ingestion_runs r where r.job=j.job order by started_at desc limit 1) l on true
  left join lateral(select finished_at from public.ingestion_runs r where r.job=j.job and status='success' order by finished_at desc limit 1) s on true;
$$;
revoke all on function public.job_health() from public,anon,authenticated;
grant execute on function public.job_health() to service_role;
