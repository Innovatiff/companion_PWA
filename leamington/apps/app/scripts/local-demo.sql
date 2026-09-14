-- LOCAL ONLY. A demo client whose home screen shows every line, for running
-- apps/app against a throwaway database built by
-- packages/db/test/run-migrations.sh plus the seeds.
--
-- Never run this against Supabase: it invents a fixture, forecasts and rates.
-- Dates are relative to now(), so "today" is always today.
--
--   psql -f apps/app/scripts/local-demo.sql <local database>
--   then sign in with code DEMXHN42
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99999999-9999-4999-8999-999999999999', 'Local Demo') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, timezone)
values ('HN', 'Atlántida', 'La Ceiba', 15.7597, -86.7822, 'America/Tegucigalpa') on conflict do nothing;

insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'local-demo', t.sid
  from leagues l, (values ('Motagua', 'demo-1'), ('Olimpia', 'demo-2')) t(name, sid)
 where l.name = 'Liga Nacional de Honduras'
on conflict do nothing;

-- Motagua plays at 7pm Toronto time today.
insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id,
       (date_trunc('day', now() at time zone 'America/Toronto') + interval '19 hours') at time zone 'America/Toronto',
       'scheduled', 'local-demo', 'demo-today', now()
  from leagues l
  join teams h on h.league_id = l.id and h.name = 'Motagua'
  join teams a on a.league_id = l.id and a.name = 'Olimpia'
 where l.name = 'Liga Nacional de Honduras'
on conflict (source, source_fixture_id) do update
  set kickoff_utc = excluded.kickoff_utc, status = 'scheduled', fetched_at = now();

insert into forecasts (municipality_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, fetched_at)
select m.id, p.provider::forecast_provider, (now() at time zone m.timezone)::date, p.t, p.t - 6, p.rain, now()
  from municipalities m, (values ('open-meteo', 28, 70), ('openweather', 29, 60), ('weatherapi', 30, 20)) p(provider, t, rain)
 where m.name = 'La Ceiba'
on conflict (municipality_id, provider, target_date) do update
  set temp_max_c = excluded.temp_max_c, precip_prob = excluded.precip_prob, fetched_at = now();

-- HNL: highest in 12 days today.
delete from fx_rates where quote = 'HNL' and rate_date >= current_date - 20;
insert into fx_rates (rate_date, quote, rate)
select d::date, 'HNL', case when d::date = current_date - 12 then 18.60 else 18.10 + (d::date - (current_date - 20)) * 0.02 end
  from generate_series(current_date - 20, current_date - 1, interval '1 day') d;
insert into fx_rates (rate_date, quote, rate) values (current_date, 'HNL', 18.51);

insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality,
                     team_id, segment, departure_date, timezone)
select '99999999-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999', 'DEMXHN42',
       'Carlos Mejía', 'HN', 'es', m.id, m.name, t.id, 'seasonal', current_date + 127, 'America/Toronto'
  from municipalities m join teams t on t.name = 'Motagua' and t.source = 'local-demo'
 where m.name = 'La Ceiba'
on conflict (id) do update set code = excluded.code, departure_date = excluded.departure_date, active = true;

-- A paid period covering today, and a second demo client whose period has ended
-- (sign in with DEMXEX42 to see the expiry screen).
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, (now() at time zone 'America/Toronto')::date, ((now() at time zone 'America/Toronto')::date + interval '6 months')::date,
       now(), 'sale', affiliate_id
  from clients where code = 'DEMXHN42'
on conflict (client_id, period_start) where voided_at is null do nothing;

insert into clients (affiliate_id, code, full_name, country, language)
values ('99999999-9999-4999-8999-999999999999', 'DEMXEX42', 'Rosa Vencida', 'HN', 'es')
on conflict (code) do nothing;
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-01-01', date '2026-07-01', now() - interval '8 months', 'sale', affiliate_id
  from clients where code = 'DEMXEX42'
on conflict (client_id, period_start) where voided_at is null do nothing;

