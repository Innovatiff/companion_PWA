-- Round 4 (0044): hour by hour, sun and heat, air quality and the working day,
-- for the local places. Every value from two or more fresh providers; one
-- provider, a stale fetch or a disagreement gives nothing or a range. Uses the
-- English-speaking client of test 13 for the payloads. Leamington is on
-- America/Toronto (UTC-4 in September).
\set ON_ERROR_STOP on
begin;

-- Hours for one provider: constant values from p_from, day between 7am and 6pm local.
create function pg_temp.fill(p_key text, p_provider text, p_from timestamptz, p_hours int, p_temp numeric,
                             p_feels numeric, p_prob numeric, p_uv numeric, p_sky text, p_fetched timestamptz)
returns void language sql as $$
  insert into local_hourly (place_id, provider, hour_start, temp_c, feels_like_c, precip_prob, uv_index, condition, is_day, fetched_at)
  select lp.id, p_provider::forecast_provider, g, p_temp, p_feels, p_prob, p_uv, p_sky,
         extract(hour from g at time zone 'America/Toronto') between 7 and 18, p_fetched
    from local_places lp, generate_series(p_from, p_from + make_interval(hours => p_hours - 1), interval '1 hour') g
   where lp.key = p_key
  on conflict (place_id, provider, hour_start) do update
    set temp_c = excluded.temp_c, feels_like_c = excluded.feels_like_c, precip_prob = excluded.precip_prob,
        uv_index = excluded.uv_index, condition = excluded.condition, is_day = excluded.is_day,
        fetched_at = excluded.fetched_at;
$$;

-- Set one column of one provider's hour (or of every provider's, when p_provider is null).
create function pg_temp.set_hour(p_provider text, p_hour timestamptz, p_col text, p_val text)
returns void language plpgsql as $$
begin
  execute format('update local_hourly set %I = $1::%s
                   where place_id = (select id from local_places where key = ''leamington'')
                     and ($2::text is null or provider = $2::forecast_provider) and hour_start = $3',
                 p_col, case p_col when 'condition' then 'text' when 'is_day' then 'boolean' else 'numeric' end)
    using p_val, p_provider, p_hour;
end $$;

create function pg_temp.air(p_provider text, p_obs timestamptz, p_aqi int, p_pm numeric, p_fetched timestamptz)
returns void language sql as $$
  insert into local_air_quality (place_id, provider, observed_at, us_aqi, pm2_5, fetched_at)
  select id, p_provider::forecast_provider, p_obs, p_aqi, p_pm, p_fetched from local_places where key = 'leamington'
  on conflict (place_id, provider) do update
    set observed_at = excluded.observed_at, us_aqi = excluded.us_aqi, pm2_5 = excluded.pm2_5, fetched_at = excluded.fetched_at;
$$;

