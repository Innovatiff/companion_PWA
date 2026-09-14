-- "Tu dinero" (0042): rate history and the week of the rate, the member's rate
-- reminder and its engagement trigger, and Ontario holidays beside home ones.
-- The clock is pinned: 2026-09-14 16:00 UTC = 12:00 in Toronto. Clients:
--   H   Honduras, es     M   Mexico, es (MXN at a 30-day high)
--   T   Honduras, team plays today     J   Jamaica, en, no JMD rate
\set ON_ERROR_STOP on
begin;

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000026', 'Money Test');
insert into leagues (country, name, source, source_league_id) values ('HN', 'Money Test League', 'test', 'money-league');
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'test', t.sid from leagues l, (values ('Money FC', 'money-1'), ('Coin FC', 'money-2')) t(name, sid)
 where l.name = 'Money Test League';

insert into clients (id, affiliate_id, code, full_name, country, language, team_id, notify_hour, timezone)
select v.id::uuid, '99990000-0000-4000-8000-000000000026', v.code, v.name, v.country::country_code, v.lang::ui_language,
       (select id from teams where name = v.team), 12, 'America/Toronto'
  from (values
    ('99990000-0000-4000-8000-0000000000d1', 'PQHAAA22', 'Rate Person',  'HN', 'es', null),
    ('99990000-0000-4000-8000-0000000000d2', 'PQHAAA23', 'Peso Person',  'MX', 'es', null),
    ('99990000-0000-4000-8000-0000000000d3', 'PQHAAA24', 'Match Person', 'HN', 'es', 'Money FC'),
    ('99990000-0000-4000-8000-0000000000d4', 'PQHAAA26', 'Dollar Person','JM', 'en', null)
  ) v(id, code, name, country, lang, team);

insert into push_subscriptions (client_id, endpoint, p256dh, auth)
select id, 'https://push.example.invalid/' || code, 'key', 'auth' from clients where code like 'PQHAAA2_';
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-01-01', date '2099-01-01', now(), 'sale', affiliate_id from clients where code like 'PQHAAA2_';

insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id, '2026-09-14 23:00:00+00', 'scheduled', 'test', 'money-fixture-1', '2026-09-14 15:00:00+00'
  from leagues l join teams h on h.name = 'Money FC' join teams a on a.name = 'Coin FC'
 where l.name = 'Money Test League';

-- HNL: real days only. 12-13 Sept (a weekend) and 5-6 Sept are missing.
delete from fx_rates where quote in ('HNL', 'MXN', 'JMD');
insert into fx_rates (rate_date, quote, rate) values
  ('2026-06-01', 'HNL', 25.00),   -- outside every window
  ('2026-07-01', 'HNL', 17.00),   -- inside 90 days only
  ('2026-08-20', 'HNL', 18.00),   -- inside 30 and 90 days
  ('2026-09-03', 'HNL', 19.00),
  ('2026-09-04', 'HNL', 19.10),
  ('2026-09-07', 'HNL', 19.20),
  ('2026-09-08', 'HNL', 19.30),
  ('2026-09-09', 'HNL', 19.60),
  ('2026-09-10', 'HNL', 19.40),
  ('2026-09-11', 'HNL', 19.40),
  ('2026-09-14', 'HNL', 19.50),
  ('2026-09-10', 'MXN', 12.00),
  ('2026-09-11', 'MXN', 12.10),
  ('2026-09-14', 'MXN', 12.30);

