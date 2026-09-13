-- Hoy's sections return only what is current enough to show: fútbol without
-- live scores or stale fixtures, weather with forecast rules and honest alert
-- states, the reference rate, and recent official lottery results.
--
-- The clock is pinned: p_now = 2026-09-13 14:00 UTC.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000013', 'Sections Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, population, timezone) values
  ('JM', 'Section Parish', 'Section Home',  18.20, -77.30, 100, 'America/Jamaica'),
  ('JM', 'Section Parish', 'Section Watch', 18.00, -76.50, 100, 'America/Jamaica')
on conflict do nothing;
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'JM', t.name, 'test', t.sid
  from leagues l, (values ('Section FC', 'sec-1'), ('Visitor FC', 'sec-2'), ('Third FC', 'sec-3'), ('Fourth FC', 'sec-4')) t(name, sid)
 where l.name = 'Jamaica Premier League'
on conflict do nothing;

insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, team_id, timezone)
select v.id::uuid, '99990000-0000-4000-8000-000000000013', v.code, v.name, v.country::country_code, v.lang::ui_language,
       m.id, m.name, t.id, 'America/Toronto'
  from (values
    ('99990000-0000-4000-8000-0000000000b1', 'ZECTJM23', 'Section Person', 'JM', 'en', 'Section Home', 'Section FC'),
    ('99990000-0000-4000-8000-0000000000b2', 'ZECTGT23', 'Persona Sección', 'GT', 'es', null, null),
    ('99990000-0000-4000-8000-0000000000b3', 'ZECTMX23', 'Persona México', 'MX', 'es', null, null)
  ) v(id, code, name, country, lang, town, team)
  left join municipalities m on m.name = v.town
  left join teams t on t.name = v.team
on conflict do nothing;
insert into client_watch_locations (client_id, municipality_id)
select '99990000-0000-4000-8000-0000000000b1', id from municipalities where name = 'Section Watch'
on conflict do nothing;

create or replace function pg_temp.team(p_name text) returns bigint language sql as $$ select id from teams where name = p_name $$;

-- Fixtures: the feed ran 30 minutes before p_now.
insert into source_runs (feed, started_at, finished_at, status, source_result)
values ('fixtures', '2026-09-13 13:30:00+00', '2026-09-13 13:30:02+00', 'ok', 'items');
insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id, fetched_at)
select l.id, pg_temp.team(v.home), pg_temp.team(v.away), v.kick::timestamptz, v.status::fixture_status, v.hs, v.aws,
       'test', v.sid, v.fetched::timestamptz
  from leagues l, (values
    ('Section FC', 'Visitor FC', '2026-09-13 23:00:00+00', 'scheduled', null::int, null::int, 'sec-today',    '2026-09-13 13:00:00+00'),
    ('Third FC',   'Section FC', '2026-09-13 13:00:00+00', 'live',      1,         0,         'sec-live',     '2026-09-13 13:30:00+00'),
    ('Section FC', 'Fourth FC',  '2026-09-12 20:00:00+00', 'finished',  2,         1,         'sec-result',   '2026-09-12 23:05:00+00'),
    ('Visitor FC', 'Section FC', '2026-09-15 20:00:00+00', 'scheduled', null,      null,      'sec-stale',    '2026-09-13 05:00:00+00'),
    ('Third FC',   'Fourth FC',  '2026-09-13 12:00:00+00', 'finished',  0,         0,         'sec-league',   '2026-09-13 13:30:00+00')
  ) v(home, away, kick, status, hs, aws, sid, fetched)
 where l.name = 'Jamaica Premier League';

-- --------------------------------------------------------------------------
-- Fútbol
-- --------------------------------------------------------------------------
do $$
declare p jsonb := app.football_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 14:00:00+00'); u jsonb;
begin
  assert p->>'team' = 'Section FC' and (p->>'fixtures_current')::boolean, format('%s', p);
  assert jsonb_array_length(p->'upcoming') = 2, format('today''s scheduled and live match, not the stale one: %s', p->'upcoming');
  for u in select * from jsonb_array_elements(p->'upcoming') loop
    assert not (u ? 'home_score'), format('no score is ever shown for an upcoming or live match: %s', u);
  end loop;
  assert (p->'results'->0->>'home_score')::int = 2 and p->'results'->0->>'away' = 'Fourth FC', format('%s', p->'results');
  assert exists (select 1 from jsonb_array_elements(p->'league_today') x where x->>'home' = 'Third FC' and x->>'home_score' = '0'),
    'a finished league match today shows its score';
  assert exists (select 1 from jsonb_array_elements(p->'league_today') x where x->>'status' = 'live' and x->>'home_score' is null),
    'a live league match shows no score';
  assert p->'table'->>'state' = 'unavailable' and p->'table'->'rows' = 'null'::jsonb, format('%s', p->'table');

  p := app.football_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 20:00:00+00');
  assert not (p->>'fixtures_current')::boolean and p->'upcoming' = 'null'::jsonb and p->'league_today' = 'null'::jsonb,
    format('a quiet fixtures feed hides the schedule: %s', p);
  assert jsonb_array_length(p->'results') = 1, 'results are final and stay';

  assert app.football_page('99990000-0000-4000-8000-0000000000b2', '2026-09-13 14:00:00+00')->'team' = 'null'::jsonb;
  raise notice 'PASS sections: fútbol shows no live scores, hides stale schedules, keeps results';
