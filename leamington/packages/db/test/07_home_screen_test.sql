-- The home screen message: each line appears only with current data, carries
-- its own expiry, and records why it is absent. Plus login throttling and the
-- open instrumentation.
--
-- The clock is pinned: p_now = 2026-09-13 14:00 UTC, which is 10:00 in Toronto
-- (the clients' timezone) and 08:00 in Guatemala.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('77777777-7777-7777-7777-777777777777', 'Home Screen Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, timezone) values
  ('GT', 'Home Region', 'Home Town GT', 14.63, -90.51, 'America/Guatemala'),
  ('JM', 'Home Parish', 'Home Town JM', 18.01, -76.80, 'America/Jamaica')
on conflict do nothing;
insert into leagues (country, name, source, source_league_id) values ('GT', 'Home Test League', 'test', 'home-league')
on conflict do nothing;
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'GT', t.name, 'test', t.sid
  from leagues l, (values ('Home FC', 'home-1'), ('Away FC', 'home-2')) t(name, sid)
 where l.name = 'Home Test League'
on conflict do nothing;

insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality,
                     team_id, segment, departure_date, next_trip_date, timezone, active)
select v.id::uuid, '77777777-7777-7777-7777-777777777777', v.code, v.full_name, v.country::country_code,
       v.lang::ui_language, m.id, m.name, t.id, v.segment::client_segment, v.departure::date, v.next_trip::date,
       'America/Toronto', v.active
  from (values
    ('aaaa7777-0000-4000-8000-000000000001', 'HQMETZT4', 'Ana María López', 'GT', 'es', 'Home Town GT', 'Home FC', 'seasonal', '2026-11-20', null, true),
    ('aaaa7777-0000-4000-8000-000000000002', 'HQMETZT2', 'Ricky Brown',     'JM', 'en', 'Home Town JM', null,      'settled',  null,         '2026-12-24', true),
    ('aaaa7777-0000-4000-8000-000000000003', 'HQMETZT3', 'Inactive Person', 'GT', 'es', 'Home Town GT', null,      'seasonal', '2026-11-20', null, false)
  ) v(id, code, full_name, country, lang, town, team, segment, departure, next_trip, active)
  join municipalities m on m.name = v.town
  left join teams t on t.name = v.team
on conflict do nothing;

-- Home FC plays at 23:00 UTC, which is 7pm in Toronto.
insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id, '2026-09-13 23:00:00+00', 'scheduled', 'test', 'home-fixture-1', '2026-09-13 13:00:00+00'
  from leagues l join teams h on h.name = 'Home FC' join teams a on a.name = 'Away FC'
 where l.name = 'Home Test League';

-- Three providers for Home Town GT today: 28/29/30, two of three expect rain.
insert into forecasts (municipality_id, provider, target_date, temp_max_c, precip_prob, fetched_at)
select m.id, p.provider::forecast_provider, '2026-09-13', p.t, p.rain, '2026-09-13 12:00:00+00'
  from municipalities m, (values ('open-meteo', 28, 60), ('openweather', 29, 55), ('weatherapi', 30, 10)) p(provider, t, rain)
 where m.name = 'Home Town GT';

-- GTQ: 5.80 on Aug 30, lower every day after, then 5.62 on Sep 11. Highest in 12 days.
insert into fx_rates (rate_date, quote, rate) values ('2026-08-20', 'GTQ', 5.30), ('2026-08-30', 'GTQ', 5.80);
insert into fx_rates (rate_date, quote, rate)
select d::date, 'GTQ', 5.40 + (row_number() over (order by d) - 1) * 0.02
  from generate_series('2026-08-31'::date, '2026-09-10'::date, interval '1 day') d;
insert into fx_rates (rate_date, quote, rate) values ('2026-09-11', 'GTQ', 5.62), ('2026-09-12', 'JMD', 115.20);

create or replace function pg_temp.msg(p_client text, p_now text default '2026-09-13 14:00:00+00')
returns jsonb language sql as $$ select app.home_message(p_client::uuid, p_now::timestamptz) $$;
create or replace function pg_temp.line(m jsonb, k text)
returns jsonb language sql as $$ select l from jsonb_array_elements(m->'lines') l where l->>'key' = k $$;

-- --------------------------------------------------------------------------
-- The full morning message
-- --------------------------------------------------------------------------
do $$
declare m jsonb := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
begin
  assert (select array_agg(l->>'key') from jsonb_array_elements(m->'lines') l)
         = array['greeting', 'fixture', 'weather', 'rate', 'countdown'], format('keys: %s', m->'lines');
  assert m->'absent' = '{}'::jsonb, format('nothing should be absent: %s', m->'absent');
  assert pg_temp.line(m, 'greeting')->>'text'  = 'Buenos días, Ana', pg_temp.line(m, 'greeting')->>'text';
  assert pg_temp.line(m, 'fixture')->>'text'   = 'Home FC juega hoy 7pm', pg_temp.line(m, 'fixture')->>'text';
  assert pg_temp.line(m, 'weather')->>'text'   = 'Home Town GT: 29°, lluvia', pg_temp.line(m, 'weather')->>'text';
  assert pg_temp.line(m, 'rate')->>'text'      = '1 CAD = 5.62 GTQ ↑ (más alto en 12 días)', pg_temp.line(m, 'rate')->>'text';
  assert pg_temp.line(m, 'rate')->>'note'      = 'tasa de referencia';
  assert pg_temp.line(m, 'countdown')->>'text' = 'Faltan 68 días', pg_temp.line(m, 'countdown')->>'text';
  raise notice 'PASS home: the full morning message';
