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

-- LOCAL ONLY, round 1 "Ahora" (0040): the weather right now from two or three
-- providers, observed and fetched now, so it counts for 90 minutes. Re-run just
-- before screenshots. San Pedro Sula disagrees by more than 2° (a range) and has
-- humidity from one provider only (absent); Morelia has no feeling reported.
-- Day or night follows each place's real clock. Invented, like everything above.
insert into current_conditions (municipality_id, provider, observed_at, temp_c, feels_like_c, humidity, wind_kph, condition, is_day, fetched_at)
select m.id, v.provider::forecast_provider, now() - interval '12 minutes', v.t, v.f, v.h, v.w, v.c,
       extract(hour from now() at time zone m.timezone) between 6 and 17, now()
  from (values
    ('HN', 'La Ceiba', 'open-meteo', 29, 33, 78, 12, 'partly_cloudy'), ('HN', 'La Ceiba', 'openweather', 30, 34, 80, 15, 'partly_cloudy'),
    ('HN', 'La Ceiba', 'weatherapi', 29, 33, 75, 10, 'clear'),
    ('HN', 'San Pedro Sula', 'open-meteo', 30, 35, null, 9, 'rain'), ('HN', 'San Pedro Sula', 'openweather', 33, 37, 70, 11, 'rain'),
    ('HN', 'San Pedro Sula', 'weatherapi', 34, 38, null, null, 'storm'),
    ('MX', 'Morelia', 'open-meteo', 17, null, 72, 6, 'cloudy'), ('MX', 'Morelia', 'weatherapi', 18, null, 68, 8, 'cloudy'),
    ('JM', 'Montego Bay', 'open-meteo', 31, 36, 74, 18, 'storm'), ('JM', 'Montego Bay', 'openweather', 31, 37, 76, 22, 'rain'),
    ('JM', 'Montego Bay', 'weatherapi', 32, 37, 73, 20, 'storm')
  ) v(country, town, provider, t, f, h, w, c)
  join municipalities m on m.country = v.country::country_code and m.name = v.town
 where (v.town <> 'San Pedro Sula' or m.admin_region = 'Cortés')
on conflict (municipality_id, provider) where municipality_id is not null do update
  set observed_at = excluded.observed_at, temp_c = excluded.temp_c, feels_like_c = excluded.feels_like_c, humidity = excluded.humidity,
      wind_kph = excluded.wind_kph, condition = excluded.condition, is_day = excluded.is_day, fetched_at = now();

insert into current_conditions (place_id, provider, observed_at, temp_c, feels_like_c, humidity, wind_kph, condition, is_day, fetched_at)
select lp.id, v.provider::forecast_provider, now() - interval '8 minutes', v.t, v.f, v.h, v.w, v.c,
       extract(hour from now() at time zone lp.timezone) between 7 and 19, now()
  from (values ('leamington', 'open-meteo', 14, 13, 88, 8, 'cloudy'), ('leamington', 'weatherapi', 15, 13, 90, 11, 'cloudy'),
               ('windsor', 'open-meteo', 15, 14, 85, 12, 'fog'), ('windsor', 'weatherapi', 16, 15, 86, 14, 'fog')) v(key, provider, t, f, h, w, c)
  join local_places lp on lp.key = v.key
on conflict (place_id, provider) where place_id is not null do update
  set observed_at = excluded.observed_at, temp_c = excluded.temp_c, feels_like_c = excluded.feels_like_c, humidity = excluded.humidity,
      wind_kph = excluded.wind_kph, condition = excluded.condition, is_day = excluded.is_day, fetched_at = now();

