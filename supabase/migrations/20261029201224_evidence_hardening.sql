create policy closed_access on public.daily_snapshots for all to anon,authenticated using(false) with check(false);
revoke truncate,update,delete on public.daily_snapshots,public.model_versions,public.ledger_inputs,public.signal_ledger,public.ledger_outcomes,public.ledger_gaps,public.research_results from service_role;
