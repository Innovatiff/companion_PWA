-- Richer Fútbol and Clima from real rows only: form and goals from actual
-- results, stadium and round on matches, league results of the last week,
-- today's other leagues, a league for clients without a team, local places'
-- forecasts under the same rules, and rain probability as a provider median.
-- Uses the clients and fixtures of test 13; clock pinned at 2026-09-13 14:00 UTC.
\set ON_ERROR_STOP on

update fixtures set venue_name = 'Test Park', venue_city = 'Montego Bay', round = 'Regular Season - 3'
 where source_fixture_id = 'sec-today';

do $$
declare p jsonb; m jsonb;
begin
  p := app.football_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 14:00:00+00');
  assert p->'form' = '["W"]'::jsonb, format('form from the one finished result (2-1 win): %s', p->'form');
  assert (p->'goals'->>'for')::int = 2 and (p->'goals'->>'against')::int = 1 and (p->'goals'->>'matches')::int = 1, format('%s', p->'goals');

  select x into m from jsonb_array_elements(p->'upcoming') x where x->>'home' = 'Section FC' limit 1;
  assert m->>'venue' = 'Test Park' and m->>'city' = 'Montego Bay' and m->>'round' = 'Regular Season - 3', format('%s', m);
  assert not (m ? 'home_score'), 'an unfinished match has no score keys';
  assert m->>'league' = 'Jamaica Premier League' and m ? 'league_crest', format('%s', m);

  assert exists (select 1 from jsonb_array_elements(p->'league_recent') x where x->>'away' = 'Fourth FC' and (x->>'home_score')::int = 2),
    format('yesterday''s league result: %s', p->'league_recent');
  assert not exists (select 1 from jsonb_array_elements(p->'league_recent') x where x->>'home' = 'Third FC' and x->>'away' = 'Fourth FC'),
    'today''s results are not "recent" (they are in league_today)';
  assert jsonb_typeof(p->'region_today') = 'array', format('%s', p->'region_today');

  -- A quiet fixtures feed hides schedules everywhere, but keeps final results.
  p := app.football_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 20:00:00+00');
  assert p->'region_today' = 'null'::jsonb and p->'league_today' = 'null'::jsonb and jsonb_array_length(p->'league_recent') >= 1;

  -- No team: their country's league, and no team sections.
  p := app.football_page('99990000-0000-4000-8000-0000000000b3', '2026-09-13 14:00:00+00');
  assert p->'team' = 'null'::jsonb and p->'form' = 'null'::jsonb and p->'upcoming' = 'null'::jsonb, format('%s', p);
  assert p->>'league' is not null and (select country::text from leagues where id = (p->>'league_id')::bigint) = 'MX', format('%s', p);
  raise notice 'PASS football: form, goals, stadium, league results and other leagues come from real fixtures only';
end $$;

insert into local_forecasts (place_id, provider, target_date, temp_max_c, temp_min_c, precip_prob, precip_mm, fetched_at)
select lp.id, v.provider::forecast_provider, '2026-09-13', v.t, v.lo, v.prob, v.mm, '2026-09-13 12:00:00+00'
  from local_places lp, (values ('open-meteo', 24, 14, 20, 0.0), ('weatherapi', 25, 15, 40, 0.4)) v(provider, t, lo, prob, mm)
 where lp.key = 'leamington';

do $$
declare w jsonb; leam jsonb; home jsonb;
begin
  w := app.weather_page('99990000-0000-4000-8000-0000000000b1', '2026-09-13 14:00:00+00');
  select x into leam from jsonb_array_elements(w->'local') x where x->>'key' = 'leamington';
  assert leam->>'name' = 'Leamington' and (leam->>'lat')::float between 42 and 43, format('%s', leam);
  assert jsonb_array_length(leam->'days') = 1 and (leam->'days'->0->>'rain_prob')::int = 30 and leam->'days'->0->>'temp' = '24–25°' or leam->'days'->0->>'temp' = '25°',
    format('local forecast with rain probability as the provider median: %s', leam->'days');
  assert exists (select 1 from jsonb_array_elements(w->'local') x where x->>'key' = 'windsor' and jsonb_array_length(x->'days') = 0),
    'a local place without two fresh providers shows no days';

  select x into home from jsonb_array_elements(w->'towns') x where (x->>'is_home')::boolean;
  assert home ? 'lat' and home ? 'timezone' and home ? 'photo', format('%s', home);
  assert (home->'days'->0->>'rain_prob')::int = 60, format('median of 70, 60, 10: %s', home->'days'->0);

  -- A single fresh provider is not a forecast, locally either.
  assert app.local_forecast_summary((select id from local_places where key = 'windsor'), '2026-09-13', '2026-09-13 14:00:00+00', 'es') is null;
  raise notice 'PASS clima: local places and rain probability follow the same two-provider rules';
end $$;