-- LOCAL ONLY, for screenshots: the rest of Motagua's week, two more La Ceiba
-- forecast days, and a couple of lottery draws. Invented, like everything above.
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', t.name, 'local-demo', t.sid
  from leagues l, (values ('Real España', 'demo-3'), ('Marathón', 'demo-4')) t(name, sid)
 where l.name = 'Liga Nacional de Honduras'
on conflict do nothing;

insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id, k.kick, k.status::fixture_status, k.hs, k.aws, 'local-demo', k.sid, now()
  from leagues l
  cross join (values
    ('demo-next', 'Olimpia', 'Motagua', (date_trunc('day', now() at time zone 'America/Toronto') + interval '5 days 20 hours') at time zone 'America/Toronto', 'scheduled', null::int, null::int),
    ('demo-league', 'Real España', 'Marathón', (date_trunc('day', now() at time zone 'America/Toronto') + interval '17 hours') at time zone 'America/Toronto', 'finished', 3, 1),
    ('demo-last', 'Motagua', 'Real España', (date_trunc('day', now() at time zone 'America/Toronto') - interval '7 days' + interval '19 hours') at time zone 'America/Toronto', 'finished', 2, 1),
    ('demo-prev', 'Marathón', 'Motagua', (date_trunc('day', now() at time zone 'America/Toronto') - interval '14 days' + interval '18 hours') at time zone 'America/Toronto', 'finished', 0, 0)
  ) k(sid, home, away, kick, status, hs, aws)
  join teams h on h.name = k.home
  join teams a on a.name = k.away
 where l.name = 'Liga Nacional de Honduras' and h.league_id = l.id and a.league_id = l.id
on conflict (source, source_fixture_id) do update
  set kickoff_utc = excluded.kickoff_utc, status = excluded.status, home_score = excluded.home_score,
      away_score = excluded.away_score, fetched_at = now();

-- A fixtures feed run just now, so the schedule counts as current (3 hours).
insert into source_runs (feed, started_at, finished_at, status, records_written) values ('fixtures', now(), now(), 'ok', 4);

insert into forecasts (municipality_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, fetched_at)
select m.id, p.provider::forecast_provider, (now() at time zone m.timezone)::date + p.d, p.t, p.lo, p.rain, now()
  from municipalities m, (values ('open-meteo', 1, 31, 23, 10), ('openweather', 1, 32, 24, 20), ('weatherapi', 1, 31, 23, 5),
                                 ('open-meteo', 2, 28, 22, 80), ('openweather', 2, 27, 22, 75), ('weatherapi', 2, 28, 21, 40)) p(provider, d, t, lo, rain)
 where m.name = 'La Ceiba'
on conflict (municipality_id, provider, target_date) do update
  set temp_max_c = excluded.temp_max_c, temp_min_c = excluded.temp_min_c, precip_prob = excluded.precip_prob, fetched_at = now();

insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url, verified_at)
select g.id, (now() at time zone g.timezone)::date - r.d, r.t::time, r.n::text[], g.results_url, now()
  from lottery_games g
  join (values ('HN', 'Jugá 3', 0, '15:00', '{3,8,1}'), ('HN', 'La Diaria', 0, '11:00', '{47}'),
               ('HN', 'Super Premio', 1, '21:00', '{05,12,19,27,33}'),
               ('JM', 'Lotto', 1, '20:25', '{04,11,19,26,31,35}'), ('JM', 'Cash Pot', 0, '13:00', '{23}')) r(country, name, d, t, n)
    on g.country = r.country::country_code and g.name = r.name and g.active
on conflict (game_id, draw_date, draw_time_local) do update set numbers = excluded.numbers, verified_at = now();

