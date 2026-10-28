-- Supabase's pre-existing auto-RLS event-trigger helper was publicly executable.
-- Keep the trigger, remove direct RPC execution for untrusted callers.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
  end if;
end $$;