-- ---------------------------------------------------------------------------
-- Hour by hour
-- ---------------------------------------------------------------------------
do $$
declare h jsonb; e jsonb; v_now timestamptz := '2026-09-14 13:40+00'; v_f timestamptz := '2026-09-14 13:15+00';
begin
  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 13:00+00', 30, 20, 21, 10, 5, 'cloudy', v_f);
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 13:00+00', 30, 21, 22, 30, 7, 'rain', v_f);
  -- OpenWeather's 3-hour steps, an outlier on temperature.
  perform pg_temp.fill('leamington', 'openweather', g, 1, 30, 30, 90, null, 'rain', v_f)
     from generate_series('2026-09-14 13:00+00'::timestamptz, '2026-09-15 10:00+00', interval '3 hours') g;

  h := app.hourly_outlook('leamington', v_now, 12, 'es');
  assert jsonb_array_length(h->'hours') = 12 and h->>'place' = 'Leamington' and h->>'timezone' = 'America/Toronto', format('%s', h);
  e := h->'hours'->0;
  assert (e->>'hour_start')::timestamptz = '2026-09-14 13:00+00' and e->>'hour' = '9am' and (e->>'local_hour')::int = 9,
    format('starts at the current hour, labelled in local time: %s', e);
  assert (e->>'temp_c')::int = 21 and (e->>'rain_prob')::int = 30,
    format('20 and 21 agree, so the median of 20, 21, 30; rain the median of 10, 30, 90: %s', e);
  assert e->>'condition' = 'rain' and e->>'label' = 'Lluvia' and (e->>'is_day')::boolean, format('majority sky: %s', e);
  e := h->'hours'->1;
  assert (e->>'temp_c')::int = 21 and (e->>'rain_prob')::int = 20 and e->>'condition' = 'rain',
    format('two providers: median 20.5 rounds to 21; a sky tie goes to the more severe: %s', e);
  assert app.hourly_outlook('leamington', v_now, 12, 'en')->'hours'->0->>'label' = 'Rain';
  assert (h->>'valid_until')::timestamptz = '2026-09-14 18:15+00', format('oldest fetch plus 5 hours: %s', h->'valid_until');

  -- Disagreement: 20 and 25 at 15:00 UTC. The hour stays, without a temperature.
  perform pg_temp.set_hour('weatherapi', '2026-09-14 15:00+00', 'temp_c', '25');
  -- One provider at 17:00 UTC: the hour is left out.
  delete from local_hourly where provider = 'weatherapi' and hour_start = '2026-09-14 17:00+00';
  -- Rain at 2pm and 3pm local; a low of 5.5 and a high of 27.5.
  perform pg_temp.set_hour('open-meteo', '2026-09-14 18:00+00', 'precip_prob', '60');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 18:00+00', 'precip_prob', '80');
  perform pg_temp.set_hour('open-meteo', '2026-09-14 19:00+00', 'precip_prob', '60');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 19:00+00', 'precip_prob', '40');
  perform pg_temp.set_hour('open-meteo', '2026-09-14 20:00+00', 'temp_c', '5');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 20:00+00', 'temp_c', '6');
  perform pg_temp.set_hour('open-meteo', '2026-09-14 21:00+00', 'temp_c', '27');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 21:00+00', 'temp_c', '28');

  h := app.hourly_outlook('leamington', v_now, 12, 'es');
  assert jsonb_array_length(h->'hours') = 11, format('one-provider hour omitted: %s', jsonb_array_length(h->'hours'));
  assert not exists (select 1 from jsonb_array_elements(h->'hours') x where (x->>'hour_start')::timestamptz = '2026-09-14 17:00+00');
  select x into e from jsonb_array_elements(h->'hours') x where (x->>'hour_start')::timestamptz = '2026-09-14 15:00+00';
  assert not e ? 'temp_c' and (e->>'rain_prob')::int = 20 and e->>'hour' = '11am',
    format('two that disagree give no temperature, never a guess: %s', e);
  assert h->'rain_hours' = '["2pm", "3pm"]'::jsonb, format('rain_prob 70 and 60 (60, 40, 90): %s', h->'rain_hours');
  assert (h->>'min_temp')::int = 6 and (h->>'max_temp')::int = 28, format('%s %s', h->'min_temp', h->'max_temp');

  -- Hours parameter.
  assert jsonb_array_length(app.hourly_outlook('leamington', v_now, 24)->'hours') = 23, 'default language; 24 hours less one';
  assert app.hourly_outlook('leamington', v_now, 4) is not null, 'four hours qualify';
  assert app.hourly_outlook('leamington', v_now, 3) is null, 'fewer than 4 hours is nothing';
  begin perform app.hourly_outlook('leamington', v_now, 0); assert false, '0 hours';
  exception when invalid_parameter_value then null; end;
  begin perform app.hourly_outlook('leamington', v_now, 25); assert false, '25 hours';
  exception when invalid_parameter_value then null; end;
  begin perform app.hourly_outlook('leamington', v_now, null); assert false, 'null hours';
  exception when invalid_parameter_value then null; end;
  assert app.hourly_outlook('windsor', v_now) is null, 'no rows';
  assert app.hourly_outlook('nowhere', v_now) is null, 'no such place';

  -- Staleness: WeatherAPI fetched 5 hours and 1 minute ago no longer counts.
  update local_hourly set fetched_at = v_now - interval '5 hours 1 minute' where provider = 'weatherapi';
  h := app.hourly_outlook('leamington', v_now, 12, 'es');
  assert jsonb_array_length(h->'hours') = 4, format('only the 3-hour steps have two providers: %s', h);
  assert not exists (select 1 from jsonb_array_elements(h->'hours') x where x ? 'temp_c')
     and h->'max_temp' = 'null'::jsonb, format('20 against 30 is no temperature: %s', h);
  assert (h->'hours'->0->>'rain_prob')::int = 50, format('%s', h->'hours'->0);
  delete from local_hourly where provider = 'openweather' and hour_start = '2026-09-14 22:00+00';
  assert app.hourly_outlook('leamington', v_now, 12, 'es') is null, 'three hours left: nothing';

  delete from local_hourly;
  raise notice 'PASS hourly outlook: median of two that agree, omissions, under 4 hours, hours validation, staleness';