-- --------------------------------------------------------------------------
-- History windows, high and low, moves, the week, freshness
-- --------------------------------------------------------------------------
do $$
declare h jsonb; now_ timestamptz := '2026-09-14 16:00:00+00';
begin
  h := app.fx_history('99990000-0000-4000-8000-0000000000d1', 7, now_);
  assert h->>'currency' = 'HNL' and h->>'note' = 'tasa de referencia', h::text;
  assert h->'points' = '[{"date": "2026-09-08", "rate": 19.300000}, {"date": "2026-09-09", "rate": 19.600000},
                         {"date": "2026-09-10", "rate": 19.400000}, {"date": "2026-09-11", "rate": 19.400000},
                         {"date": "2026-09-14", "rate": 19.500000}]'::jsonb,
    format('7 days: only stored days, none filled in: %s', h->'points');
  assert h->'high' = '{"date": "2026-09-09", "rate": 19.600000}'::jsonb and h->'low' = '{"date": "2026-09-08", "rate": 19.300000}'::jsonb, h::text;
  assert (h->>'change_pct')::numeric = 1.04, format('change vs the first point: %s', h->>'change_pct');
  assert (h->>'days_up')::int = 2 and (h->>'days_down')::int = 1, format('moves: %s up, %s down', h->>'days_up', h->>'days_down');
  assert h->'latest' = '{"date": "2026-09-14", "rate": 19.500000, "stale": false}'::jsonb and (h->>'current')::boolean, h::text;
  assert (h->>'valid_until')::timestamptz = '2026-09-18 04:00:00+00', h->>'valid_until';
  assert not (h ? 'forecast') and not (h ? 'advice'), 'descriptive only';

  -- The last 7 real days, each against the stored day before it.
  assert (select jsonb_agg(e->>'date') from jsonb_array_elements(h->'week') e)
       = '["2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-14"]'::jsonb, h->>'week';
  assert (select jsonb_agg(e->>'dir') from jsonb_array_elements(h->'week') e)
       = '["up", "up", "up", "up", "down", "same", "up"]'::jsonb, h->>'week';

  h := app.fx_history('99990000-0000-4000-8000-0000000000d1', 30, now_);
  assert jsonb_array_length(h->'points') = 9 and h->'low' = '{"date": "2026-08-20", "rate": 18.000000}'::jsonb, h::text;
  assert (h->>'change_pct')::numeric = 8.33 and (h->>'days_up')::int = 6 and (h->>'days_down')::int = 1, h::text;

  h := app.fx_history('99990000-0000-4000-8000-0000000000d1', 90, now_);
  assert jsonb_array_length(h->'points') = 10 and h->'low' = '{"date": "2026-07-01", "rate": 17.000000}'::jsonb
     and h->'high' = '{"date": "2026-09-09", "rate": 19.600000}'::jsonb, 'the 25.00 of June is outside 90 days';
  assert (select count(*) from jsonb_array_elements(h->'points') e where e->>'date' = '2026-09-12') = 0, 'a missing day stays missing';

  -- 17 Sept: still current (14 >= 17 - 3). 18 Sept: stale, and history is still history.
  assert (app.fx_history('99990000-0000-4000-8000-0000000000d1', 7, '2026-09-17 16:00:00+00')->>'current')::boolean;
  h := app.fx_history('99990000-0000-4000-8000-0000000000d1', 7, '2026-09-18 16:00:00+00');
  assert not (h->>'current')::boolean and (h->'latest'->>'stale')::boolean and jsonb_array_length(h->'points') = 5, h::text;

  -- No rate stored: absent, never zero.
  h := app.fx_history('99990000-0000-4000-8000-0000000000d4', 30, now_);
  assert h->>'currency' = 'JMD' and h->'latest' = 'null'::jsonb and h->'points' = '[]'::jsonb
     and h->'change_pct' = 'null'::jsonb and not (h->>'current')::boolean and h->>'note' = 'reference rate', h::text;
  assert app.fx_history('99990000-0000-4000-8000-00000000dead', 7, now_) is null, 'unknown client';
  raise notice 'PASS fx_history: 7/30/90-day windows, high/low, moves, week dirs, missing days not filled, stale flagged';
end $$;

do $$
begin
  begin
    perform app.fx_history('99990000-0000-4000-8000-0000000000d1', 14);
    raise exception 'p_days 14 accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform app.fx_history('99990000-0000-4000-8000-0000000000d1', null);
    raise exception 'p_days null accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS fx_history: only 7, 30 or 90 days';
