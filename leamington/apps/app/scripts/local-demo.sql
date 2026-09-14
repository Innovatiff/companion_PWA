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