end $$;

-- ---------------------------------------------------------------------------
-- Sun and heat
-- ---------------------------------------------------------------------------
do $$
declare s jsonb; v_now timestamptz := '2026-09-14 13:40+00'; v_f timestamptz := '2026-09-14 13:15+00';
begin
  assert app.uv_level(0) = 'low' and app.uv_level(2) = 'low' and app.uv_level(2.4) = 'low' and app.uv_level(2.5) = 'moderate'
     and app.uv_level(5) = 'moderate' and app.uv_level(6) = 'high' and app.uv_level(7) = 'high'
     and app.uv_level(8) = 'very_high' and app.uv_level(10) = 'very_high' and app.uv_level(11) = 'extreme'
     and app.uv_level(null) is null, 'WHO UV categories';
  assert app.heat_level(29) = 'none' and app.heat_level(29.4) = 'none' and app.heat_level(29.5) = 'caution'
     and app.heat_level(34) = 'caution' and app.heat_level(35) = 'high' and app.heat_level(39) = 'high'
     and app.heat_level(40) = 'extreme' and app.heat_level(null) is null, 'heat bands';
  assert app.heat_label('none', 'es') is null and app.heat_label('extreme', 'en') = 'Extreme heat';

  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 13:00+00', 30, 25, 27, 0, 3, 'clear', v_f);
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 13:00+00', 30, 25, 29, 0, 2, 'clear', v_f);
  perform pg_temp.fill('leamington', 'openweather', g, 1, 25, 31, 0, null, 'clear', v_f)
     from generate_series('2026-09-14 13:00+00'::timestamptz, '2026-09-15 16:00+00', interval '3 hours') g;
  perform pg_temp.set_hour('open-meteo', '2026-09-14 17:00+00', 'uv_index', '8');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 17:00+00', 'uv_index', '6');
  perform pg_temp.set_hour('weatherapi', '2026-09-14 18:00+00', 'uv_index', '7');
  -- Ignored: a night hour today, and tomorrow.
  perform pg_temp.set_hour('weatherapi', '2026-09-14 23:00+00', 'uv_index', '12');
  perform pg_temp.set_hour(null, '2026-09-15 17:00+00', 'uv_index', '11');

  s := app.sun_and_heat('leamington', v_now, 'es');
  assert (s->>'uv_max')::int = 8 and s->>'uv_level' = 'very_high' and s->>'uv_label' = 'Muy alto',
    format('median of 8 and 7 is 7.5, rounded 8: %s', s);
  assert s->>'uv_peak_hour' = '1pm' and (s->>'uv_peak_at')::timestamptz = '2026-09-14 17:00+00',
    format('1pm has the highest median UV (7, against 5 at 2pm): %s', s);
  assert (s->>'feels_max')::int = 29 and s->>'heat_level' = 'none' and not s ? 'heat_label',
    format('median of 27, 29, 31: %s', s);
  assert (s->>'valid_until')::timestamptz = '2026-09-14 18:15+00' and s->>'date' = '2026-09-14', format('%s', s);

  perform pg_temp.set_hour('open-meteo', '2026-09-14 16:00+00', 'feels_like_c', '34');
  s := app.sun_and_heat('leamington', v_now, 'en');
  assert (s->>'feels_max')::int = 31 and s->>'heat_level' = 'caution' and s->>'heat_label' = 'Caution'
     and s->>'uv_label' = 'Very high', format('median of 34, 29, 31: %s', s);

  -- One provider's UV is not enough.
  update local_hourly set uv_index = null where provider = 'weatherapi';
  s := app.sun_and_heat('leamington', v_now, 'es');
  assert not s ? 'uv_max' and not s ? 'uv_level' and not s ? 'uv_peak_hour' and s->>'heat_level' = 'caution',
    format('UV from one provider is left out: %s', s);
  -- Nor one provider's feels-like: nothing qualifies.
  update local_hourly set feels_like_c = null where provider <> 'open-meteo';
  assert app.sun_and_heat('leamington', v_now, 'es') is null, 'nothing qualifies';

  -- Stale fetches, and after dark.
  delete from local_hourly;
  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 13:00+00', 30, 25, 27, 0, 3, 'clear', v_f);
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 13:00+00', 30, 25, 29, 0, 2, 'clear', v_f);
  assert app.sun_and_heat('leamington', v_now + interval '5 hours 1 minute', 'es') is null, 'fetched over 5 hours ago';
  update local_hourly set fetched_at = '2026-09-14 23:15+00';
  assert app.sun_and_heat('leamington', '2026-09-14 23:40+00', 'es') is null, '7:40pm: no daylight left today';
  assert app.sun_and_heat('windsor', v_now, 'es') is null;

  delete from local_hourly;
  raise notice 'PASS sun and heat: UV median, WHO category, peak hour, heat bands, one provider is not enough';