-- LOCAL ONLY, for the home bell's dot: Jamaica's warnings checked just now, and
-- one invented active warning covering Montego Bay (TEZTJM24's town). The
-- identifier marks it as local; it is replaced on every run.
insert into source_runs (feed, started_at, finished_at, status, records_written) values ('alerts:JM', now(), now(), 'ok', 1);
delete from weather_alerts where cap_identifier like 'local-demo-%';
insert into weather_alerts (source_id, country, cap_identifier, cap_sender, cap_sent, msg_type, event, headline, area_desc, severity_raw,
                            level, issued_at, effective_at, expires_at, center_geog, radius_m, source_url, fetched_at)
select s.id, 'JM', 'local-demo-1', 'local-demo', now() - interval '25 minutes', 'Alert', 'Flash Flood Watch',
       'LOCAL DEMO: Flash Flood Watch for St. James', 'St. James', 'Moderate', 'orange',
       now() - interval '25 minutes', now() - interval '25 minutes', now() + interval '6 hours', m.geog, 25000,
       'https://metservice.gov.jm/', now()
  from alert_sources s, municipalities m
 where s.country = 'JM' and s.active and m.country = 'JM' and m.name = 'Montego Bay'
 limit 1;

-- LOCAL ONLY, round 2 (0041): a member who is not a founder and is settled with
-- a next trip, for the member card and the "trip" season ring. Its first payment
-- is an invented date after 1 November 2026, which is what makes member_since
-- (and so "founder") fall after the first season. Invented, like everything above.
insert into clients (affiliate_id, code, full_name, country, language, municipality_id, municipality, segment, next_trip_date,
                     timezone, setup_state, setup_completed_at, corridor_confirmed_at)
select '99999999-9999-4999-8999-999999999999', 'DEMXGT42', 'Ana Pérez', 'GT', 'es', m.id, m.name,
       'settled', current_date + 40, 'America/Toronto',
       '{"kids": "done", "watch": "skipped", "segment": "done", "corridor": "done", "municipality": "done"}', now(), now()
  from municipalities m where m.country = 'GT' and m.name = 'Huehuetenango'
 limit 1
on conflict (code) do update set next_trip_date = excluded.next_trip_date, active = true;
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, (now() at time zone 'America/Toronto')::date, ((now() at time zone 'America/Toronto')::date + interval '6 months')::date,
       timestamptz '2026-11-02 10:00:00-05', 'sale', affiliate_id
  from clients where code = 'DEMXGT42'
on conflict (client_id, period_start) where voided_at is null do nothing;

-- LOCAL ONLY, round 3 (0042): reference-rate history for the Tasa charts. Invented
-- local demo numbers, never real quotes:
--   HNL  daily back to 90 days (the existing last 20 days above stay as they are)
--   JMD  daily, 95 days
--   MXN  weekdays only, like the real feed (no quote on Saturday or Sunday)
--   GTQ  none, so the page's "no rate yet" state can be seen
insert into fx_rates (rate_date, quote, rate)
select d::date, 'HNL', round((18.05 + 0.18 * sin(extract(doy from d) / 9.0) + 0.05 * sin(extract(doy from d) / 2.3))::numeric, 4)
  from generate_series(current_date - 92, current_date - 22, interval '1 day') d
on conflict (rate_date, quote) do nothing;
insert into fx_rates (rate_date, quote, rate)
select d::date, 'JMD', round((112.4 + 1.6 * sin(extract(doy from d) / 10.0) + 0.45 * sin(extract(doy from d) / 3.1))::numeric, 4)
  from generate_series(current_date - 95, current_date, interval '1 day') d
on conflict (rate_date, quote) do nothing;
insert into fx_rates (rate_date, quote, rate)
select d::date, 'MXN', round((13.62 + 0.32 * sin(extract(doy from d) / 8.0) + 0.09 * sin(extract(doy from d) / 2.7))::numeric, 4)
  from generate_series(current_date - 95, current_date, interval '1 day') d
 where extract(isodow from d) < 6
on conflict (rate_date, quote) do nothing;

-- LOCAL ONLY: Ontario public holidays, copied exactly from
-- services/ingest/data/on-provincial_holidays.json (checked there against the
-- ontario.ca source), so the local merge matches what ingest writes.
insert into provincial_holidays (province, holiday_date, name, name_es, verified_at, source_url)
select 'ON', v.d::date, v.name, v.name_es, date '2026-09-14',
       'https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays'
  from (values ('2026-01-01', 'New Year''s Day', 'Año Nuevo'), ('2026-02-16', 'Family Day', 'Día de la Familia'),
               ('2026-04-03', 'Good Friday', 'Viernes Santo'), ('2026-05-18', 'Victoria Day', 'Día de la Reina Victoria'),
               ('2026-07-01', 'Canada Day', 'Día de Canadá'), ('2026-09-07', 'Labour Day', 'Día del Trabajo'),
               ('2026-10-12', 'Thanksgiving Day', 'Día de Acción de Gracias'), ('2026-12-25', 'Christmas Day', 'Navidad'),
               ('2026-12-26', 'Boxing Day', 'Día de San Esteban (Boxing Day)'), ('2027-01-01', 'New Year''s Day', 'Año Nuevo'),
               ('2027-02-15', 'Family Day', 'Día de la Familia'), ('2027-03-26', 'Good Friday', 'Viernes Santo'),
               ('2027-05-24', 'Victoria Day', 'Día de la Reina Victoria'), ('2027-07-01', 'Canada Day', 'Día de Canadá'),
               ('2027-09-06', 'Labour Day', 'Día del Trabajo'), ('2027-10-11', 'Thanksgiving Day', 'Día de Acción de Gracias'),
               ('2027-12-25', 'Christmas Day', 'Navidad'), ('2027-12-26', 'Boxing Day', 'Día de San Esteban (Boxing Day)')) v(d, name, name_es)
on conflict (province, holiday_date, name) do nothing;

-- LOCAL ONLY, round 4 (0044): Leamington's next hours from three providers and
-- air quality from two, fetched now, so they count for 5 hours (air: 2 hours).
-- Invented local demo numbers. Re-run just before screenshots:
--   psql -f ... (normal)  |  psql -v variant=heat -f ...  |  psql -v variant=air_range -f ...
--   heat:      feels-like about 34° at midday (heat "caution")
--   air_range: the providers two EPA categories apart (a range, no single value)
--   tomorrow:  every row stamped 8 hours ahead, for a preview clock (?at=) after 6pm
-- The third hour from now has providers far apart (no temperature for it); the
-- second hour from now is a rain hour (about 64%).
\if :{?variant}
\else
\set variant normal
\endif
delete from local_hourly where place_id = (select id from local_places where key = 'leamington');
insert into local_hourly (place_id, provider, hour_start, temp_c, feels_like_c, precip_prob, uv_index, condition, is_day, fetched_at)
select lp.id, p.provider::forecast_provider, g.h + make_interval(hours => case when :'variant' = 'tomorrow' then 8 else 0 end),
       round((g.base + p.off + case when g.i = 3 then p.dis else 0 end)::numeric, 1),
       round((g.base + p.off + case when :'variant' = 'heat' then 14 else 1 end)::numeric, 1),
       least(100, greatest(0, case when g.i = 2 then 64 else 12 + (g.i % 4) * 5 end + p.poff)),
       case when g.lh between 7 and 19 then round((7.2 * sin(pi() * (g.lh - 7) / 12.0))::numeric, 1) else 0 end,
       case when g.i = 2 then 'rain' when g.lh between 7 and 19 then (case when g.i % 3 = 0 then 'partly_cloudy' else 'clear' end) else 'cloudy' end,
       g.lh between 7 and 19, now() + make_interval(hours => case when :'variant' = 'tomorrow' then 8 else 0 end)
  from local_places lp
  cross join (values ('open-meteo', 0.0, -4.0, 0), ('openweather', 0.6, 0.0, 4), ('weatherapi', -0.4, 4.5, -4)) p(provider, off, dis, poff)
  cross join lateral (
    select i, app.hour_floor(now()) + make_interval(hours => i) as h,
           extract(hour from (app.hour_floor(now()) + make_interval(hours => i + case when :'variant' = 'tomorrow' then 8 else 0 end)) at time zone lp.timezone)::int as lh,
           case when extract(hour from (app.hour_floor(now()) + make_interval(hours => i + case when :'variant' = 'tomorrow' then 8 else 0 end)) at time zone lp.timezone) between 6 and 20
                then 9 + 11 * sin(pi() * (extract(hour from (app.hour_floor(now()) + make_interval(hours => i + case when :'variant' = 'tomorrow' then 8 else 0 end)) at time zone lp.timezone) - 6) / 14.0)
                else 8 end as base
      from generate_series(0, 26) i) g
 where lp.key = 'leamington';

insert into local_air_quality (place_id, provider, observed_at, us_aqi, pm2_5, fetched_at)
select lp.id, v.provider::forecast_provider, now() - interval '20 minutes',
       case when :'variant' = 'air_range' then v.range_aqi else v.aqi end, v.pm, now()
  from local_places lp, (values ('open-meteo', 38, 8.2, 42), ('weatherapi', 46, 9.6, 162)) v(provider, aqi, pm, range_aqi)
 where lp.key = 'leamington'
on conflict (place_id, provider) do update
  set observed_at = excluded.observed_at, us_aqi = excluded.us_aqi, pm2_5 = excluded.pm2_5, fetched_at = now();

-- LOCAL ONLY, round 5 (0045). Run from the repository root: the gallery images are
-- read from apps/app/scripts/demo-gallery with psql's \set and base64.
--   * Gallery photos 2-3 for La Ceiba and 2 for Morelia: generated placeholder
--     images labelled "LOCAL DEMO · NOT A PHOTO", credited as local demo (CC0).
--   * This week's Honduran draws (La Diaria and Jugá 3 today) and a finished
--     Motagua match earlier today, so Tu semana has lottery and team parts.
-- Invented, like everything above.
\set demo_gallery_1 `base64 < apps/app/scripts/demo-gallery/demo-1.jpg | tr -d '\n'`
\set demo_gallery_2 `base64 < apps/app/scripts/demo-gallery/demo-2.jpg | tr -d '\n'`
insert into municipality_gallery_photos (municipality_id, rank, content_type, bytes, width, height, sha256, file_title,
                                         source_page_url, article_url, author, license, license_url)
select m.id, v.rank, 'image/jpeg', decode(v.b64, 'base64'), 480, 360, encode(sha256(decode(v.b64, 'base64')), 'hex'), v.title,
       'https://example.org/hoy-local-demo', 'https://example.org/hoy-local-demo', 'Hoy local demo (not a photo)', 'CC0 1.0',
       'https://creativecommons.org/publicdomain/zero/1.0/'
  from (values ('HN', 'La Ceiba', 2, :'demo_gallery_1', 'File:Hoy local demo 1.jpg'),
               ('HN', 'La Ceiba', 3, :'demo_gallery_2', 'File:Hoy local demo 2.jpg'),
               ('MX', 'Morelia', 2, :'demo_gallery_1', 'File:Hoy local demo 1.jpg')) v(country, name, rank, b64, title)
  join municipalities m on m.country = v.country::country_code and m.name = v.name
  join municipality_photos p on p.municipality_id = m.id
on conflict (municipality_id, rank) do update set bytes = excluded.bytes, sha256 = excluded.sha256, fetched_at = now();

insert into lottery_results (game_id, draw_date, draw_time_local, numbers, source_url, verified_at)
select g.id, (now() at time zone g.timezone)::date, r.t::time, r.n::text[], g.results_url, now()
  from lottery_games g
  join (values ('HN', 'Jugá 3', '11:00', '{7,2,8}'), ('HN', 'La Diaria', '11:00', '{12}')) r(country, name, t, n)
    on g.country = r.country::country_code and g.name = r.name and g.active
on conflict (game_id, draw_date, draw_time_local) do update set numbers = excluded.numbers, verified_at = now();

insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id, fetched_at)
select l.id, h.id, a.id, (date_trunc('day', now() at time zone 'America/Toronto') + interval '8 hours') at time zone 'America/Toronto',
       'finished', 2, 0, 'local-demo', 'demo-week-1', now()
  from leagues l
  join teams h on h.league_id = l.id and h.name = 'Motagua'
  join teams a on a.league_id = l.id and a.name = 'Olimpia'
 where l.name = 'Liga Nacional de Honduras'