end $$;

-- --------------------------------------------------------------------------
-- Clima: forecasts, and alert states
-- --------------------------------------------------------------------------
insert into forecasts (municipality_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, fetched_at)
select m.id, f.provider::forecast_provider, f.d::date, f.t, f.lo, f.rain, f.fetched::timestamptz
  from municipalities m, (values
    ('Section Home',  'open-meteo',  '2026-09-13', 30, 24, 70, '2026-09-13 12:00:00+00'),
    ('Section Home',  'openweather', '2026-09-13', 31, 24, 60, '2026-09-13 12:00:00+00'),
    ('Section Home',  'weatherapi',  '2026-09-13', 31, 25, 10, '2026-09-13 12:00:00+00'),
    ('Section Home',  'open-meteo',  '2026-09-14', 29, 23, 10, '2026-09-13 12:00:00+00'),
    ('Section Home',  'open-meteo',  '2026-09-15', 29, 23, 10, '2026-09-12 00:00:00+00'),
    ('Section Home',  'weatherapi',  '2026-09-15', 29, 23, 10, '2026-09-12 00:00:00+00'),
    ('Section Watch', 'open-meteo',  '2026-09-13', 26, 20, 10, '2026-09-13 12:00:00+00'),
    ('Section Watch', 'weatherapi',  '2026-09-13', 31, 22, 10, '2026-09-13 12:00:00+00')
  ) f(town, provider, d, t, lo, rain, fetched)
 where m.name = f.town;

insert into source_runs (feed, started_at, finished_at, status, source_result)
values ('alerts:JM', '2026-09-13 13:45:00+00', '2026-09-13 13:45:01+00', 'ok', 'items');

insert into weather_alerts (source_id, country, cap_identifier, cap_sent, msg_type, event, headline, area_desc, level,
                            issued_at, expires_at, area_geog, source_url, cancelled_at)
select s.id, 'JM', v.ident, now(), 'Alert', v.event, v.headline, v.area, v.lvl::alert_level,
       v.issued::timestamptz, now() + interval '2 days',
       extensions.ST_Multi(extensions.ST_GeomFromText(v.poly, 4326))::extensions.geography,
       'https://example.invalid/' || v.ident, v.cancelled::timestamptz
  from alert_sources s, (values
    ('SEC-HERE',  'Flash Flood Warning', 'Flash flood warning for Section Parish', 'Section Parish', 'orange',
     '2026-09-13 12:00:00+00', 'POLYGON((-77.40 18.30, -77.20 18.30, -77.20 18.10, -77.40 18.10, -77.40 18.30))', null),
    ('SEC-AWAY',  'Small Craft Warning', 'Small craft warning offshore', 'Offshore waters', 'yellow',
     '2026-09-13 11:00:00+00', 'POLYGON((-79.00 17.00, -78.80 17.00, -78.80 16.80, -79.00 16.80, -79.00 17.00))', null),
    ('SEC-OLD',   'Tropical Storm Watch', 'Tropical storm watch', 'All parishes', 'red',
     '2026-09-10 11:00:00+00', 'POLYGON((-77.40 18.30, -77.20 18.30, -77.20 18.10, -77.40 18.10, -77.40 18.30))', '2026-09-11 11:00:00+00')
  ) v(ident, event, headline, area, lvl, issued, poly, cancelled)
 where s.country = 'JM' and s.active and s.kind = 'cap';