end $$;

-- ---------------------------------------------------------------------------
-- Air quality
-- ---------------------------------------------------------------------------
do $$
declare a jsonb; v_now timestamptz := '2026-09-14 13:40+00'; v_f timestamptz := '2026-09-14 13:20+00';
begin
  assert app.aqi_level(0) = 'good' and app.aqi_level(50) = 'good' and app.aqi_level(51) = 'moderate'
     and app.aqi_level(100) = 'moderate' and app.aqi_level(101) = 'sensitive' and app.aqi_level(150) = 'sensitive'
     and app.aqi_level(151) = 'unhealthy' and app.aqi_level(200) = 'unhealthy' and app.aqi_level(201) = 'very_unhealthy'
     and app.aqi_level(300) = 'very_unhealthy' and app.aqi_level(301) = 'hazardous' and app.aqi_level(500) = 'hazardous',
    'EPA AQI categories';

  perform pg_temp.air('open-meteo', '2026-09-14 13:00+00', 40, 8.0, v_f);
  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 60, 12.0, v_f);
  a := app.air_quality('leamington', v_now, 'es');
  assert (a->>'us_aqi')::int = 50 and a->>'level' = 'good' and a->>'label' = 'Buena' and (a->>'pm2_5')::numeric = 10.0,
    format('medians; good and moderate are one step apart, so one answer: %s', a);
  assert not (a->>'range')::boolean and (a->>'providers')::int = 2
     and (a->>'observed_at')::timestamptz = '2026-09-14 13:00+00'
     and (a->>'valid_until')::timestamptz = '2026-09-14 15:00+00', format('%s', a);
  assert app.air_quality('leamington', v_now, 'en')->>'label' = 'Good';

  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 101, 36.0, v_f);
  a := app.air_quality('leamington', v_now, 'en');
  assert (a->>'range')::boolean and a->>'level_min' = 'good' and a->>'level_max' = 'sensitive'
     and a->>'label_max' = 'Unhealthy for sensitive groups'
     and (a->>'aqi_min')::int = 40 and (a->>'aqi_max')::int = 101
     and not a ? 'us_aqi' and not a ? 'level' and not a ? 'pm2_5', format('two steps apart is a range: %s', a);
  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 160, 60.0, v_f);
  a := app.air_quality('leamington', v_now, 'es');
  assert a->>'level_max' = 'unhealthy' and a->>'label_min' = 'Buena', format('%s', a);
  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 100, 35.0, v_f);
  a := app.air_quality('leamington', v_now, 'es');
  assert (a->>'us_aqi')::int = 70 and a->>'level' = 'moderate', format('good and moderate: one step: %s', a);

  -- Within 30 minutes of each other.
  perform pg_temp.air('open-meteo', '2026-09-14 12:45+00', 40, 8.0, v_f);
  assert app.air_quality('leamington', v_now, 'es') is not null, '30 minutes apart still counts';
  perform pg_temp.air('open-meteo', '2026-09-14 12:44+00', 40, 8.0, v_f);
  assert app.air_quality('leamington', v_now, 'es') is null, '31 minutes apart is not the same moment';
  -- Observed within 2 hours, fetched within 2 hours, not from the future.
  perform pg_temp.air('open-meteo', '2026-09-14 11:35+00', 40, 8.0, v_f);
  perform pg_temp.air('weatherapi', '2026-09-14 11:35+00', 40, 8.0, v_f);
  assert app.air_quality('leamington', v_now, 'es') is null, 'observed over 2 hours ago';
  perform pg_temp.air('open-meteo', '2026-09-14 13:00+00', 40, 8.0, '2026-09-14 11:30+00');
  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 40, 8.0, v_f);
  assert app.air_quality('leamington', v_now, 'es') is null, 'one provider fetched over 2 hours ago leaves one';
  perform pg_temp.air('open-meteo', '2026-09-14 13:55+00', 40, 8.0, v_f);
  assert app.air_quality('leamington', v_now, 'es') is null, 'an observation 15 minutes ahead is not trusted';
  delete from local_air_quality where provider = 'open-meteo';
  assert app.air_quality('leamington', v_now, 'es') is null, 'one provider is not enough';
  assert app.air_quality('windsor', v_now, 'es') is null;

  delete from local_air_quality;
  raise notice 'PASS air quality: medians, EPA category, a range when two steps apart, same moment and staleness';
