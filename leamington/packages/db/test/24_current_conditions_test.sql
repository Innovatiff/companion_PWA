-- "Ahora" (0040): the weather now shows only from two or more providers that
-- observed and were fetched within 90 minutes; the median, a range where they
-- disagree, the most common sky (the more severe on a tie), and humidity,
-- feeling and wind only when two providers report them. Also the easy-read text
-- size. Uses the Jamaican client of test 13 and its "Section Home" and "Section
-- Watch" towns, with the clock pinned at 2026-09-13 14:00 UTC.
\set ON_ERROR_STOP on
begin;

insert into current_conditions (municipality_id, provider, observed_at, temp_c, feels_like_c, humidity, wind_kph,
                                condition, is_day, fetched_at)
select m.id, v.provider::forecast_provider, v.obs::timestamptz, v.t, v.feels, v.hum, v.wind, v.sky, v.day, v.fetched::timestamptz
  from municipalities m join (values
    -- Home: three fresh providers within 20 minutes, 23.0 to 26.2; two say cloudy, one rain.
    ('Section Home',  'open-meteo',  '2026-09-13 13:30+00', 24.4, 25,   80,   10,   'cloudy', true,  '2026-09-13 13:35+00'),
    ('Section Home',  'weatherapi',  '2026-09-13 13:45+00', 26.2, 27,   null, 12,   'rain',   false, '2026-09-13 13:50+00'),
    ('Section Home',  'openweather', '2026-09-13 13:30+00', 23.0, null, null, null, 'cloudy', true,  '2026-09-13 13:35+00'),
    -- Watch: rain and storm tie, day and night tie; the third observed at 11:00 is stale.
    ('Section Watch', 'open-meteo',  '2026-09-13 13:20+00', 30.2, null, 70,   null, 'rain',   true,  '2026-09-13 13:25+00'),
    ('Section Watch', 'weatherapi',  '2026-09-13 13:40+00', 31.4, null, 75,   null, 'storm',  false, '2026-09-13 13:45+00'),
    ('Section Watch', 'openweather', '2026-09-13 11:00+00', 10.0, null, null, null, 'clear',  true,  '2026-09-13 13:50+00')
  ) v(town, provider, obs, t, feels, hum, wind, sky, day, fetched) on m.name = v.town;

insert into current_conditions (place_id, provider, observed_at, temp_c, condition, is_day, fetched_at)
select lp.id, v.provider::forecast_provider, v.obs::timestamptz, v.t, v.sky, true, v.fetched::timestamptz
  from local_places lp join (values
    -- Leamington: two fresh; the third was fetched too long ago to count.
    ('leamington', 'open-meteo',  '2026-09-13 13:45+00', 12.0, 'clear',         '2026-09-13 13:50+00'),
    ('leamington', 'weatherapi',  '2026-09-13 13:30+00', 13.0, 'partly_cloudy', '2026-09-13 13:50+00'),
    ('leamington', 'openweather', '2026-09-13 13:30+00', 30.0, 'storm',         '2026-09-13 11:00+00'),
    -- Windsor: one fresh, one stamped 30 minutes in the future.
    ('windsor',    'open-meteo',  '2026-09-13 14:30+00', 15.0, 'clear',         '2026-09-13 13:50+00'),
    ('windsor',    'weatherapi',  '2026-09-13 13:30+00', 16.0, 'clear',         '2026-09-13 13:50+00')
  ) v(place, provider, obs, t, sky, fetched) on lp.key = v.place;