end $$;

-- --------------------------------------------------------------------------
-- Rate reminder: set, replace, clear, validation, reached
-- --------------------------------------------------------------------------
do $$
declare r jsonb; now_ timestamptz := '2026-09-14 16:00:00+00';
begin
  r := app.set_rate_reminder('99990000-0000-4000-8000-0000000000d1', 20);
  assert (r->>'target')::numeric = 20 and r->>'currency' = 'HNL', r::text;
  r := app.rate_reminder('99990000-0000-4000-8000-0000000000d1', now_);
  assert not (r->>'reached')::boolean and (r->>'latest_rate')::numeric = 19.5 and (r->>'current')::boolean, r::text;

  r := app.set_rate_reminder('99990000-0000-4000-8000-0000000000d1', 19.4);
  assert (select count(*) from rate_reminders where client_id = '99990000-0000-4000-8000-0000000000d1') = 2
     and (select count(*) from rate_reminders where client_id = '99990000-0000-4000-8000-0000000000d1'
            and cleared_at is null and triggered_at is null) = 1, 'the new reminder replaces the open one';
  r := app.rate_reminder('99990000-0000-4000-8000-0000000000d1', now_);
  assert (r->>'target')::numeric = 19.4 and (r->>'reached')::boolean, r::text;
  assert app.rate_reminder('99990000-0000-4000-8000-0000000000d1', '2026-09-20 16:00:00+00')->'reached' = 'null'::jsonb,
    'a stale rate cannot say whether the number was reached';

  begin
    insert into rate_reminders (client_id, currency, target) values ('99990000-0000-4000-8000-0000000000d1', 'HNL', 19);
    raise exception 'a second open reminder was stored';
  exception when unique_violation then null;
  end;

  -- 25% either side of 19.50 is 14.625 .. 24.375.
  perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 24.3);
  perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 14.7);
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 25);  raise exception '25 accepted';
  exception when check_violation then null; end;
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 14);  raise exception '14 accepted';
  exception when check_violation then null; end;
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 0);   raise exception '0 accepted';
  exception when check_violation then null; end;
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', -1);  raise exception '-1 accepted';
  exception when check_violation then null; end;
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d4', 100); raise exception 'no rate, accepted';
  exception when no_data_found then null; end;
  begin perform app.set_rate_reminder('99990000-0000-4000-8000-00000000dead', 19); raise exception 'unknown client accepted';
  exception when insufficient_privilege then null; end;
  assert (app.rate_reminder('99990000-0000-4000-8000-0000000000d3', now_)->>'target')::numeric = 14.7, 'a refused target leaves the open one';

  perform app.clear_rate_reminder('99990000-0000-4000-8000-0000000000d3');
  assert app.rate_reminder('99990000-0000-4000-8000-0000000000d3', now_) is null, 'cleared';
  perform app.clear_rate_reminder('99990000-0000-4000-8000-0000000000d3');   -- nothing open: no error
  raise notice 'PASS rate reminder: set, replace, clear, one open, 25%% and zero refused, reached only on a current rate';
end $$;

