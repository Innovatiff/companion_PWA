-- 0040_current_conditions.sql
-- "Ahora": the weather right now, from the same three providers as the forecast,
-- and the client's easy-read text size.
--
-- One row per place and provider holds that provider's latest observation. The
-- page shows it only while at least two providers observed within 90 minutes:
-- the median temperature, a range where they disagree by more than 2 degrees,
-- and the sky most of them report. One provider, or none, shows nothing.

-- ---------------------------------------------------------------------------
-- Current conditions
-- ---------------------------------------------------------------------------
create table current_conditions (
  id               bigint generated always as identity primary key,
  municipality_id  bigint references municipalities(id) on delete cascade,
  place_id         bigint references local_places(id) on delete cascade,
  provider         forecast_provider not null,
  observed_at      timestamptz not null,           -- the provider's own observation or model time
  temp_c           numeric not null,
  feels_like_c     numeric,
  humidity         numeric check (humidity between 0 and 100),
  wind_kph         numeric check (wind_kph >= 0),
  condition        text check (condition in ('clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle', 'rain', 'storm', 'snow')),
  is_day           boolean,
  fetched_at       timestamptz not null default now(),
  check ((municipality_id is null) <> (place_id is null))
);
create unique index current_conditions_municipality_provider on current_conditions (municipality_id, provider)
  where municipality_id is not null;
create unique index current_conditions_place_provider on current_conditions (place_id, provider)
  where place_id is not null;
alter table current_conditions enable row level security;
create policy current_conditions_read on current_conditions for select using (auth.role() in ('authenticated', 'service_role'));

-- A short word for the sky, in the client's language.
create or replace function app.condition_label(p_condition text, p_lang text)
returns text language sql immutable as $$
  select case when p_lang = 'en' then
    case p_condition when 'clear' then 'Clear' when 'partly_cloudy' then 'Partly cloudy' when 'cloudy' then 'Cloudy'
                     when 'fog' then 'Fog' when 'drizzle' then 'Drizzle' when 'rain' then 'Rain'
                     when 'storm' then 'Storm' when 'snow' then 'Snow' end
  else
    case p_condition when 'clear' then 'Despejado' when 'partly_cloudy' then 'Parcialmente nublado' when 'cloudy' then 'Nublado'
                     when 'fog' then 'Niebla' when 'drizzle' then 'Llovizna' when 'rain' then 'Lluvia'
                     when 'storm' then 'Tormenta' when 'snow' then 'Nieve' end
  end
$$;

-- The weather now at one town or one local place: providers that observed within
-- 90 minutes and were fetched within 90 minutes (an observation stamped more than
-- 10 minutes ahead is not trusted). Null below two providers. Humidity, feeling
-- and wind appear only when at least two of them report it. The sky is the most
-- common report, the more severe on a tie; day or night is the majority, the
-- newest observation on a tie.
create or replace function app.current_summary(p_municipality_id bigint, p_place_id bigint, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  with used as (
    select cc.*
      from current_conditions cc
     where ((p_municipality_id is not null and cc.municipality_id = p_municipality_id)
         or (p_place_id is not null and cc.place_id = p_place_id))
       and cc.observed_at >= p_now - interval '90 minutes'
       and cc.observed_at <= p_now + interval '10 minutes'
       and cc.fetched_at >= p_now - interval '90 minutes'
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
           min(u.observed_at) as oldest
      from used u
  )
  select case when agg.n >= 2 then jsonb_strip_nulls(jsonb_build_object(
           'temp_c', round(agg.temp::numeric)::int,
           'temp', case when round(agg.temp_max) - round(agg.temp_min) <= 2
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

-- ---------------------------------------------------------------------------
-- Clima: every town and local place carries 'now' (0036 otherwise unchanged)
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
-- Home: the weather now at home, in Leamington, and in each watched town (0039 otherwise unchanged)
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
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_f := app.football_page(p_client_id, p_now);
  v_w := app.weather_page(p_client_id, p_now);

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
        order by s.start_date, s.event_name limit 1) end);
end $$;

-- ---------------------------------------------------------------------------
-- Easy read: the client's text size
-- ---------------------------------------------------------------------------
alter table clients add column text_size text not null default 'normal' check (text_size in ('normal', 'large'));

-- Sets an active client's text size and returns what is stored; null when there
-- is no active client with that id. An unknown size is refused.
create or replace function app.set_text_size(p_client_id uuid, p_size text)
returns text
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_size text;
begin
  if p_size is null or p_size not in ('normal', 'large') then
    raise exception 'unknown text size %', p_size using errcode = 'check_violation';
  end if;
  update clients set text_size = p_size where id = p_client_id and active
  returning text_size into v_size;
  return v_size;
end $$;