end $$;

-- ---------------------------------------------------------------------------
-- The working day
-- ---------------------------------------------------------------------------
do $$
declare w jsonb; v_now timestamptz := '2026-09-14 09:30+00'; v_f timestamptz := '2026-09-14 09:15+00';
begin
  -- 5:30am local. The window is 6am (10:00 UTC) to 6pm (22:00 UTC).
  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 09:00+00', 30, 15, 20, 10, 3, 'clear', v_f);
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 09:00+00', 30, 15, 20, 10, 3, 'clear', v_f);
  perform pg_temp.set_hour(null, '2026-09-14 10:00+00', 'temp_c', '10');
  -- Outside the window: 5am is cold, 6pm is hot and wet.
  perform pg_temp.set_hour(null, '2026-09-14 09:00+00', 'temp_c', '2');
  perform pg_temp.set_hour(null, '2026-09-14 22:00+00', 'temp_c', '30');
  perform pg_temp.set_hour(null, '2026-09-14 22:00+00', 'precip_prob', '90');

  w := app.workday_outlook('leamington', v_now, 'es');
  assert w->>'day' = 'today' and w->>'date' = '2026-09-14' and w->>'place' = 'Leamington', format('%s', w);
  assert (w->>'morning_temp')::int = 10 and (w->>'high')::int = 15 and w->'rain_hours' = '[]'::jsonb,
    format('6am median; the high and rain only inside the window: %s', w);
  assert w->>'uv_level' = 'moderate' and (w->>'uv_max')::int = 3 and w->>'heat_level' = 'none' and (w->>'feels_max')::int = 20,
    format('%s', w);
  assert w->'flags' = '["cold_morning"]'::jsonb, format('morning_temp 10 is a cold morning: %s', w->'flags');
  assert (w->>'valid_until')::timestamptz = '2026-09-14 14:15+00', format('%s', w->'valid_until');

  -- Each flag at its threshold.
  perform pg_temp.set_hour(null, '2026-09-14 10:00+00', 'temp_c', '11');
  perform pg_temp.set_hour(null, '2026-09-14 15:00+00', 'precip_prob', '50');
  perform pg_temp.set_hour(null, '2026-09-14 16:00+00', 'uv_index', '6');
  perform pg_temp.set_hour(null, '2026-09-14 17:00+00', 'feels_like_c', '30');
  w := app.workday_outlook('leamington', v_now, 'en');
  assert (w->>'morning_temp')::int = 11 and w->'rain_hours' = '["11am"]'::jsonb
     and w->>'uv_level' = 'high' and w->>'heat_level' = 'caution' and w->>'heat_label' = 'Caution',
    format('%s', w);
  assert w->'flags' = '["rain", "uv_high", "heat"]'::jsonb, format('11 is not cold; 50, 6 and 30 flag: %s', w->'flags');

  -- Just below each threshold.
  perform pg_temp.set_hour(null, '2026-09-14 15:00+00', 'precip_prob', '49');
  perform pg_temp.set_hour(null, '2026-09-14 16:00+00', 'uv_index', '5');
  perform pg_temp.set_hour(null, '2026-09-14 17:00+00', 'feels_like_c', '29');
  w := app.workday_outlook('leamington', v_now, 'es');
  assert w->'flags' = '[]'::jsonb and w->>'uv_level' = 'moderate' and w->>'heat_level' = 'none', format('%s', w);

  -- 6am with one provider has no median: 7am's stands in.
  delete from local_hourly where provider = 'weatherapi' and hour_start = '2026-09-14 10:00+00';
  perform pg_temp.set_hour(null, '2026-09-14 11:00+00', 'temp_c', '9');
  w := app.workday_outlook('leamington', v_now, 'es');
  assert (w->>'morning_temp')::int = 9 and w->'flags' = '["cold_morning"]'::jsonb, format('7am: %s', w);

  -- A missing input gives no flag, even when the one provider says UV 9.
  update local_hourly set uv_index = null where provider = 'weatherapi';
  perform pg_temp.set_hour('open-meteo', '2026-09-14 16:00+00', 'uv_index', '9');
  w := app.workday_outlook('leamington', v_now, 'es');
  assert not w ? 'uv_max' and not w ? 'uv_level' and not (w->'flags') ? 'uv_high', format('%s', w);
  -- No rain chance from two providers: no rain_hours at all, not an empty list.
  update local_hourly set precip_prob = null where provider = 'weatherapi';
  w := app.workday_outlook('leamington', v_now, 'es');
  assert not w ? 'rain_hours' and not (w->'flags') ? 'rain', format('%s', w);

  -- Mid-morning: today's window from the current hour, so no morning temperature.
  w := app.workday_outlook('leamington', '2026-09-14 13:40+00', 'es');
  assert w->>'day' = 'today' and not w ? 'morning_temp' and (w->>'high')::int = 15, format('9:40am: %s', w);

  -- One provider in all: nothing.
  delete from local_hourly where provider = 'weatherapi';
  assert app.workday_outlook('leamington', v_now, 'es') is null, 'one provider is nothing';
  assert app.workday_outlook('nowhere', v_now, 'es') is null;

  -- 5:59pm is still today (the 5pm hour); 6pm is tomorrow's window.
  delete from local_hourly;
  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 21:00+00', 30, 8, 8, 10, 0, 'clear', '2026-09-14 21:15+00');
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 21:00+00', 30, 8, 8, 10, 0, 'clear', '2026-09-14 21:15+00');
  perform pg_temp.set_hour(null, '2026-09-15 10:00+00', 'temp_c', '9');
  w := app.workday_outlook('leamington', '2026-09-14 21:59+00', 'es');
  assert w->>'day' = 'today' and w->>'date' = '2026-09-14' and not w ? 'morning_temp' and (w->>'high')::int = 8, format('5:59pm: %s', w);
  w := app.workday_outlook('leamington', '2026-09-14 22:00+00', 'es');
  assert w->>'day' = 'tomorrow' and w->>'date' = '2026-09-15' and (w->>'morning_temp')::int = 9
     and w->>'uv_level' = 'low' and w->'flags' = '["cold_morning"]'::jsonb, format('6pm: tomorrow: %s', w);

  delete from local_hourly;
  raise notice 'PASS workday: window today and tomorrow, each flag at its edge, missing inputs give no flag';