-- --------------------------------------------------------------------------
-- The engagement planner: match day > rate reminder > 30-day high > lottery
-- --------------------------------------------------------------------------
do $$
declare n record; now_ timestamptz := '2026-09-14 16:00:00+00';
begin
  perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d2', 12.2);   -- M: reached, and MXN at a 30-day high
  perform app.set_rate_reminder('99990000-0000-4000-8000-0000000000d3', 19.4);   -- T: reached, but his team plays today
  -- H (19.4, reached) also has a red alert today: the alert queue is separate.
  insert into notifications (client_id, local_date, channel, trigger, title, body, cap_identifier, scheduled_for)
  values ('99990000-0000-4000-8000-0000000000d1', '2026-09-14', 'alert', 'weather_alert', 'Aviso rojo', 'Cortés', 'MONEY-CAP-1', now_);

  perform app.plan_engagement(now_);

  select trigger::text, title, body into n from notifications
   where client_id = '99990000-0000-4000-8000-0000000000d1' and channel = 'engagement';
  assert n.trigger = 'rate_reminder' and n.title = 'Tasa de referencia'
     and n.body = 'La tasa de referencia llegó a 19.50 HNL por 1 CAD.', format('%s', row_to_json(n));
  assert (select status from notifications where cap_identifier = 'MONEY-CAP-1') = 'queued', 'the alert is untouched';

  select trigger::text into n from notifications where client_id = '99990000-0000-4000-8000-0000000000d2' and channel = 'engagement';
  assert n.trigger = 'rate_reminder', format('the reminder outranks the 30-day high: %s', n.trigger);
  select trigger::text into n from notifications where client_id = '99990000-0000-4000-8000-0000000000d3' and channel = 'engagement';
  assert n.trigger = 'match_day', format('match day outranks the reminder: %s', n.trigger);
  assert (select notification_id from rate_reminders where client_id = '99990000-0000-4000-8000-0000000000d3' and cleared_at is null) is null,
    'a reminder that lost to match day is not consumed';
  assert app.trigger_priority('match_day') < app.trigger_priority('rate_reminder')
     and app.trigger_priority('rate_reminder') < app.trigger_priority('fx_30d_high');

  -- One per client per local day.
  perform app.plan_engagement('2026-09-14 16:20:00+00');
  assert (select count(*) from notifications where client_id in ('99990000-0000-4000-8000-0000000000d1',
            '99990000-0000-4000-8000-0000000000d2', '99990000-0000-4000-8000-0000000000d3')
            and channel = 'engagement' and local_date = '2026-09-14') = 3, 'still one each';

  -- Queued is not triggered; sent is.
  assert (select triggered_at from rate_reminders where client_id = '99990000-0000-4000-8000-0000000000d1' and cleared_at is null) is null;
  perform app.finish_notification(id, 'sent', 1, null) from notifications
   where client_id in ('99990000-0000-4000-8000-0000000000d1', '99990000-0000-4000-8000-0000000000d2',
                       '99990000-0000-4000-8000-0000000000d3') and channel = 'engagement';
  assert (select count(*) from rate_reminders where client_id in ('99990000-0000-4000-8000-0000000000d1', '99990000-0000-4000-8000-0000000000d2')
            and triggered_at is not null) = 2, 'sent reminders are triggered';
  assert app.rate_reminder('99990000-0000-4000-8000-0000000000d1', now_) is null, 'a triggered reminder is no longer open';
  assert (select triggered_at from rate_reminders where client_id = '99990000-0000-4000-8000-0000000000d3' and cleared_at is null) is null,
    'a sent match-day message does not trigger the reminder';

  -- Next day: it fired once. M falls back to the 30-day high; T's reminder now goes out.
  perform app.plan_engagement('2026-09-15 16:00:00+00');
  assert not exists (select 1 from notifications where client_id = '99990000-0000-4000-8000-0000000000d1'
                       and local_date = '2026-09-15' and trigger::text = 'rate_reminder'), 'fires once';
  assert (select trigger::text from notifications where client_id = '99990000-0000-4000-8000-0000000000d2' and local_date = '2026-09-15') = 'fx_30d_high';
  select id, trigger::text into n from notifications where client_id = '99990000-0000-4000-8000-0000000000d3' and local_date = '2026-09-15';
  assert n.trigger = 'rate_reminder', format('T on the 15th: %s', n.trigger);

  -- Not delivered (suppressed): still open, and eligible again the next day.
  perform app.finish_notification(n.id, 'suppressed', 0, 'no working push subscription');
  perform app.plan_engagement('2026-09-16 16:00:00+00');
  select id, trigger::text, status into n from notifications where client_id = '99990000-0000-4000-8000-0000000000d3' and local_date = '2026-09-16';
  assert n.trigger = 'rate_reminder' and n.status = 'queued', format('%s', row_to_json(n));

  -- Clearing withdraws a queued reminder notification.
  perform app.clear_rate_reminder('99990000-0000-4000-8000-0000000000d3');
  assert (select status from notifications where id = n.id) = 'suppressed', 'a cleared reminder never arrives';
  raise notice 'PASS engagement: match day > rate reminder > 30-day high, one per day, fires once, alerts untouched';
