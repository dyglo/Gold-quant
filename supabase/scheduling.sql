-- OPT-IN TEMPLATE ONLY. Not a migration. Never run during normal deployment.
-- Before use: enable pg_cron/pg_net, configure the Edge Function and Vault.
-- Deliberate session opt-in: SET gold_quant.enable_schedules = 'true';
do $$
declare item record; target text;
begin
  if current_setting('gold_quant.enable_schedules',true) is distinct from 'true' then
    raise exception 'Scheduling disabled: explicit operator opt-in required';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('gold_quant_edge_url','gold_quant_edge_jwt','gold_quant_cron_secret') and length(decrypted_secret)>0) <> 3 then
    raise exception 'Required Vault entries are missing';
  end if;
  for item in select * from (values
    ('oanda','5 23 * * 1-5'),('fred','15 23 * * 1-5'),
    ('twelve','20 23 * * 1-5'),('cftc','25 23 * * 1-5'),('events','30 23 * * 1-5')
  ) j(job,schedule) loop
    -- UTC schedules after NY 17:00 in both DST seasons. Daily CFTC polling also
    -- catches delayed releases; it NEVER substitutes for release-time evidence.
    target := format($command$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='gold_quant_edge_url'),
        headers := jsonb_build_object('Content-Type','application/json',
          'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='gold_quant_edge_jwt'),
          'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='gold_quant_cron_secret')),
        body := jsonb_build_object('job',%L,'start',(current_date-14)::text,'end',current_date::text));
    $command$,item.job);
    perform cron.schedule('gold-quant-'||item.job,item.schedule,target);
  end loop;
end $$;
