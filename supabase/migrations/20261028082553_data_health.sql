create function public.data_health() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('series',s.id,'latest_observation',o.obs_date,
    'latest_availability',o.available_at,'stale',coalesce(o.obs_date < (now() at time zone 'America/New_York')::date-s.max_age_days,true))), '[]')
  from public.series s
  left join lateral(select obs_date,available_at from public.observations o
    where o.series_id=s.id and o.available_at<=now()
    order by o.obs_date desc,o.available_at desc limit 1) o on true where s.active;
$$;
revoke all on function public.data_health() from public,anon,authenticated;
grant execute on function public.data_health() to service_role;