end $$;

-- --------------------------------------------------------------------------
-- Holidays here and there
-- --------------------------------------------------------------------------
delete from holidays where country in ('HN', 'JM');
insert into holidays (country, holiday_date, name, verified_at, source_url) values
  ('HN', '2026-09-15', '15 de septiembre', '2026-09-13', 'https://example.invalid/hn'),
  ('HN', '2026-10-07', 'Semana Morazánica', '2026-09-13', 'https://example.invalid/hn'),
  ('HN', '2026-12-25', 'Navidad', '2026-09-13', 'https://example.invalid/hn'),
  ('HN', '2026-09-01', 'Pasado', '2026-09-13', 'https://example.invalid/hn');
insert into provincial_holidays (province, holiday_date, name, name_es, is_public_holiday, verified_at, source_url) values
  ('ON', '2026-09-07', 'Labour Day', 'Día del Trabajo', true, '2026-09-14', 'https://example.invalid/on'),
  ('ON', '2026-10-12', 'Thanksgiving Day', 'Día de Acción de Gracias', true, '2026-09-14', 'https://example.invalid/on'),
  ('ON', '2026-11-11', 'Not A Public Holiday', 'No feriado', false, '2026-09-14', 'https://example.invalid/on'),
  ('ON', '2026-12-25', 'Christmas Day', 'Navidad', true, '2026-09-14', 'https://example.invalid/on');

do $$
declare h jsonb; now_ timestamptz := '2026-09-14 16:00:00+00';
begin
  h := app.holidays_here_and_there('99990000-0000-4000-8000-0000000000d1', now_);
  assert (select jsonb_agg(jsonb_build_array(e->>'date', e->>'where', e->>'name', (e->>'days_left')::int)) from jsonb_array_elements(h) e)
       = '[["2026-09-15", "HN", "15 de septiembre", 1], ["2026-10-07", "HN", "Semana Morazánica", 23],
           ["2026-10-12", "ON", "Día de Acción de Gracias", 28], ["2026-12-25", "ON", "Navidad", 102],
           ["2026-12-25", "HN", "Navidad", 102]]'::jsonb, h::text;
  assert (select bool_and(e ? 'verified_at' and e->>'verified_at' is not null) from jsonb_array_elements(h) e), 'verified_at on every one';

  assert jsonb_array_length(app.holidays_here_and_there('99990000-0000-4000-8000-0000000000d1', now_, 2)) = 2;
  assert app.holidays_here_and_there('99990000-0000-4000-8000-0000000000d1', '2026-09-15 16:00:00+00')->0->>'days_left' = '0',
    'shown on the day itself';
  -- English for Jamaica; no JM holidays stored, so Ontario's only.
  h := app.holidays_here_and_there('99990000-0000-4000-8000-0000000000d4', now_);
  assert h->0->>'name' = 'Thanksgiving Day' and jsonb_array_length(h) = 2, h::text;
  begin
    perform app.holidays_here_and_there('99990000-0000-4000-8000-0000000000d1', now_, 0);
    raise exception 'p_limit 0 accepted';
  exception when invalid_parameter_value then null;
  end;
  assert app.holidays_here_and_there('99990000-0000-4000-8000-00000000dead') is null;
  raise notice 'PASS holidays here and there: Ontario and home merged by date, public holidays only, verified_at on each';
end $$;

rollback;