-- LOCAL ONLY, for Fútbol and Clima screenshots (0036): more of an invented week
-- in Honduras, Mexico and Jamaica, stadiums and rounds on the invented fixtures,
-- a watched town, rain amounts, and Leamington/Windsor forecasts from two
-- providers. Invented, like everything above.
insert into teams (league_id, country, name, source, source_team_id)
select l.id, l.country, t.name, 'local-demo', t.sid
  from leagues l
  join (values ('Liga MX', 'Club America', 'demo-mx-1'), ('Liga MX', 'Toluca', 'demo-mx-2'), ('Liga MX', 'Monterrey', 'demo-mx-3'),
               ('Liga MX', 'Tigres UANL', 'demo-mx-4'), ('Jamaica Premier League', 'Mount Pleasant', 'demo-jm-1'),
               ('Jamaica Premier League', 'Cavalier', 'demo-jm-2'), ('Jamaica Premier League', 'Harbour View', 'demo-jm-3'),
               ('Jamaica Premier League', 'Waterhouse', 'demo-jm-4')) t(league, name, sid) on l.name = t.league
on conflict do nothing;

insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id,
                      fetched_at, venue_name, venue_city, round)
select l.id, h.id, a.id,
       (date_trunc('day', now() at time zone 'America/Toronto') + k.at) at time zone 'America/Toronto',
       k.status::fixture_status, k.hs, k.aws, 'local-demo', k.sid, now(), k.venue, k.city, k.round
  from (values
    ('demo-hn-r1', 'Liga Nacional de Honduras', 'Olimpia', 'Real España', interval '-3 days 19 hours', 'finished', 1, 2, 'Estadio Tiburcio Carías Andino', 'Tegucigalpa', 'Regular Season - 7'),
    ('demo-hn-r2', 'Liga Nacional de Honduras', 'Marathón', 'Olimpia', interval '-5 days 18 hours', 'finished', 2, 2, 'Estadio Yankel Rosenthal', 'San Pedro Sula', 'Regular Season - 7'),
    ('demo-mx-today', 'Liga MX', 'Club America', 'Toluca', interval '21 hours', 'scheduled', null, null, 'Estadio Ciudad de los Deportes', 'Ciudad de México', 'Regular Season - 8'),
    ('demo-mx-today2', 'Liga MX', 'Monterrey', 'Tigres UANL', interval '17 hours', 'finished', 2, 1, 'Estadio BBVA', 'Guadalupe', 'Regular Season - 8'),
    ('demo-mx-next', 'Liga MX', 'Toluca', 'Club America', interval '3 days 21 hours', 'scheduled', null, null, 'Estadio Nemesio Díez', 'Toluca', 'Regular Season - 9'),
    ('demo-mx-r1', 'Liga MX', 'Tigres UANL', 'Club America', interval '-4 days 21 hours', 'finished', 0, 1, 'Estadio Universitario', 'San Nicolás de los Garza', 'Regular Season - 7'),
    ('demo-mx-r2', 'Liga MX', 'Club America', 'Monterrey', interval '-11 days 20 hours', 'finished', 2, 2, 'Estadio Ciudad de los Deportes', 'Ciudad de México', 'Regular Season - 6'),
    ('demo-jm-today', 'Jamaica Premier League', 'Mount Pleasant', 'Cavalier', interval '20 hours', 'scheduled', null, null, 'Drax Hall', 'St. Ann', 'Regular Season - 5'),
    ('demo-jm-r1', 'Jamaica Premier League', 'Harbour View', 'Waterhouse', interval '-2 days 19 hours', 'finished', 3, 0, 'Harbour View Stadium', 'Kingston', 'Regular Season - 4'),
    ('demo-jm-r2', 'Jamaica Premier League', 'Cavalier', 'Mount Pleasant', interval '-6 days 19 hours', 'finished', 1, 1, 'Anthony Spaulding Sports Complex', 'Kingston', 'Regular Season - 4')
  ) k(sid, league, home, away, at, status, hs, aws, venue, city, round)
  join leagues l on l.name = k.league
  join teams h on h.league_id = l.id and h.name = k.home
  join teams a on a.league_id = l.id and a.name = k.away
on conflict (source, source_fixture_id) do update
  set kickoff_utc = excluded.kickoff_utc, status = excluded.status, home_score = excluded.home_score, away_score = excluded.away_score,
      fetched_at = now(), venue_name = excluded.venue_name, venue_city = excluded.venue_city, round = excluded.round;