end $$;

-- --------------------------------------------------------------------------
-- Every line carries its own expiry
-- --------------------------------------------------------------------------
do $$
declare m jsonb := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
begin
  assert (pg_temp.line(m, 'greeting')->>'valid_until')::timestamptz = '2026-09-13 16:00:00+00', 'greeting changes at noon Toronto';
  assert (pg_temp.line(m, 'fixture')->>'valid_until')::timestamptz  = '2026-09-14 04:00:00+00', 'fixture expires at midnight Toronto';
  assert (pg_temp.line(m, 'weather')->>'valid_until')::timestamptz  = '2026-09-14 06:00:00+00', 'forecast expires at midnight in the home town';
  assert (pg_temp.line(m, 'rate')->>'valid_until')::timestamptz     = '2026-09-15 04:00:00+00', 'rate expires 4 days after its date';
  raise notice 'PASS home: every line carries its own expiry';
end $$;

-- --------------------------------------------------------------------------
-- Fixture: absent with the right reason
-- --------------------------------------------------------------------------
do $$
declare m jsonb;
begin
  update fixtures set status = 'finished' where source_fixture_id = 'home-fixture-1';
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
  assert pg_temp.line(m, 'fixture') is null, 'a finished match is not "juega hoy"';
  assert m->'absent'->>'fixture' = 'fixture_feed_stale', format('no feed run on record: %s', m->'absent');

  insert into source_runs (feed, started_at, finished_at, status) values
    ('fixtures', '2026-09-13 13:05:00+00', '2026-09-13 13:05:02+00', 'ok');
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
  assert m->'absent'->>'fixture' = 'no_fixture_today', format('feed current: %s', m->'absent');

  update fixtures set status = 'scheduled', fetched_at = '2026-09-13 07:00:00+00' where source_fixture_id = 'home-fixture-1';
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
  assert pg_temp.line(m, 'fixture') is null and m->'absent'->>'fixture' = 'fixture_data_stale',
    format('a fixture last confirmed 7h ago is not trusted: %s', m->'absent');

  update fixtures set fetched_at = '2026-09-13 13:00:00+00' where source_fixture_id = 'home-fixture-1';
  delete from source_runs where feed = 'fixtures' and started_at = '2026-09-13 13:05:00+00';
  raise notice 'PASS home: fixture absent when finished, quiet or stale, with the reason';
end $$;

-- --------------------------------------------------------------------------
-- Weather: a range when providers disagree; absent when stale or single-source
-- --------------------------------------------------------------------------
do $$
declare m jsonb;
begin
  update forecasts set temp_max_c = 26 where provider = 'open-meteo' and target_date = '2026-09-13'
     and municipality_id = (select id from municipalities where name = 'Home Town GT');
  update forecasts set temp_max_c = 31 where provider = 'weatherapi' and target_date = '2026-09-13'
     and municipality_id = (select id from municipalities where name = 'Home Town GT');
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
  assert pg_temp.line(m, 'weather')->>'text' = 'Home Town GT: 26–31°, lluvia', pg_temp.line(m, 'weather')->>'text';

  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001', '2026-09-14 02:30:00+00');
  assert m->'absent'->>'weather' = 'forecast_stale', format('13.5h old: %s', m->'absent');

  delete from forecasts where provider in ('openweather', 'weatherapi') and target_date = '2026-09-13'
     and municipality_id = (select id from municipalities where name = 'Home Town GT');
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001');
  assert pg_temp.line(m, 'weather') is null and m->'absent'->>'weather' = 'single_source', format('%s', m->'absent');
  raise notice 'PASS home: weather shows a range on disagreement, and is absent when stale or single-source';
end $$;

-- --------------------------------------------------------------------------
-- Rate: absent when stale
-- --------------------------------------------------------------------------
do $$
declare m jsonb := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001', '2026-09-16 14:00:00+00');
begin
  assert pg_temp.line(m, 'rate') is null and m->'absent'->>'rate' = 'rate_stale', format('5 days old: %s', m->'absent');
  raise notice 'PASS home: a rate 5 days old is absent';
end $$;