do $$
declare p jsonb := app.weather_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 14:00:00+00'); home jsonb; watch jsonb;
begin
  select t into home from jsonb_array_elements(p->'towns') t where (t->>'is_home')::boolean;
  select t into watch from jsonb_array_elements(p->'towns') t where not (t->>'is_home')::boolean;
  assert home->>'name' = 'Section Home' and jsonb_array_length(home->'days') = 1, format('only today qualifies: %s', home);
  assert home->'days'->0->>'text' = '31°, lluvia' or home->'days'->0->>'text' = '31°, rain', format('%s', home->'days');
  assert watch->'days'->0->>'temp' = '26–31°', format('a range when providers disagree: %s', watch);

  assert p->>'alerts_state' = 'current' and p->>'agency' is not null and p->>'agency_url' = 'https://metservice.gov.jm/', format('%s', p);
  assert exists (select 1 from jsonb_array_elements(p->'alerts_here') a where a->>'event' = 'Flash Flood Warning'
                   and a->>'headline' = 'Flash flood warning for Section Parish' and a->>'area_desc' = 'Section Parish'),
    'an alert covering their town is shown verbatim, first';
  assert not exists (select 1 from jsonb_array_elements(p->'alerts_here') a where a->>'event' = 'Small Craft Warning');
  assert exists (select 1 from jsonb_array_elements(p->'alerts_elsewhere') a where a->>'event' = 'Small Craft Warning'),
    'an active alert elsewhere in the country is still shown';
  assert exists (select 1 from jsonb_array_elements(p->'history') a where a->>'event' = 'Tropical Storm Watch' and a->>'cancelled_at' is not null),
    'a cancelled alert is history, not active';

  p := app.weather_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 15:00:00+00');
  assert p->>'alerts_state' = 'stale' and p->'alerts_here' = 'null'::jsonb and p->'alerts_elsewhere' = 'null'::jsonb,
    format('a stale check shows no alert list, and says so: %s', p->>'alerts_state');

  p := app.weather_page('99990000-0000-4000-8000-0000000000b2', '2026-09-13 14:00:00+00');
  -- Guatemala: 01_rules_test makes Honduras monitored in this database.
  assert p->>'alerts_state' = 'not_monitored' and p->>'agency' = 'INSIVUMEH / CONRED' and p->>'agency_url' = 'https://insivumeh.gob.gt/',
    format('a country we do not monitor names its agency: %s', p);
  assert not (p->>'has_home')::boolean and jsonb_array_length(p->'towns') = 0;
  raise notice 'PASS sections: clima follows the forecast rules and never shows a stale alert list as current';
end $$;

-- --------------------------------------------------------------------------
-- Rate and lottery
-- --------------------------------------------------------------------------
insert into fx_rates (rate_date, quote, rate) values
  ('2026-09-10', 'MXN', 13.80), ('2026-09-11', 'MXN', 13.95), ('2026-09-12', 'MXN', 13.90)
on conflict (rate_date, quote) do nothing;

insert into lottery_games (country, operator, name, draw_times_local, timezone, results_url, parser_implemented, active) values
  ('MX', 'Operador Prueba', 'Juego Prueba',    '{21:00}', 'America/Mexico_City', 'https://example.invalid/', true,  true),
  ('MX', 'Operador Prueba', 'Juego Sin Parser', '{21:00}', 'America/Mexico_City', 'https://example.invalid/', false, true)
on conflict do nothing;
insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url)
select g.id, v.d::date, '21:00', v.nums, 'https://example.invalid/'
  from lottery_games g, (values ('Juego Prueba', '2026-09-12', array['01','02','03']),
                                ('Juego Prueba', '2026-09-05', array['09','08','07']),
                                ('Juego Sin Parser', '2026-09-12', array['04','05','06'])) v(game, d, nums)
 where g.name = v.game;

do $$
declare p jsonb;
begin
  p := app.rate_page('99990000-0000-4000-8000-0000000000b3', '2026-09-13 14:00:00+00');
  assert (p->>'current')::boolean and p->>'currency' = 'MXN' and (p->'latest'->>'rate')::numeric = 13.90
     and (p->>'high_30d')::numeric = 13.95 and (p->>'low_30d')::numeric = 13.80 and p->>'note' = 'tasa de referencia', format('%s', p);
  p := app.rate_page('99990000-0000-4000-8000-0000000000b3', '2026-09-17 14:00:00+00');
  assert not (p->>'current')::boolean and not (p ? 'days'), format('a rate 5 days old is not shown: %s', p);

  p := app.lottery_page('99990000-0000-4000-8000-0000000000b3', '2026-09-13 14:00:00+00');
  assert exists (select 1 from jsonb_array_elements(p->'games') g where g->>'game' = 'Juego Prueba'
                   and jsonb_array_length(g->'draws') = 1 and g->'draws'->0->>'draw_date' = '2026-09-12'),
    format('only recent draws: %s', p);
  assert not exists (select 1 from jsonb_array_elements(p->'games') g where g->>'game' = 'Juego Sin Parser'),
    'a game without a confirmed parser is not shown';
  raise notice 'PASS sections: the rate is shown only while current; lottery shows recent official draws only';
end $$;
