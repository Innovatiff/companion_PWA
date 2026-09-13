-- LOCAL ONLY. Demo data for the owner portal on a throwaway database built with
-- packages/db/test/run-migrations.sh. It backdates payments and writes feed
-- runs directly, which production must never do.
--
--   psql [-v busy=ana.demo -v quiet=beto.demo] -f scripts/local-demo.sql leamington_admin
--
-- `busy` and `quiet` are affiliate logins (default ana.demo and beto.demo). On a
-- freshly rebuilt database, missing ones are created here, and so is an owner
-- if there is none, with known LOCAL passwords:
--   demo.owner / demo-owner-password-1, ana.demo / ana.demo-password-1, beto.demo / beto.demo-password-1
-- Clients are registered AS each affiliate, the way the affiliate portal does it
-- (packages/db/test/10_sales_ledger_test.sql), and renewals are collected as the
-- affiliate portal records them (packages/db/test/18_affiliate_renewals_test.sql).
\set ON_ERROR_STOP on
\if :{?busy}
\else
\set busy ana.demo
\endif
\if :{?quiet}
\else
\set quiet beto.demo
\endif

-- A local database has no `authenticated` grants unless the RLS tests ran;
-- Supabase grants these by default.
grant usage on schema public, app, extensions to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on all functions in schema app to authenticated;

select set_config('demo.busy', :'busy', false), set_config('demo.quiet', :'quiet', false);

do $$
declare r jsonb; l text;
begin
  if not exists (select 1 from owners) then
    r := app.portal_create_owner('demo.owner');
    perform app.portal_complete_setup(r->>'setup_token', 'demo-owner-password-1');
  end if;
  perform set_config('request.jwt.claim.sub', (select auth_user_id from owners limit 1)::text, false);
  foreach l in array array[current_setting('demo.busy'), current_setting('demo.quiet')] loop
    if not exists (select 1 from portal_logins where login = l) then
      r := app.create_affiliate(initcap(split_part(l, '.', 1)) || ' Demo', 'Tienda ' || initcap(split_part(l, '.', 1)), null, 0.40, l);
      perform app.portal_complete_setup(r->>'setup_token', l || '-password-1');
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

insert into teams (league_id, country, name, short_name, source)
select l.id, l.country, v.name, v.short, 'demo'
  from (values ('JM', 'Harbour View FC', 'Harbour View'), ('JM', 'Mount Pleasant FA', 'Mount Pleasant'),
               ('MX', 'Club América', 'América'), ('MX', 'Chivas Guadalajara', 'Chivas')) v(country, name, short)
  join leagues l on l.country = v.country::country_code
on conflict (league_id, name) do nothing;

do $$
declare
  v_busy  uuid := (select affiliate_id from portal_logins where login = current_setting('demo.busy'));
  v_quiet uuid := (select affiliate_id from portal_logins where login = current_setting('demo.quiet'));
  v_auth  uuid;
  r       jsonb;
  i       int;
  -- days ago each sale was paid, and a shift of its period
  busy_paid  int[] := array[0, 2, 5, 12, 20, 45];
  quiet_paid int[] := array[40, 75, 190];
  quiet_end  int[] := array[140, 12, -20];   -- period_end relative to today: active, due, lapsed
  code text;
