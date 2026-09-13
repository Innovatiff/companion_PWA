-- Push delivery: the daily engagement planner picks by priority, sends at most
-- one per day, only to people who can receive it; the sender claims alerts first.
--
-- The clock is pinned: p_now = 2026-09-13 11:00 UTC = 07:00 in Toronto.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000012', 'Push Test') on conflict do nothing;
insert into leagues (country, name, source, source_league_id) values ('HN', 'Push Test League', 'test', 'push-league') on conflict do nothing;
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'test', t.sid from leagues l, (values ('Push FC', 'push-1'), ('Rival FC', 'push-2')) t(name, sid)
 where l.name = 'Push Test League'
on conflict do nothing;

insert into clients (id, affiliate_id, code, full_name, country, language, team_id, notify_hour, timezone)
select v.id::uuid, '99990000-0000-4000-8000-000000000012', v.code, v.name, v.country::country_code, v.lang::ui_language,
       (select id from teams where name = v.team), 7, 'America/Toronto'
  from (values
    ('99990000-0000-4000-8000-0000000000a1', 'PVZHAAA2', 'Match Person', 'HN', 'es', 'Push FC'),
    ('99990000-0000-4000-8000-0000000000a2', 'PVZHAAA3', 'Rate Person',  'JM', 'en', null),
    ('99990000-0000-4000-8000-0000000000a3', 'PVZHAAA4', 'Lotto Person', 'GT', 'es', null),
    ('99990000-0000-4000-8000-0000000000a4', 'PVZHAAA6', 'No Push',      'HN', 'es', 'Push FC')
  ) v(id, code, name, country, lang, team)
on conflict do nothing;

insert into push_subscriptions (client_id, endpoint, p256dh, auth)
select id, 'https://push.example.invalid/' || code, 'key', 'auth' from clients
 where code in ('PVZHAAA2', 'PVZHAAA3', 'PVZHAAA4');

-- Push FC plays at 23:00 UTC (7pm Toronto), confirmed an hour ago.
insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id, '2026-09-13 23:00:00+00', 'scheduled', 'test', 'push-fixture-1', '2026-09-13 10:00:00+00'
  from leagues l join teams h on h.name = 'Push FC' join teams a on a.name = 'Rival FC'
 where l.name = 'Push Test League';

-- JMD at a 30-day high on 2026-09-13.
insert into fx_rates (rate_date, quote, rate) values ('2026-09-13', 'JMD', 116.40)
on conflict (rate_date, quote) do update set rate = excluded.rate;

-- A lottery draw in Guatemala today.
insert into lottery_games (country, operator, name, draw_times_local, timezone, results_url, parser_implemented, active)
values ('GT', 'Push Test Operator', 'Lotto Prueba', '{20:00}', 'America/Guatemala', 'https://example.invalid/', true, true)
on conflict do nothing;
insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url)
select id, '2026-09-13', '20:00', array['07', '12', '33'], 'https://example.invalid/' from lottery_games where name = 'Lotto Prueba';

-- --------------------------------------------------------------------------
-- The planner: match day > 30-day FX high > lottery, one per day, push only
-- --------------------------------------------------------------------------
do $$
declare n int; r record;
begin
  n := app.plan_engagement('2026-09-13 11:00:00+00');
  assert n = 3, format('three clients with push at their hour, got %s', n);

  select trigger, title, body into r from notifications where client_id = '99990000-0000-4000-8000-0000000000a1' and channel = 'engagement';
  assert r.trigger = 'match_day' and r.title = 'Hoy juega Push FC' and r.body = 'Push FC vs Rival FC, 7pm', format('%s', row_to_json(r));

  select trigger, title into r from notifications where client_id = '99990000-0000-4000-8000-0000000000a2' and channel = 'engagement';
  assert r.trigger = 'fx_30d_high' and r.title = 'Reference rate: highest in 30 days', format('%s', row_to_json(r));

  select trigger, title, body into r from notifications where client_id = '99990000-0000-4000-8000-0000000000a3' and channel = 'engagement';
  assert r.trigger = 'lottery' and r.title = 'Resultados de Lotto Prueba' and r.body = '07 · 12 · 33', format('%s', row_to_json(r));

  assert not exists (select 1 from notifications where client_id = '99990000-0000-4000-8000-0000000000a4'),
    'no push subscription, nothing planned';

  assert app.plan_engagement('2026-09-13 11:20:00+00') = 0, 'at most one engagement notification per day';
  assert app.plan_engagement('2026-09-13 15:00:00+00') = 0, 'only at the client''s notify_hour';
  raise notice 'PASS push: engagement picks match day, then FX high, then lottery, once a day, push only';
end $$;

-- --------------------------------------------------------------------------
-- The sender claims alerts before engagement, and gives up visibly
-- --------------------------------------------------------------------------
do $$
declare r notifications%rowtype; n int;
begin
  -- Earlier test files leave queued notifications of their own; set them aside.
  update notifications set status = 'suppressed', error = 'set aside by 12_push_delivery_test'
   where status = 'queued' and client_id not in (
     select id from clients where code in ('PVZHAAA2', 'PVZHAAA3', 'PVZHAAA4', 'PVZHAAA6'));
  update notifications set scheduled_for = now() - interval '1 minute' where channel = 'engagement';
  insert into notifications (client_id, local_date, channel, trigger, title, body, cap_identifier, scheduled_for)
  values ('99990000-0000-4000-8000-0000000000a1', current_date, 'alert', 'weather_alert', 'Aviso rojo', 'Texto', 'PUSH-TEST-ALERT', now());

  select * into r from app.claim_due_notifications(1);
  assert r.channel = 'alert' and r.attempts = 1, format('alerts are claimed first: %s', row_to_json(r));

  perform app.finish_notification(r.id, 'sent', 1, null);
  assert (select status = 'sent' and sent_at is not null and delivered_count = 1 from notifications where id = r.id);

  select count(*) into n from app.claim_due_notifications(10);
  assert n = 3, format('the three engagement notifications, got %s', n);

  update notifications set attempts = 5 where channel = 'engagement';
  select count(*) into n from app.claim_due_notifications(10);
  assert n = 0, 'after 5 attempts a notification is no longer claimed';
  assert (select count(*) from notifications where channel = 'engagement' and status = 'queued') = 3,
    'it stays queued, visibly undelivered';

  perform app.finish_notification((select id from notifications where client_id = '99990000-0000-4000-8000-0000000000a3' and channel = 'engagement'),
                                  'suppressed', 0, 'no working push subscription');
  assert (select error from notifications where client_id = '99990000-0000-4000-8000-0000000000a3' and channel = 'engagement')
         = 'no working push subscription';
  raise notice 'PASS push: the sender claims alerts first and records failures';
end $$;
