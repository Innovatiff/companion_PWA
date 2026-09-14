-- 0044_workday_hourly_air.sql
-- Round 4, "Tu día de trabajo": the hours ahead, sun and heat, air quality and
-- the working day in icons, for the local places (Leamington, Windsor).
--
-- Every number here comes from two or more providers. One provider, a stale
-- fetch, or providers that disagree give nothing (or a range), never a guess.
--
-- ---------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------
-- Hourly (app.hourly_outlook). Provider rows fetched within 5 hours. An hour
--   counts when at least two providers gave it:
--   - temp_c is the median when at least two of them agree within 2° (rounded;
--     the 0043 rule), otherwise the hour carries no temperature;
--   - rain_prob is the median when two or more gave one;
--   - condition is the most common, the more severe on a tie;
--   - is_day is the majority, none on a tie.
--   An hour with neither a temperature nor a rain chance is left out. Fewer
--   than 4 hours left: null. valid_until is the oldest fetch used plus 5 hours.
--
-- Sun and heat (app.sun_and_heat). The place's remaining daylight hours today
--   (each provider's own is_day). uv_max is the median of each provider's
--   highest UV index, from two or more providers; uv_peak_hour is the hour
--   whose median UV (two or more providers) is highest, the earliest on a tie.
--   feels_max likewise from each provider's highest feels-like. Levels use the
--   rounded value:
--   - UV (WHO): low 0-2, moderate 3-5, high 6-7, very_high 8-10, extreme 11+;
--   - heat (feels-like, in the Environment Canada humidex style): none < 30,
--     caution 30-34, high 35-39, extreme 40+.
--   Classifications only, no advice.
--
-- Air (app.air_quality). Rows observed within 2 hours (and not more than 10
--   minutes ahead), fetched within 2 hours, and within 30 minutes of the newest
--   of them; two or more, else null. The median US AQI and PM2.5, with the EPA
--   category: good 0-50, moderate 51-100, sensitive 101-150, unhealthy
--   151-200, very_unhealthy 201-300, hazardous 301+. When the providers'
--   categories are more than one step apart there is no single answer: the
--   result carries aqi_min/aqi_max and level_min/level_max instead of us_aqi,
--   pm2_5 and level. valid_until is the oldest observation plus 2 hours.
--
-- Workday (app.workday_outlook). The working window is 6am to 6pm local
--   (the hours starting 6am through 5pm). Before 6pm it is today's, from the
--   current hour; from 6pm on it is tomorrow's (day "tomorrow"). Built from
--   app.hourly_outlook (24 hours) and the sun-and-heat rules over the window.
--   - morning_temp: the 6am hour's temp_c, or the 7am hour's when 6am has none;
--   - high: the highest temp_c among the window's hours;
--   - rain_hours: the window's hour labels whose rain_prob >= 50 (present only
--     when at least one window hour has a rain_prob);
--   - uv_level, uv_max, heat_level, feels_max: as in sun and heat, over the
--     window's daylight hours.
--   Flags, each only from its qualifying input; a flag whose input is missing
--   is absent, so an absent flag is NOT a finding (check the input field):
--   - cold_morning: morning_temp is present and morning_temp <= 10
--   - rain:         at least one window hour has rain_prob >= 50
--   - uv_high:      uv_max is present and uv_max >= 6 (rounded)
--   - heat:         heat_level is caution, high or extreme (feels_max >= 30, rounded)
--   - windy:        not produced; hourly wind is not stored.
--   Null when neither the hours nor sun and heat give anything for the window.
--   valid_until is the earliest valid_until of its inputs.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table local_hourly (
  id            bigint generated always as identity primary key,
  place_id      bigint not null references local_places(id) on delete cascade,
  provider      forecast_provider not null,
  hour_start    timestamptz not null check (extract(epoch from hour_start)::bigint % 3600 = 0),
  temp_c        numeric not null,
  feels_like_c  numeric,
  precip_prob   numeric check (precip_prob between 0 and 100),
  uv_index      numeric check (uv_index >= 0),
  condition     text check (condition in ('clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'storm', 'snow')),
  is_day        boolean,
  fetched_at    timestamptz not null default now(),
  unique (place_id, provider, hour_start)
);

create table local_air_quality (
  id           bigint generated always as identity primary key,
  place_id     bigint not null references local_places(id) on delete cascade,
  provider     forecast_provider not null,
  observed_at  timestamptz not null,
  us_aqi       integer not null check (us_aqi >= 0),
  pm2_5        numeric check (pm2_5 >= 0),
  fetched_at   timestamptz not null default now(),
  unique (place_id, provider)
);

alter table local_hourly enable row level security;
alter table local_air_quality enable row level security;
create policy local_hourly_read on local_hourly for select using (auth.role() in ('authenticated', 'service_role'));
create policy local_air_quality_read on local_air_quality for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- Classifications
-- ---------------------------------------------------------------------------
create or replace function app.uv_level(p_uv numeric)
returns text language sql immutable as $$
  select case when p_uv is null then null
              when round(p_uv) <= 2 then 'low' when round(p_uv) <= 5 then 'moderate'
              when round(p_uv) <= 7 then 'high' when round(p_uv) <= 10 then 'very_high'
              else 'extreme' end
$$;

create or replace function app.uv_label(p_level text, p_lang text)
returns text language sql immutable as $$
  select case when p_lang = 'en' then
    case p_level when 'low' then 'Low' when 'moderate' then 'Moderate' when 'high' then 'High'
                 when 'very_high' then 'Very high' when 'extreme' then 'Extreme' end
  else
    case p_level when 'low' then 'Bajo' when 'moderate' then 'Moderado' when 'high' then 'Alto'
                 when 'very_high' then 'Muy alto' when 'extreme' then 'Extremo' end
  end
$$;

create or replace function app.heat_level(p_feels numeric)
returns text language sql immutable as $$
  select case when p_feels is null then null
              when round(p_feels) < 30 then 'none' when round(p_feels) < 35 then 'caution'
              when round(p_feels) < 40 then 'high' else 'extreme' end
$$;

-- "none" has no label: a band, not a reassurance.
create or replace function app.heat_label(p_level text, p_lang text)
returns text language sql immutable as $$
  select case when p_lang = 'en' then
    case p_level when 'caution' then 'Caution' when 'high' then 'High heat' when 'extreme' then 'Extreme heat' end
  else
    case p_level when 'caution' then 'Precaución' when 'high' then 'Calor alto' when 'extreme' then 'Calor extremo' end
  end
$$;

create or replace function app.aqi_level(p_aqi numeric)
returns text language sql immutable as $$
  select case when p_aqi is null then null
              when round(p_aqi) <= 50 then 'good' when round(p_aqi) <= 100 then 'moderate'
              when round(p_aqi) <= 150 then 'sensitive' when round(p_aqi) <= 200 then 'unhealthy'
              when round(p_aqi) <= 300 then 'very_unhealthy' else 'hazardous' end
$$;

create or replace function app.aqi_step(p_level text)
returns integer language sql immutable as $$
  select array_position(array['good', 'moderate', 'sensitive', 'unhealthy', 'very_unhealthy', 'hazardous'], p_level) - 1
$$;

-- The EPA category names (AirNow's Spanish).
create or replace function app.aqi_label(p_level text, p_lang text)
returns text language sql immutable as $$
  select case when p_lang = 'en' then
    case p_level when 'good' then 'Good' when 'moderate' then 'Moderate'
                 when 'sensitive' then 'Unhealthy for sensitive groups' when 'unhealthy' then 'Unhealthy'
                 when 'very_unhealthy' then 'Very unhealthy' when 'hazardous' then 'Hazardous' end
  else
    case p_level when 'good' then 'Buena' when 'moderate' then 'Moderada'
                 when 'sensitive' then 'Dañina a la salud para grupos sensibles' when 'unhealthy' then 'Dañina a la salud'
                 when 'very_unhealthy' then 'Muy dañina a la salud' when 'hazardous' then 'Peligrosa' end
  end
$$;

-- "3pm" in the place's time zone.
create or replace function app.local_hour_label(p_at timestamptz, p_tz text)
returns text language sql stable as $$
  select to_char(p_at at time zone p_tz, 'FMHH12am')
$$;

-- The start of the hour containing p_at (independent of the session time zone).
create or replace function app.hour_floor(p_at timestamptz)
returns timestamptz language sql immutable as $$
  select to_timestamp(floor(extract(epoch from p_at) / 3600) * 3600)
$$;

-- ---------------------------------------------------------------------------
-- Hour medians (shared by the hourly outlook)
-- ---------------------------------------------------------------------------
create or replace function app.local_hour_medians(p_place_id bigint, p_from timestamptz, p_to timestamptz, p_now timestamptz)
returns table (hour_start timestamptz, providers integer, temp_c integer, rain_prob integer,
               condition text, is_day boolean, oldest_fetch timestamptz)
language sql stable set search_path = public, app as $$
  with used as (
    select h.* from local_hourly h
     where h.place_id = p_place_id
       and h.hour_start >= p_from and h.hour_start < p_to
       and h.fetched_at >= p_now - interval '5 hours'
  ), per_hour as (
    select u.hour_start, count(*)::int as n,
           percentile_cont(0.5) within group (order by u.temp_c) as temp,
           percentile_cont(0.5) within group (order by u.precip_prob) as prob, count(u.precip_prob)::int as prob_n,
           count(*) filter (where u.is_day) as day_n, count(*) filter (where not u.is_day) as night_n,
           min(u.fetched_at) as oldest
      from used u group by u.hour_start
  )
  select p.hour_start, p.n,
         case when agree.ok then round(p.temp::numeric)::int end,
         case when p.prob_n >= 2 then round(p.prob::numeric)::int end,
         sky.condition,
         case when p.day_n > p.night_n then true when p.night_n > p.day_n then false end,
         p.oldest
    from per_hour p
    cross join lateral (
      select coalesce(bool_or(t.next_r - t.r <= 2), false) as ok
        from (select round(u.temp_c) as r, lead(round(u.temp_c)) over (order by u.temp_c, u.provider) as next_r
                from used u where u.hour_start = p.hour_start) t) agree
    left join lateral (
      select u.condition from used u
       where u.hour_start = p.hour_start and u.condition is not null
       group by u.condition
       order by count(*) desc,
                array_position(array['storm', 'snow', 'rain', 'drizzle', 'fog', 'cloudy', 'partly_cloudy', 'clear'], u.condition)
       limit 1) sky on true
   where p.n >= 2
$$;

-- ---------------------------------------------------------------------------
-- Hour by hour (feature 16)
-- ---------------------------------------------------------------------------
create or replace function app.hourly_outlook(p_place_key text, p_now timestamptz, p_hours int default 12, p_lang text default 'es')
returns jsonb language plpgsql stable set search_path = public, app as $$
declare
  v_place local_places%rowtype;
  v_from  timestamptz := app.hour_floor(p_now);
begin
  if p_hours is null or p_hours < 1 or p_hours > 24 then
    raise exception 'p_hours must be between 1 and 24 (got %)', p_hours using errcode = 'invalid_parameter_value';
  end if;
  select * into v_place from local_places where key = p_place_key and active;
  if not found then
    return null;
  end if;

  return (
    with h as (
      select m.* from app.local_hour_medians(v_place.id, v_from, v_from + make_interval(hours => p_hours), p_now) m
       where m.temp_c is not null or m.rain_prob is not null
    )
    select case when count(*) >= 4 then jsonb_build_object(
             'place', v_place.name,
             'key', v_place.key,
             'timezone', v_place.timezone,
             'hours', jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'hour_start', h.hour_start,
                        'hour', app.local_hour_label(h.hour_start, v_place.timezone),
                        'local_hour', extract(hour from h.hour_start at time zone v_place.timezone)::int,
                        'temp_c', h.temp_c,
                        'rain_prob', h.rain_prob,
                        'condition', h.condition,
                        'label', app.condition_label(h.condition, p_lang),
                        'is_day', h.is_day)) order by h.hour_start),
             'rain_hours', coalesce(jsonb_agg(app.local_hour_label(h.hour_start, v_place.timezone) order by h.hour_start)
                                      filter (where h.rain_prob >= 50), '[]'::jsonb),
             'max_temp', max(h.temp_c),
             'min_temp', min(h.temp_c),
             'valid_until', min(h.oldest_fetch) + interval '5 hours') end
      from h);