-- --------------------------------------------------------------------------
-- Countdown: singular, the day itself, and a passed date
-- --------------------------------------------------------------------------
do $$
declare m jsonb;
begin
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001', '2026-11-19 14:00:00+00');
  assert pg_temp.line(m, 'countdown')->>'text' = 'Falta 1 día', pg_temp.line(m, 'countdown')->>'text';
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001', '2026-11-20 14:00:00+00');
  assert pg_temp.line(m, 'countdown')->>'text' = 'Es hoy', pg_temp.line(m, 'countdown')->>'text';
  m := pg_temp.msg('aaaa7777-0000-4000-8000-000000000001', '2026-11-21 14:00:00+00');
  assert pg_temp.line(m, 'countdown') is null and m->'absent'->>'countdown' = 'date_passed', format('%s', m->'absent');
  raise notice 'PASS home: countdown singular, on the day, and absent once passed';
end $$;

-- --------------------------------------------------------------------------
-- English for a Jamaican user; missing data is absent with reasons
-- --------------------------------------------------------------------------
do $$
declare m jsonb := pg_temp.msg('aaaa7777-0000-4000-8000-000000000002');
begin
  assert (select array_agg(l->>'key') from jsonb_array_elements(m->'lines') l)
         = array['greeting', 'rate', 'countdown'], format('keys: %s', m->'lines');
  assert pg_temp.line(m, 'greeting')->>'text'  = 'Good morning, Ricky';
  assert pg_temp.line(m, 'rate')->>'text'      = '1 CAD = 115.20 JMD', pg_temp.line(m, 'rate')->>'text';
  assert pg_temp.line(m, 'rate')->>'note'      = 'reference rate';
  assert pg_temp.line(m, 'countdown')->>'text' = '102 days to go', pg_temp.line(m, 'countdown')->>'text';
  assert m->'absent' = '{"fixture": "no_team", "weather": "no_forecast"}'::jsonb, format('%s', m->'absent');
  raise notice 'PASS home: English for a Jamaican user, absent lines recorded with reasons';
end $$;

do $$
begin
  assert pg_temp.msg('aaaa7777-0000-4000-8000-000000000003') is null, 'an inactive client gets no home screen';
  raise notice 'PASS home: an inactive client gets nothing';
end $$;

-- --------------------------------------------------------------------------
-- Instrumentation: renders and opens
-- --------------------------------------------------------------------------
do $$
declare m jsonb; r uuid; n int; shown text[];
begin
  m := app.render_home('aaaa7777-0000-4000-8000-000000000001');
  r := (m->>'render_id')::uuid;
  assert r is not null, 'render_home returns the render id';
  assert (select served from home_renders where render_id = r)
         = (select array_agg(l->>'key') from jsonb_array_elements(m->'lines') l),
    'the render records exactly the lines served';
  assert (select last_seen_at is not null from clients where id = 'aaaa7777-0000-4000-8000-000000000001');

  n := app.record_home_opens('aaaa7777-0000-4000-8000-000000000001',
         jsonb_build_array(jsonb_build_object('render_id', r, 'opened_at', now(), 'from_cache', false,
                                              'shown', jsonb_build_array('greeting', 'rate', 'bogus'))));
  assert n = 1, format('own open recorded, got %s', n);
  select o.shown into shown from home_opens o where o.render_id = r;
  assert shown = array['greeting', 'rate'], format('unknown line names are dropped: %s', shown);

  n := app.record_home_opens('aaaa7777-0000-4000-8000-000000000001',
         (select jsonb_agg(jsonb_build_object('render_id', render_id, 'opened_at', opened_at, 'from_cache', false, 'shown', '[]'::jsonb))
            from home_opens where render_id = r));
  assert n = 0, 'a re-sent open is not a second open';

  n := app.record_home_opens('aaaa7777-0000-4000-8000-000000000002',
         jsonb_build_array(jsonb_build_object('render_id', r, 'opened_at', now(), 'from_cache', true, 'shown', '[]'::jsonb)));
  assert n = 0, 'another client cannot record opens against this render';
  raise notice 'PASS home: renders and opens are recorded, scoped to the client, without duplicates';
end $$;

-- --------------------------------------------------------------------------
-- Login: the code is the account, and guessing is throttled
-- --------------------------------------------------------------------------
do $$
declare res jsonb; i int;
begin
  res := app.login_with_code('HQMETZT4', 'source-a');
  assert res->>'status' = 'ok' and res->>'client_id' = 'aaaa7777-0000-4000-8000-000000000001', res::text;
  assert app.login_with_code('ZZZZZZZZ', 'source-a')->>'status' = 'invalid';
  assert app.login_with_code('HQMETZT3', 'source-a')->>'status' = 'inactive';

  for i in 1..10 loop perform app.login_with_code('QQQQQQQQ', 'source-b'); end loop;
  assert app.login_with_code('HQMETZT4', 'source-b')->>'status' = 'throttled',
    'after 10 failures in 15 minutes, even a valid code waits';
  assert app.login_with_code('HQMETZT4', 'source-c')->>'status' = 'ok', 'another source is unaffected';
  raise notice 'PASS home: login by code, inactive and invalid codes, throttled guessing';
end $$;