begin
  if v_busy is null or v_quiet is null then
    raise exception 'set -v busy=<login> -v quiet=<login> to two affiliate logins';
  end if;

  v_auth := (select auth_user_id from portal_logins where affiliate_id = v_busy);
  perform set_config('request.jwt.claim.sub', v_auth::text, false);
  for i in 1 .. array_length(busy_paid, 1) loop
    code := (select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8));
    r := app.register_client(v_busy, code, format('Cliente Demo %s', i), case when i % 2 = 0 then 'MX' else 'JM' end::country_code,
                             case when i % 2 = 0 then (select admin_region from municipalities where country = 'MX' limit 1) else 'St. James' end,
                             null, v_auth);
    update subscriptions set paid_at = now() - make_interval(days => busy_paid[i]),
                             period_start = period_start - busy_paid[i], period_end = period_end - busy_paid[i]
     where client_id = (r->>'client_id')::uuid;
    update clients set created_at = now() - make_interval(days => busy_paid[i]) where id = (r->>'client_id')::uuid;
  end loop;
  -- One of the busy affiliate's clients is due in 5 days.
  update subscriptions set period_start = app.business_today() - 178, period_end = app.business_today() + 5
   where client_id = (select id from clients where affiliate_id = v_busy order by created_at limit 1);

  v_auth := (select auth_user_id from portal_logins where affiliate_id = v_quiet);
  perform set_config('request.jwt.claim.sub', v_auth::text, false);
  for i in 1 .. array_length(quiet_paid, 1) loop
    code := (select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8));
    r := app.register_client(v_quiet, code, format('Cliente Tranquilo %s', i), 'JM', 'St. Ann', null, v_auth);
    update subscriptions set paid_at = now() - make_interval(days => quiet_paid[i]),
                             period_start = app.business_today() + quiet_end[i] - 182, period_end = app.business_today() + quiet_end[i]
     where client_id = (r->>'client_id')::uuid;
    update clients set created_at = now() - make_interval(days => quiet_paid[i]) where id = (r->>'client_id')::uuid;
  end loop;
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- Renewals (0029, 0031: the collecting business earns), so every renewal table has contrast:
--   * two of busy's clients lapsed 48 and 63 days ago; quiet collects the first
--     back (a reactivation quiet earns; busy's client renewed elsewhere), the second stays lapsed
--     -> lapse rate: busy 50%, quiet 100%, the house and test affiliates nobody yet
--   * busy collects an early renewal on one of quiet's clients, then a second by
--     mistake (confirmed repeat), which the owner voids
--   * busy renews one of its own clients early
--   * the owner marks an early renewal paid on one of busy's clients (Dueño, no commission)
do $$
declare
  v_busy  uuid := (select affiliate_id from portal_logins where login = current_setting('demo.busy'));
  v_quiet uuid := (select affiliate_id from portal_logins where login = current_setting('demo.quiet'));
  v_busy_auth  uuid := (select auth_user_id from portal_logins where login = current_setting('demo.busy'));
  v_quiet_auth uuid := (select auth_user_id from portal_logins where login = current_setting('demo.quiet'));
  v_owner uuid := (select auth_user_id from owners limit 1);
  v_client uuid;
  v_key uuid;
  r jsonb;
  i int;
begin
  perform set_config('request.jwt.claim.sub', v_busy_auth::text, false);
  for i in 1 .. 2 loop
    r := app.register_client(v_busy, (select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8)),
                             format('Cliente Vencido %s', i), 'JM', 'St. James', null, v_busy_auth);
    v_client := (r->>'client_id')::uuid;
    update subscriptions set paid_at = now() - make_interval(days => 230 + 15 * (i - 1)),
                             period_start = app.business_today() - 230 - 15 * (i - 1), period_end = app.business_today() - 48 - 15 * (i - 1)
     where client_id = v_client;
    update clients set created_at = now() - make_interval(days => 230 + 15 * (i - 1)) where id = v_client;
  end loop;

  -- quiet looks up busy's lapsed client by code and collects: a reactivation, busy earns.
  perform set_config('request.jwt.claim.sub', v_quiet_auth::text, false);
  v_client := (app.renewal_lookup((select code from clients where full_name = 'Cliente Vencido 1'))->>'client_id')::uuid;
  r := app.affiliate_record_renewal(v_client, gen_random_uuid(), v_quiet_auth);
  assert r->>'status' = 'renewed', format('%s', r);

  -- busy collects early on quiet's client, then again by mistake; the owner voids the second.
  perform set_config('request.jwt.claim.sub', v_busy_auth::text, false);
  v_client := (select id from clients where full_name = 'Cliente Tranquilo 1');
  r := app.affiliate_record_renewal(v_client, gen_random_uuid(), v_busy_auth);
  assert r->>'status' = 'renewed', format('%s', r);
  v_key := gen_random_uuid();
  r := app.affiliate_record_renewal(v_client, v_key, v_busy_auth, true);
  assert r->>'status' = 'renewed', format('%s', r);
  r := app.affiliate_record_renewal((select id from clients where full_name = 'Cliente Demo 5'), gen_random_uuid(), v_busy_auth);
  assert r->>'status' = 'renewed', format('%s', r);
  perform set_config('request.jwt.claim.sub', v_owner::text, false);
  perform app.void_subscription((select id from subscriptions where request_key = v_key), 'cobrado dos veces (demo)');

  -- The owner marks an early renewal paid on busy's client.
  perform app.record_renewal((select id from clients where full_name = 'Cliente Demo 6'), v_owner);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- A test affiliate and a test client: marked PRUEBA, excluded from money.