on conflict (source, source_fixture_id) do update
  set kickoff_utc = excluded.kickoff_utc, status = 'finished', home_score = 2, away_score = 0, fetched_at = now();

-- LOCAL ONLY, round 5 polish. Extra result fields as each operator's feed stores
-- them (services/ingest/src/feeds/lottery: mas1, bonusBall, drawNumber, megaBall,
-- concurso, adicional, multiplicador), a second Cash Pot draw, and a Mexican
-- Sunday (Melate and Tris) so a Monday's Tu semana has latest results to show.
-- Invented, like everything above.
update lottery_results r set extras = jsonb_build_object('mas1', (extract(day from r.draw_date)::int % 10)::text)
  from lottery_games g
 where g.id = r.game_id and g.country = 'HN' and g.name = 'La Diaria';
update lottery_results r set extras = '{"drawNumber": "2871", "bonusBall": "08"}'
  from lottery_games g
 where g.id = r.game_id and g.country = 'JM' and g.name = 'Lotto';
update lottery_results r set extras = '{"drawNumber": "40112", "megaBall": false}'
  from lottery_games g
 where g.id = r.game_id and g.country = 'JM' and g.name = 'Cash Pot';
insert into lottery_results (game_id, draw_date, draw_time_local, numbers, extras, source_url, verified_at)
select g.id, (now() at time zone g.timezone)::date - r.d, r.t::time, r.n::text[], r.x::jsonb,
       coalesce(g.results_url, 'https://example.org/hoy-local-demo'), now() - interval '10 hours'
  from lottery_games g
  join (values ('JM', 'Cash Pot', 1, '10:30', '{17}', '{"drawNumber": "40111", "megaBall": true}'),
               ('MX', 'Melate', 1, '21:00', '{03,14,22,35,41,52}', '{"concurso": "4102", "adicional": "09"}'),
               ('MX', 'Tris', 1, '21:00', '{3,0,7,1,5}', '{"concurso": "33456", "multiplicador": true}')) r(country, name, d, t, n, x)
    on g.country = r.country::country_code and g.name = r.name and g.active
on conflict (game_id, draw_date, draw_time_local) do update
  set numbers = excluded.numbers, extras = excluded.extras, verified_at = excluded.verified_at;
