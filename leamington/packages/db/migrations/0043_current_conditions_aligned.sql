-- 0043_current_conditions_aligned.sql
-- "Ahora" compares readings taken at the same moment, and one outlier no
-- longer turns the temperature into a range.
--
-- In production the first morning showed Leamington as "11–16°": Open-Meteo at
-- 13:30 (15.6°), WeatherAPI at 13:15 (13.5°) and OpenWeather at 13:00 (11.1°).
-- The morning warm-up between those times was read as disagreement. And
-- Morelia's 14.5° and 14.8° became "11–15°" because a third provider said 11.4°.
--
-- Now (0040 otherwise unchanged):
-- - only readings observed within 20 minutes of the newest fresh reading are
--   combined, so the providers describe the same moment;
-- - the temperature is the median when at least two of them agree within 2°
--   (rounded), and a range only when no two agree. With two providers that is
--   the rule as before; with three, one outlier cannot move the median off the
--   two that agree.

create or replace function app.current_summary(p_municipality_id bigint, p_place_id bigint, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  with fresh as (
    select cc.*
      from current_conditions cc
     where ((p_municipality_id is not null and cc.municipality_id = p_municipality_id)
         or (p_place_id is not null and cc.place_id = p_place_id))
       and cc.observed_at >= p_now - interval '90 minutes'
       and cc.observed_at <= p_now + interval '10 minutes'
       and cc.fetched_at >= p_now - interval '90 minutes'
  ), used as (
    -- The same moment: within 20 minutes of the newest fresh reading.
    select f.* from fresh f
     where f.observed_at >= (select max(observed_at) from fresh) - interval '20 minutes'
  ), temps as (
    select round(u.temp_c) as r, lead(round(u.temp_c)) over (order by u.temp_c, u.provider) as next_r from used u
  ), sky as (
    select u.condition from used u where u.condition is not null
     group by u.condition
     order by count(*) desc,
              array_position(array['storm', 'snow', 'rain', 'drizzle', 'fog', 'cloudy', 'partly_cloudy', 'clear'], u.condition)
     limit 1
  ), daylight as (
    select u.is_day from used u where u.is_day is not null
     group by u.is_day
     order by count(*) desc, max(u.observed_at) desc
     limit 1
  ), agg as (
    select count(*)::int as n,
           percentile_cont(0.5) within group (order by u.temp_c) as temp,
           min(u.temp_c) as temp_min, max(u.temp_c) as temp_max,
           percentile_cont(0.5) within group (order by u.feels_like_c) as feels, count(u.feels_like_c) as feels_n,
           percentile_cont(0.5) within group (order by u.humidity) as humidity, count(u.humidity) as humidity_n,
           percentile_cont(0.5) within group (order by u.wind_kph) as wind, count(u.wind_kph) as wind_n,
           min(u.observed_at) as oldest,
           coalesce((select bool_or(t.next_r - t.r <= 2) from temps t), false) as agree
      from used u
  )
  select case when agg.n >= 2 then jsonb_strip_nulls(jsonb_build_object(
           'temp_c', round(agg.temp::numeric)::int,
           'temp', case when agg.agree
                        then format('%s°', round(agg.temp::numeric))
                        else format('%s–%s°', round(agg.temp_min), round(agg.temp_max)) end,
           'feels_like', case when agg.feels_n >= 2 then round(agg.feels::numeric)::int end,
           'humidity', case when agg.humidity_n >= 2 then round(agg.humidity::numeric)::int end,
           'wind_kph', case when agg.wind_n >= 2 then round(agg.wind::numeric)::int end,
           'condition', sky.condition,
           'label', app.condition_label(sky.condition, p_lang),
           'is_day', daylight.is_day,
           'observed_at', agg.oldest,
           'valid_until', agg.oldest + interval '90 minutes',
           'providers', agg.n)) end
    from agg left join sky on true left join daylight on true
$$;