do $$
declare s jsonb; v_home bigint; v_watch bigint; v_leam bigint; v_windsor bigint;
begin
  select id into v_home from municipalities where name = 'Section Home';
  select id into v_watch from municipalities where name = 'Section Watch';
  select id into v_leam from local_places where key = 'leamington';
  select id into v_windsor from local_places where key = 'windsor';

  s := app.current_summary(v_home, null, '2026-09-13 14:00+00', 'en');
  assert (s->>'temp_c')::int = 24 and s->>'temp' = '24°', format('23 and 24 agree, so the median 24.4 (0043): %s', s);
  assert (s->>'feels_like')::int = 26 and (s->>'wind_kph')::int = 11, format('medians of two reports: %s', s);
  assert not s ? 'humidity', format('one provider''s humidity is not shown: %s', s);
  assert s->>'condition' = 'cloudy' and s->>'label' = 'Cloudy', format('the majority beats a more severe minority: %s', s);
  assert (s->>'is_day')::boolean and (s->>'providers')::int = 3, format('%s', s);
  assert (s->>'observed_at')::timestamptz = '2026-09-13 13:30+00'
     and (s->>'valid_until')::timestamptz = '2026-09-13 15:00+00', format('oldest observation used, plus 90 minutes: %s', s);
  assert app.current_summary(v_home, null, '2026-09-13 14:00+00', 'es')->>'label' = 'Nublado';

  s := app.current_summary(v_watch, null, '2026-09-13 14:00+00', 'es');
  assert (s->>'providers')::int = 2 and s->>'temp' = '31°', format('the stale 10° is ignored: %s', s);
  assert s->>'condition' = 'storm' and s->>'label' = 'Tormenta', format('a tie goes to the more severe sky: %s', s);
  assert not (s->>'is_day')::boolean, format('a day/night tie follows the newest observation: %s', s);
  assert (s->>'humidity')::int = 73 and not s ? 'feels_like', format('%s', s);

  s := app.current_summary(null, v_leam, '2026-09-13 14:00+00', 'en');
  assert (s->>'providers')::int = 2 and s->>'temp' = '13°' and s->>'condition' = 'partly_cloudy',
    format('a provider fetched long ago does not count: %s', s);

  assert app.current_summary(null, v_windsor, '2026-09-13 14:00+00', 'en') is null,
    'one provider, and one stamped in the future, is not "now"';
  assert app.current_summary(v_home, null, '2026-09-13 16:00+00', 'en') is null,
    'observations older than 90 minutes are not "now"';
  assert app.current_summary(null, null, '2026-09-13 14:00+00', 'en') is null;

  begin
    insert into current_conditions (provider, observed_at, temp_c) values ('open-meteo', now(), 20);
    assert false, 'a row belongs to a town or a local place';
  exception when check_violation then null;
  end;
  raise notice 'PASS current summary: two fresh providers, median or range, majority sky, strip what one reports';
end $$;

do $$
declare w jsonb; x jsonb; t jsonb; v_client uuid := '99990000-0000-4000-8000-0000000000b1';
begin
  w := app.weather_page(v_client, '2026-09-13 14:00+00');
  select e into t from jsonb_array_elements(w->'towns') e where (e->>'is_home')::boolean;
  assert t->'now'->>'temp' = '24°' and t->'now'->>'label' = 'Cloudy', format('home town now: %s', t);
  select e into t from jsonb_array_elements(w->'towns') e where e->>'name' = 'Section Watch';
  assert t->'now'->>'condition' = 'storm', format('watched town now: %s', t);
  select e into t from jsonb_array_elements(w->'local') e where e->>'key' = 'leamington';
  assert t->'now'->>'temp' = '13°', format('Leamington now: %s', t);
  select e into t from jsonb_array_elements(w->'local') e where e->>'key' = 'windsor';
  assert t ? 'now' and t->'now' = 'null'::jsonb, format('Windsor shows nothing now: %s', t);

  x := app.home_more(v_client, '2026-09-13 14:00+00');
  assert (x->'home_now'->>'temp_c')::int = 24, format('home_now: %s', x->'home_now');
  assert x->'leamington_now'->>'temp' = '13°' and x->'leamington_now'->>'label' = 'Partly cloudy',
    format('leamington_now: %s', x->'leamington_now');
  assert exists (select 1 from jsonb_array_elements(x->'watch_weather') e
                  where e->>'name' = 'Section Watch' and e->'now'->>'condition' = 'storm' and e->'today' is not null),
    format('watched town carries now: %s', x->'watch_weather');

  x := app.home_more(v_client, '2026-09-13 17:00+00');
  assert x->'home_now' = 'null'::jsonb and x->'leamington_now' = 'null'::jsonb, format('stale is nothing: %s', x);
  raise notice 'PASS current conditions on clima and home';
end $$;

do $$
declare v_client uuid := '99990000-0000-4000-8000-0000000000b1';
begin
  assert (select text_size from clients where id = v_client) = 'normal', 'normal by default';
  assert app.set_text_size(v_client, 'large') = 'large';
  assert (select text_size from clients where id = v_client) = 'large';
  assert app.set_text_size(v_client, 'normal') = 'normal';
  assert app.set_text_size('00000000-0000-4000-8000-000000000000', 'large') is null, 'no such client';
  begin
    perform app.set_text_size(v_client, 'huge');
    assert false, 'an unknown size is refused';
  exception when check_violation then null;
  end;
  raise notice 'PASS text size: normal or large, nothing else';
end $$;

rollback;
