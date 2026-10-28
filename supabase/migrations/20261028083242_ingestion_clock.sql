-- Use one authoritative clock after receiving vendor payloads. A worker's
-- wall clock can differ from Postgres and must not backdate first-seen evidence.
create function public.ingestion_clock() returns timestamptz
language sql volatile security invoker set search_path = '' as $$ select clock_timestamp(); $$;
revoke all on function public.ingestion_clock() from public,anon,authenticated;
grant execute on function public.ingestion_clock() to service_role;