do $$
declare v_test uuid; v_owner uuid := (select auth_user_id from owners limit 1);
begin
  insert into affiliates (name, commission_rate, is_test) values ('Afiliado de Prueba', 0.40, true) returning id into v_test;
  perform set_config('request.jwt.claim.sub', v_owner::text, false);
  perform app.register_client(v_test, (select string_agg(substr('ACDEFGHJKMNPQRTVWXYZ2346', 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 8)),
                              'Cliente de Prueba', 'JM', 'Kingston', null, v_owner);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- Feed runs, one state each (feed_expectations seed):
insert into source_runs (feed, started_at, finished_at, status, records_written, source_result, error) values
  -- fx: ok
  ('fx',        now() - interval '3 hours',  now() - interval '3 hours',  'ok',    4, 'items', null),
  -- forecast: ok, and the source confirmed there was nothing new
  ('forecast',  now() - interval '2 hours',  now() - interval '2 hours',  'ok',    0, 'confirmed_empty', null),
  -- alerts:JM: stale (15 min feed, last success 5 hours ago)
  ('alerts:JM', now() - interval '5 hours',  now() - interval '5 hours',  'ok',    2, 'items', null),
  -- fixtures: failing (the latest run errored)
  ('fixtures',  now() - interval '50 minutes', now() - interval '50 minutes', 'ok', 38, 'items', null),
  ('fixtures',  now() - interval '5 minutes', now() - interval '5 minutes', 'error', 0, 'no_answer', 'HTTP 429 from provider: rate limited'),
  -- static: never succeeded
  ('static',    now() - interval '1 day',    now() - interval '1 day',    'error', 0, 'no_answer', 'ECONNREFUSED consulate page'),
  -- a feed nothing watches
  ('lottery:JM:cashpot', now() - interval '20 minutes', now() - interval '20 minutes', 'ok', 1, 'items', null);
-- lottery: no runs at all -> never run, "could not determine".

-- Owner alert deliveries: one delivered, then one failed.
with a as (
  insert into owner_alerts (kind, feed, summary) values ('feed_stale', 'alerts:JM', 'alerts:JM has not succeeded in 5h')
  returning id
)
insert into owner_alert_deliveries (owner_alert_id, feed, kind, attempted_at, delivered, http_status, error)
select a.id, 'alerts:JM', 'feed_stale', now() - interval '4 hours', true, 200, null from a
union all
select a.id, 'alerts:JM', 'feed_stale', now() - interval '1 hour', false, 401, 'Unauthorized: bot token rejected' from a;

-- A red CAP alert and its client notifications in every status.
do $$
declare v_source bigint; v_alert bigint; c record; n int := 0;
begin
  select id into v_source from alert_sources where country = 'JM' order by id limit 1;
  if v_source is null then
    insert into alert_sources (country, agency, kind, feed_url) values ('JM', 'Meteorological Service of Jamaica', 'cap', 'https://example.invalid/cap')
    returning id into v_source;
  end if;
  insert into weather_alerts (source_id, country, cap_identifier, cap_sent, msg_type, event, headline, level, issued_at, source_url)
  values (v_source, 'JM', 'demo-jm-2026-001', now() - interval '2 hours', 'Alert', 'Flash Flood Warning',
          'FLASH FLOOD WARNING for St. James', 'red', now() - interval '2 hours', 'https://example.invalid/alert/001')
  returning id into v_alert;
  for c in select id, timezone from clients where country = 'JM' and not is_test order by created_at loop
    n := n + 1;
    insert into notifications (client_id, local_date, channel, trigger, title, body, weather_alert_id, cap_identifier,
                               status, scheduled_for, sent_at, error, attempts)
    values (c.id, (now() at time zone c.timezone)::date, 'alert', 'weather_alert', 'Flash Flood Warning', 'demo', v_alert, 'demo-jm-2026-001',
            (array['sent', 'sent', 'failed', 'suppressed', 'queued'])[1 + (n - 1) % 5]::notification_status,
            now() - interval '2 hours',
            case when (n - 1) % 5 < 2 then now() - interval '2 hours' end,
            case (n - 1) % 5 when 2 then 'push service 410 Gone' when 3 then 'no working push subscription' when 4 then 'timeout' end,
            case when (n - 1) % 5 = 4 then 5 else 1 end);
  end loop;
end $$;
