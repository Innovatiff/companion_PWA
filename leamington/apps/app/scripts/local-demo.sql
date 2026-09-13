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