end $$;

-- ---------------------------------------------------------------------------
-- Sun and heat (feature 17)
-- ---------------------------------------------------------------------------
-- Over the daylight hours of one place between p_from and p_to. Shared by
-- app.sun_and_heat (the rest of today) and app.workday_outlook (the window).
create or replace function app.sun_heat_between(p_place_id bigint, p_tz text, p_from timestamptz, p_to timestamptz,
                                                p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  with used as (
    select h.* from local_hourly h
     where h.place_id = p_place_id
       and h.hour_start >= p_from and h.hour_start < p_to
       and h.fetched_at >= p_now - interval '5 hours'
       and h.is_day
  ), uv_p as (
    select u.provider, max(u.uv_index) as mx, min(u.fetched_at) as f from used u where u.uv_index is not null group by u.provider
  ), feels_p as (
    select u.provider, max(u.feels_like_c) as mx, min(u.fetched_at) as f from used u where u.feels_like_c is not null group by u.provider
  ), uv as (
    select count(*)::int as n, percentile_cont(0.5) within group (order by mx) as v, min(f) as f from uv_p
  ), feels as (
    select count(*)::int as n, percentile_cont(0.5) within group (order by mx) as v, min(f) as f from feels_p
  ), peak as (
    select u.hour_start from used u where u.uv_index is not null
     group by u.hour_start having count(*) >= 2
     order by percentile_cont(0.5) within group (order by u.uv_index) desc, u.hour_start
     limit 1
  ), r as (
    select case when uv.n >= 2 then round(uv.v::numeric)::int end as uv_max,
           case when feels.n >= 2 then round(feels.v::numeric)::int end as feels_max,
           least(case when uv.n >= 2 then uv.f end, case when feels.n >= 2 then feels.f end) as oldest,
           case when uv.n >= 2 then (select peak.hour_start from peak) end as peak
      from uv, feels
  )
  select case when r.uv_max is not null or r.feels_max is not null then jsonb_strip_nulls(jsonb_build_object(
           'uv_max', r.uv_max,
           'uv_level', app.uv_level(r.uv_max),
           'uv_label', app.uv_label(app.uv_level(r.uv_max), p_lang),
           'uv_peak_hour', case when r.peak is not null then app.local_hour_label(r.peak, p_tz) end,
           'uv_peak_at', r.peak,
           'feels_max', r.feels_max,
           'heat_level', app.heat_level(r.feels_max),
           'heat_label', app.heat_label(app.heat_level(r.feels_max), p_lang),
           'valid_until', r.oldest + interval '5 hours')) end
    from r
$$;

create or replace function app.sun_and_heat(p_place_key text, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  select case when s.v is not null then s.v || jsonb_build_object('date', (p_now at time zone lp.timezone)::date) end
    from local_places lp
    cross join lateral (
      select app.sun_heat_between(lp.id, lp.timezone, app.hour_floor(p_now),
                                  (((p_now at time zone lp.timezone)::date + 1)::timestamp at time zone lp.timezone),
                                  p_now, p_lang) as v) s
   where lp.key = p_place_key and lp.active
$$;

-- ---------------------------------------------------------------------------
-- Air quality (feature 18)
-- ---------------------------------------------------------------------------
create or replace function app.air_quality(p_place_key text, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  with fresh as (
    select a.* from local_air_quality a
      join local_places lp on lp.id = a.place_id and lp.key = p_place_key and lp.active
     where a.observed_at >= p_now - interval '2 hours'
       and a.observed_at <= p_now + interval '10 minutes'
       and a.fetched_at >= p_now - interval '2 hours'
  ), used as (
    select f.* from fresh f
     where f.observed_at >= (select max(observed_at) from fresh) - interval '30 minutes'
  ), agg as (
    select count(*)::int as n,
           percentile_cont(0.5) within group (order by u.us_aqi) as aqi,
           percentile_cont(0.5) within group (order by u.pm2_5) as pm, count(u.pm2_5)::int as pm_n,
           min(u.us_aqi) as aqi_min, max(u.us_aqi) as aqi_max,
           min(u.observed_at) as oldest
      from used u
  )
  select case
    when agg.n < 2 then null
    when app.aqi_step(app.aqi_level(agg.aqi_max)) - app.aqi_step(app.aqi_level(agg.aqi_min)) > 1 then jsonb_build_object(
      'range', true,
      'aqi_min', agg.aqi_min, 'aqi_max', agg.aqi_max,
      'level_min', app.aqi_level(agg.aqi_min), 'level_max', app.aqi_level(agg.aqi_max),
      'label_min', app.aqi_label(app.aqi_level(agg.aqi_min), p_lang),
      'label_max', app.aqi_label(app.aqi_level(agg.aqi_max), p_lang),
      'observed_at', agg.oldest, 'valid_until', agg.oldest + interval '2 hours', 'providers', agg.n)
    else jsonb_strip_nulls(jsonb_build_object(
      'range', false,
      'us_aqi', round(agg.aqi::numeric)::int,
      'pm2_5', case when agg.pm_n >= 2 then round(agg.pm::numeric, 1) end,
      'level', app.aqi_level(agg.aqi::numeric),
      'label', app.aqi_label(app.aqi_level(agg.aqi::numeric), p_lang),
      'observed_at', agg.oldest, 'valid_until', agg.oldest + interval '2 hours', 'providers', agg.n))
    end
    from agg
$$;

-- ---------------------------------------------------------------------------
-- The working day in icons (feature 19)
-- ---------------------------------------------------------------------------
create or replace function app.workday_outlook(p_place_key text, p_now timestamptz, p_lang text)
returns jsonb language plpgsql stable set search_path = public, app as $$
declare
  v_place  local_places%rowtype;
  v_local  timestamp;
  v_day    text;
  v_date   date;
  v_start  timestamptz;
  v_from   timestamptz;
  v_to     timestamptz;
  v_h      jsonb;
  v_hours  jsonb;
  v_sun    jsonb;
  v_morning int;
  v_high   int;
  v_rain   jsonb;
  v_flags  jsonb := '[]'::jsonb;
begin
  select * into v_place from local_places where key = p_place_key and active;
  if not found then
    return null;
  end if;
  v_local := p_now at time zone v_place.timezone;
  if extract(hour from v_local) >= 18 then
    v_day := 'tomorrow'; v_date := v_local::date + 1;
  else
    v_day := 'today'; v_date := v_local::date;
  end if;
  v_start := (v_date + time '06:00') at time zone v_place.timezone;
  v_to    := (v_date + time '18:00') at time zone v_place.timezone;
  v_from  := greatest(v_start, app.hour_floor(p_now));

  v_h := app.hourly_outlook(p_place_key, p_now, 24, p_lang);
  select jsonb_agg(e order by (e->>'hour_start')::timestamptz) into v_hours
    from jsonb_array_elements(case when jsonb_typeof(v_h->'hours') = 'array' then v_h->'hours' else '[]'::jsonb end) e
   where (e->>'hour_start')::timestamptz >= v_from and (e->>'hour_start')::timestamptz < v_to;

  -- 6am, or 7am when 6am has no temperature.
  select (e->>'temp_c')::int into v_morning
    from jsonb_array_elements(coalesce(v_hours, '[]'::jsonb)) e
   where e ? 'temp_c' and (e->>'hour_start')::timestamptz in (v_start, v_start + interval '1 hour')
   order by (e->>'hour_start')::timestamptz limit 1;
  select max((e->>'temp_c')::int) into v_high from jsonb_array_elements(coalesce(v_hours, '[]'::jsonb)) e where e ? 'temp_c';
  select case when count(*) filter (where e ? 'rain_prob') > 0
              then coalesce(jsonb_agg(e->'hour' order by (e->>'hour_start')::timestamptz)
                              filter (where (e->>'rain_prob')::int >= 50), '[]'::jsonb) end
    into v_rain
    from jsonb_array_elements(coalesce(v_hours, '[]'::jsonb)) e;

  v_sun := app.sun_heat_between(v_place.id, v_place.timezone, v_from, v_to, p_now, p_lang);

  if v_hours is null and v_sun is null then
    return null;
  end if;

  if v_morning is not null and v_morning <= 10 then v_flags := v_flags || '"cold_morning"'; end if;
  if v_rain is not null and jsonb_array_length(v_rain) > 0 then v_flags := v_flags || '"rain"'; end if;
  if (v_sun->>'uv_max')::int >= 6 then v_flags := v_flags || '"uv_high"'; end if;
  if v_sun->>'heat_level' in ('caution', 'high', 'extreme') then v_flags := v_flags || '"heat"'; end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'place', v_place.name,
    'key', v_place.key,
    'timezone', v_place.timezone,
    'day', v_day,
    'date', v_date,
    'morning_temp', v_morning,
    'high', v_high,
    'rain_hours', v_rain,
    'uv_max', v_sun->'uv_max',
    'uv_level', v_sun->'uv_level',
    'uv_label', v_sun->'uv_label',
    'feels_max', v_sun->'feels_max',
    'heat_level', v_sun->'heat_level',
    'heat_label', v_sun->'heat_label',
    'flags', v_flags,
    'valid_until', least(case when v_hours is not null then (v_h->>'valid_until')::timestamptz end,
                         (v_sun->>'valid_until')::timestamptz)));
end $$;

-- ---------------------------------------------------------------------------
-- Clima: each local place also carries hourly, sun_heat and air (0040 otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function app.weather_page(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app, extensions
as $$
declare
  v_client     uuid;
  v_lang       text;
  v_tz         text;
  v_country    country_code;
  v_home       bigint;
  v_agency     text;
  v_agency_full text;
  v_website    text;
  v_checked    timestamptz;
  v_state      text;
  v_town_ids   bigint[];
begin
  select cl.id, cl.language::text, cl.timezone, cl.country, cl.municipality_id
    into v_client, v_lang, v_tz, v_country, v_home
    from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;

  v_town_ids := array_remove(array[v_home] ||
    coalesce((select array_agg(w.municipality_id) from client_watch_locations w where w.client_id = v_client), '{}'), null);

  select s.agency, s.agency_full, s.website_url into v_agency, v_agency_full, v_website
    from alert_sources s where s.country = v_country and s.active
   order by (s.kind = 'cap') desc limit 1;
  select h.last_ok_at into v_checked from feed_health h where h.feed = 'alerts:' || v_country::text;

  -- Our copy of the national warnings is "current" only if checked within 45 minutes.
  v_state := case
    when v_agency is null then 'not_monitored'
    when v_checked is not null and v_checked >= p_now - interval '45 minutes' then 'current'
    else 'stale' end;
  if v_agency is null then
    select s.agency, s.agency_full, s.website_url into v_agency, v_agency_full, v_website
      from alert_sources s where s.country = v_country order by (s.kind = 'cap') desc limit 1;
  end if;

  return jsonb_build_object(
    'language', v_lang,
    'timezone', v_tz,
    'has_home', v_home is not null,
    'towns', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', m.id, 'name', m.name, 'admin_region', m.admin_region, 'is_home', m.id = v_home,
                'lat', m.lat, 'lng', m.lng, 'timezone', m.timezone,
                'photo', app.town_photo(m.id) is not null,
                'now', app.current_summary(m.id, null, p_now, v_lang),
                'days', (select coalesce(jsonb_agg(d.s order by d.dt), '[]'::jsonb)
                           from (select g::date as dt, app.forecast_summary(m.id, g::date, p_now, v_lang) as s
                                   from generate_series((p_now at time zone m.timezone)::date,
                                                        (p_now at time zone m.timezone)::date + 2, interval '1 day') g) d
                          where d.s is not null))
              order by (m.id = v_home) desc, m.name)
         from municipalities m where m.id = any(v_town_ids)), '[]'::jsonb),
    -- Where they are now: Leamington and Windsor, under the same forecast rules.
    'local', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', lp.id, 'key', lp.key, 'name', lp.name, 'region', lp.region,
                'lat', lp.lat, 'lng', lp.lng, 'timezone', lp.timezone,
                'now', app.current_summary(null, lp.id, p_now, v_lang),
                -- Round 4: the next 12 hours, sun and heat, and air quality (0044 rules).
                'hourly', app.hourly_outlook(lp.key, p_now, 12, v_lang),
                'sun_heat', app.sun_and_heat(lp.key, p_now, v_lang),
                'air', app.air_quality(lp.key, p_now, v_lang),
                'days', (select coalesce(jsonb_agg(d.s order by d.dt), '[]'::jsonb)
                           from (select g::date as dt, app.local_forecast_summary(lp.id, g::date, p_now, v_lang) as s
                                   from generate_series((p_now at time zone lp.timezone)::date,
                                                        (p_now at time zone lp.timezone)::date + 2, interval '1 day') g) d
                          where d.s is not null))
              order by lp.sort, lp.name)
         from local_places lp where lp.active), '[]'::jsonb),
    'alerts_state', v_state,
    'alerts_checked_at', v_checked,
    'agency', v_agency,
    'agency_full', v_agency_full,
    'agency_url', v_website,
    'alerts_here', case when v_state = 'current' then coalesce((
       select jsonb_agg(app.alert_json(a.id) order by app.alert_severity_order(a.level), a.issued_at desc)
         from active_weather_alerts a
        where a.country = v_country
          and exists (select 1 from municipalities m
                       where m.id = any(v_town_ids)
                         and ((a.area_geog is not null and extensions.ST_Covers(a.area_geog, m.geog))
                           or (a.area_geog is null and a.center_geog is not null and a.radius_m is not null
                               and extensions.ST_DWithin(a.center_geog, m.geog, a.radius_m))))), '[]'::jsonb) end,
    'alerts_elsewhere', case when v_state = 'current' then coalesce((
       select jsonb_agg(app.alert_json(a.id) order by app.alert_severity_order(a.level), a.issued_at desc)
         from active_weather_alerts a
        where a.country = v_country
          and not exists (select 1 from municipalities m
                           where m.id = any(v_town_ids)
                             and ((a.area_geog is not null and extensions.ST_Covers(a.area_geog, m.geog))
                               or (a.area_geog is null and a.center_geog is not null and a.radius_m is not null
                                   and extensions.ST_DWithin(a.center_geog, m.geog, a.radius_m))))), '[]'::jsonb) end,
    'history', coalesce((
       select jsonb_agg(x.j order by x.issued desc)
         from (select a.issued_at as issued, app.alert_json(a.id) as j
                 from weather_alerts a
                where a.country = v_country
                  and a.issued_at >= p_now - interval '30 days'
                  and coalesce(a.msg_type, 'Alert') not in ('Ack', 'Error')
                  and a.id not in (select aw.id from active_weather_alerts aw)
                order by a.issued_at desc
                limit 20) x), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Home: plus workday, Leamington's working day (0041 otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function app.home_more(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
  v_f     jsonb;
  v_w     jsonb;
  v_b     jsonb;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_f := app.football_page(p_client_id, p_now);
  v_w := app.weather_page(p_client_id, p_now);
  v_b := app.member_badges(p_client_id, p_now);

  return jsonb_build_object(
    'home_photo', app.town_photo(v_c.municipality_id),
    'home_town', v_c.municipality,

    -- Their team's next match, while the fixtures feed is current (football_page's rules).
    'next_match', case when jsonb_typeof(v_f->'upcoming') = 'array' and jsonb_array_length(v_f->'upcoming') > 0 then v_f->'upcoming'->0 end,
    'league', v_f->>'league',
    'league_today', case when jsonb_typeof(v_f->'league_today') = 'array' and jsonb_array_length(v_f->'league_today') > 0 then
       (select jsonb_agg(m) from (select m from jsonb_array_elements(v_f->'league_today') m limit 3) s) end,
    -- The schedule is shown only while the feed is current (checked within 3 hours).
    'football_valid_until', case when v_f->>'fixtures_confirmed_at' is not null
       then (v_f->>'fixtures_confirmed_at')::timestamptz + interval '3 hours' end,

    -- The weather now, at home and in Leamington, under current_summary's rules
    -- (null below two fresh providers; each carries its own valid_until).
    'home_now', case when v_c.municipality_id is not null
       then app.current_summary(v_c.municipality_id, null, p_now, v_c.language::text) end,
    'leamington_now', (select app.current_summary(null, lp.id, p_now, v_c.language::text)
                         from local_places lp where lp.key = 'leamington'),

    -- Today's forecast for the towns they watch (not their home, which has its own
    -- line), where "today" is the town's own calendar day.
    'watch_weather', (
       select jsonb_agg(jsonb_build_object('id', (t->>'id')::bigint, 'name', t->>'name',
                                           'photo', app.town_photo((t->>'id')::bigint) is not null,
                                           'today', t->'days'->0,
                                           'now', t->'now'))
         from jsonb_array_elements(case when jsonb_typeof(v_w->'towns') = 'array' then v_w->'towns' else '[]'::jsonb end) t
        where not (t->>'is_home')::boolean
          and jsonb_typeof(t->'days') = 'array' and jsonb_array_length(t->'days') > 0
          and (t->'days'->0->>'date')::date = (p_now at time zone coalesce(t->>'timezone', v_c.timezone))::date),
    'weather_valid_until', p_now + interval '3 hours',

    -- Official warnings: only for a country whose warnings we read. Never "no alerts":
    -- current gives when we checked, and any warning for their towns; stale says so.
    'alerts', case when v_w->>'alerts_state' in ('current', 'stale') then jsonb_build_object(
       'state', v_w->>'alerts_state',
       'checked_at', v_w->'alerts_checked_at',
       'valid_until', case when v_w->>'alerts_state' = 'current' and v_w->>'alerts_checked_at' is not null
                           then (v_w->>'alerts_checked_at')::timestamptz + interval '45 minutes'
                           else p_now + interval '45 minutes' end,
       'agency', v_w->>'agency',
       'agency_url', v_w->>'agency_url',
       'here', (select jsonb_agg(jsonb_build_object('id', a->'id', 'level', a->>'level', 'event', a->>'event',
                                                    'headline', a->>'headline', 'area_desc', a->>'area_desc',
                                                    'issued_at', a->'issued_at', 'expires_at', a->'expires_at'))
                  from (select a from jsonb_array_elements(case when jsonb_typeof(v_w->'alerts_here') = 'array' then v_w->'alerts_here' else '[]'::jsonb end) a limit 2) s)) end,

    -- Their paid period.
    'plan', (select jsonb_build_object('period_end', cs.period_end, 'days_left', cs.days_left, 'status', cs.status)
               from client_status cs where cs.client_id = p_client_id and cs.status in ('active', 'due')),

    -- Whether any phone of theirs receives notifications.
    'push_subscriptions', (select count(*) from push_subscriptions ps where ps.client_id = p_client_id and ps.disabled_at is null),

    -- For parents: the next national school calendar event.
    'school_next', case when v_c.has_kids then (
       select jsonb_build_object('event_name', s.event_name, 'start_date', s.start_date, 'end_date', s.end_date,
                                 'verified_at', s.verified_at)
         from school_calendar s
        where s.country = v_c.country and coalesce(s.end_date, s.start_date) >= v_today
        order by s.start_date, s.event_name limit 1) end,

    -- Round 2: the member card, the season ring, badges, the welcome screen, and
    -- the hometown clock's time zone (null until a hometown is set).
    'member', app.member_card(p_client_id, p_now),
    'season', app.season_progress(p_client_id, p_now),
    'badges_earned', (select count(*) from jsonb_array_elements(coalesce(v_b, '[]'::jsonb)) b where (b->>'earned')::boolean),
    'badges_total', jsonb_array_length(coalesce(v_b, '[]'::jsonb)),
    'welcomed', v_c.welcomed_at is not null,
    'home_timezone', (select m.timezone from municipalities m where m.id = v_c.municipality_id),

    -- Round 4: Leamington's working day in icons (0044 rules; null without qualifying data).
    'workday', app.workday_outlook('leamington', p_now, v_c.language::text));
end $$;