update fixtures f set venue_name = v.venue, venue_city = v.city, round = v.round
  from (values ('demo-today', 'Estadio Tiburcio Carías Andino', 'Tegucigalpa', 'Regular Season - 8'),
               ('demo-next', 'Estadio Tiburcio Carías Andino', 'Tegucigalpa', 'Regular Season - 9'),
               ('demo-league', 'Estadio Francisco Morazán', 'San Pedro Sula', 'Regular Season - 8'),
               ('demo-last', 'Estadio Tiburcio Carías Andino', 'Tegucigalpa', 'Regular Season - 7'),
               ('demo-prev', 'Estadio Yankel Rosenthal', 'San Pedro Sula', 'Regular Season - 6')) v(sid, venue, city, round)
 where f.source = 'local-demo' and f.source_fixture_id = v.sid;
insert into source_runs (feed, started_at, finished_at, status, records_written) values ('fixtures', now(), now(), 'ok', 14);

-- DEMXHN42 watches San Pedro Sula; three days there, and rain amounts.
insert into client_watch_locations (client_id, municipality_id)
select c.id, m.id from clients c, municipalities m
 where c.code = 'DEMXHN42' and m.country = 'HN' and m.name = 'San Pedro Sula' and m.admin_region = 'Cortés'
on conflict do nothing;
insert into forecasts (municipality_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, fetched_at)
select m.id, p.provider::forecast_provider, (now() at time zone m.timezone)::date + p.d, p.t, p.lo, p.rain, now()
  from municipalities m, (values ('open-meteo', 0, 33, 23, 20), ('openweather', 0, 34, 24, 10), ('weatherapi', 0, 33, 23, 15),
                                 ('open-meteo', 1, 32, 23, 60), ('openweather', 1, 33, 24, 55), ('weatherapi', 1, 31, 22, 70),
                                 ('open-meteo', 2, 34, 24, 10), ('openweather', 2, 35, 24, 5), ('weatherapi', 2, 34, 23, 15)) p(provider, d, t, lo, rain)
 where m.country = 'HN' and m.name = 'San Pedro Sula' and m.admin_region = 'Cortés'
on conflict (municipality_id, provider, target_date) do update
  set temp_max_c = excluded.temp_max_c, temp_min_c = excluded.temp_min_c, precip_prob = excluded.precip_prob, fetched_at = now();
update forecasts f set precip_mm = round(f.precip_prob / 9, 1)
  from municipalities m where m.id = f.municipality_id and m.country = 'HN' and m.name in ('La Ceiba', 'San Pedro Sula');

insert into local_forecasts (place_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, precip_mm, fetched_at)
select lp.id, v.provider::forecast_provider, (now() at time zone lp.timezone)::date + v.d, v.t, v.lo, v.prob, v.mm, now()
  from local_places lp
  join (values ('leamington', 'open-meteo', 0, 21, 12, 20, 0.0), ('leamington', 'weatherapi', 0, 22, 13, 30, 0.3),
               ('leamington', 'open-meteo', 1, 18, 11, 70, 4.2), ('leamington', 'weatherapi', 1, 19, 12, 65, 3.1),
               ('leamington', 'open-meteo', 2, 23, 13, 10, 0.0), ('leamington', 'weatherapi', 2, 24, 14, 20, 0.1),
               ('windsor', 'open-meteo', 0, 22, 13, 25, 0.1), ('windsor', 'weatherapi', 0, 23, 13, 30, 0.4),
               ('windsor', 'open-meteo', 1, 19, 12, 75, 5.0), ('windsor', 'weatherapi', 1, 20, 12, 60, 3.6),
               ('windsor', 'open-meteo', 2, 24, 14, 10, 0.0), ('windsor', 'weatherapi', 2, 25, 15, 15, 0.0)) v(key, provider, d, t, lo, prob, mm)
    on lp.key = v.key
on conflict (place_id, provider, target_date) do update
  set temp_max_c = excluded.temp_max_c, temp_min_c = excluded.temp_min_c, precip_prob = excluded.precip_prob,
      precip_mm = excluded.precip_mm, fetched_at = now();