end $$;

-- ---------------------------------------------------------------------------
-- Clima and home payloads
-- ---------------------------------------------------------------------------
do $$
declare w jsonb; t jsonb; x jsonb; v_client uuid := '99990000-0000-4000-8000-0000000000b1';
  v_now timestamptz := '2026-09-14 13:40+00'; v_f timestamptz := '2026-09-14 13:15+00';
begin
  perform pg_temp.fill('leamington', 'open-meteo', '2026-09-14 13:00+00', 30, 22, 31, 10, 6, 'clear', v_f);
  perform pg_temp.fill('leamington', 'weatherapi', '2026-09-14 13:00+00', 30, 23, 30, 20, 6, 'clear', v_f);
  perform pg_temp.air('open-meteo', '2026-09-14 13:00+00', 30, 6.0, v_f);
  perform pg_temp.air('weatherapi', '2026-09-14 13:15+00', 35, 7.0, v_f);

  w := app.weather_page(v_client, v_now);
  select e into t from jsonb_array_elements(w->'local') e where e->>'key' = 'leamington';
  assert jsonb_array_length(t->'hourly'->'hours') = 12 and (t->'hourly'->'hours'->0->>'temp_c')::int = 23
     and t->'hourly'->'hours'->0->>'label' = 'Clear', format('hourly in the client language: %s', t->'hourly');
  assert t->'sun_heat'->>'uv_level' = 'high' and t->'sun_heat'->>'heat_level' = 'caution', format('%s', t->'sun_heat');
  assert (t->'air'->>'us_aqi')::int = 33 and t->'air'->>'label' = 'Good', format('%s', t->'air');
  assert t ? 'now' and t ? 'days', 'the 0040 fields stay';
  select e into t from jsonb_array_elements(w->'local') e where e->>'key' = 'windsor';
  assert t ? 'hourly' and t->'hourly' = 'null'::jsonb and t->'sun_heat' = 'null'::jsonb and t->'air' = 'null'::jsonb,
    format('Windsor has nothing: %s', t);

  x := app.home_more(v_client, v_now);
  assert x->'workday'->>'day' = 'today' and x->'workday'->'flags' = '["uv_high", "heat"]'::jsonb
     and x->'workday'->>'uv_label' = 'High', format('workday: %s', x->'workday');
  assert x ? 'member' and x ? 'home_timezone', 'the 0041 fields stay';
  x := app.home_more(v_client, v_now + interval '6 hours');
  assert x ? 'workday' and x->'workday' = 'null'::jsonb, format('stale is nothing: %s', x->'workday');
  raise notice 'PASS round 4 on clima and home';
end $$;

rollback;
