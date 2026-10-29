create table public.model_versions (
 id text primary key, config jsonb not null, code_git_hash text not null check(code_git_hash ~ '^[a-f0-9]{40}$'),
 owner_id uuid not null, created_at timestamptz not null default clock_timestamp(), unique(config,code_git_hash)
);
create function public.record_model_trial() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.trials(user_id,config,data_fingerprint,results,deflated_sharpe_inputs,candidate_count,request_key)
 values(new.owner_id,new.config,repeat('0',64),jsonb_build_object('model_version',new.id),'{}',1,'model:'||new.id);
 return new;
end $$;
create trigger model_trial after insert on public.model_versions for each row execute function public.record_model_trial();
create table public.ledger_inputs (
 snapshot_hash text primary key, payload jsonb not null, captured_at timestamptz not null default clock_timestamp()
);
create table public.signal_ledger (
 id bigint generated always as identity primary key,
 canonical_payload text not null,
 asof_ts timestamptz not null, bar_date date not null unique,
 model_version text not null references public.model_versions(id),
 data_snapshot_hash text not null references public.ledger_inputs(snapshot_hash),
 regime text not null, probabilities jsonb not null, bias_score double precision not null,
 votes jsonb not null, signal text not null check(signal in ('Bullish','Neutral','Bearish')),
 grade text not null check(grade in ('A','B')), prev_hash text not null, row_hash text not null unique,
 created_at timestamptz not null default clock_timestamp()
);
create table public.ledger_outcomes (
 ledger_id bigint not null references public.signal_ledger(id), horizon integer not null check(horizon in (1,5,20)),
 forward_return double precision not null, entry_close double precision not null, exit_close double precision not null,
 exit_date date not null, computed_at timestamptz not null default clock_timestamp(), primary key(ledger_id,horizon)
);
create table public.ledger_gaps (bar_date date primary key, reason text not null, recorded_at timestamptz not null default clock_timestamp());
create table public.research_results (
 id bigint generated always as identity primary key, model_version text not null references public.model_versions(id),
 label text not null default 'research' check(label='research'), horizon integer not null,
 data_snapshot_hash text not null, result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(model_version,horizon,data_snapshot_hash)
);
create function public.guard_ledger_insert() returns trigger language plpgsql security invoker set search_path='' as $$
declare head text; p jsonb; t timestamptz := clock_timestamp(); close_at timestamptz;
begin
 perform pg_advisory_xact_lock(7429651);
 p := new.canonical_payload::jsonb;
 new.asof_ts := (p->>'asof_ts')::timestamptz; new.bar_date := (p->>'bar_date')::date;
 new.model_version := p->>'model_version'; new.data_snapshot_hash := p->>'data_snapshot_hash';
 new.regime := p->>'regime'; new.probabilities := p->'probabilities'; new.bias_score := (p->>'bias_score')::float8;
 new.votes := p->'votes'; new.signal := p->>'signal'; new.grade := p->>'grade';
 close_at := (new.bar_date+time '17:00') at time zone 'America/New_York';
 if new.bar_date <> (t at time zone 'America/New_York')::date or not public.us_business_day(new.bar_date)
 or t < close_at+interval '15 minutes' or t > close_at+interval '6 hours' or new.asof_ts<>close_at
 then raise exception 'Outside prospective close window'; end if;
 if exists(select 1 from public.ledger_gaps where bar_date=new.bar_date) then raise exception 'Recorded gap cannot be filled'; end if;
 if not exists(select 1 from public.model_versions where id=new.model_version and created_at<=close_at) then raise exception 'Model not frozen before close'; end if;
 select row_hash into head from public.signal_ledger order by id desc limit 1;
 if new.prev_hash<>coalesce(head,repeat('0',64)) then raise exception 'Chain head changed'; end if;
 new.row_hash := encode(sha256(convert_to(new.canonical_payload||new.prev_hash,'UTF8')),'hex');
 return new;
end $$;
create trigger ledger_insert before insert on public.signal_ledger for each row execute function public.guard_ledger_insert();
do $$ declare t text; begin
 foreach t in array array['model_versions','ledger_inputs','signal_ledger','ledger_outcomes','ledger_gaps','research_results'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 execute format('create policy closed_access on public.%I for all to anon,authenticated using(false) with check(false)',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function public.reject_vintage_mutation()',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
revoke all on function public.record_model_trial(),public.guard_ledger_insert() from public,anon,authenticated;
create index ledger_version on public.signal_ledger(model_version);
create index ledger_snapshot on public.signal_ledger(data_snapshot_hash);
create index research_version on public.research_results(model_version);
