-- TRUNCATE bypasses row triggers, so remove it (and mutation grants) from the
-- ingestion role. Only an explicit privileged maintenance action can erase data.
revoke update,delete,truncate on public.observations,public.fx_bars,public.events from service_role;

create function public.reconcile_quality_alerts(job_name text,flags jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare f jsonb; key text; keys text[] := '{}'; t timestamptz := clock_timestamp();
begin
  if job_name not in ('fred','oanda','twelve','cftc','events','etf')
    or jsonb_typeof(flags)<>'array' or jsonb_array_length(flags)>1000 then raise exception 'Invalid alerts'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quality-alerts:'||job_name,0));
  for f in select value from jsonb_array_elements(flags) loop
    if f->>'severity'='info' then continue; end if;
    key := job_name||':'||coalesce(f->>'series_id','job')||':'||(f->>'code');
    keys := array_append(keys,key);
    insert into public.alert_events(rule,severity,payload,first_seen,last_seen)
    values(key,f->>'severity',f,t,t)
    on conflict(rule) where resolved_at is null
    do update set last_seen=excluded.last_seen,payload=excluded.payload,severity=excluded.severity;
  end loop;
  update public.alert_events set resolved_at=t,last_seen=t
    where rule like job_name||':%' and resolved_at is null and not(rule=any(keys));
end $$;
revoke all on function public.reconcile_quality_alerts(text,jsonb) from public,anon,authenticated;
grant execute on function public.reconcile_quality_alerts(text,jsonb) to service_role;
