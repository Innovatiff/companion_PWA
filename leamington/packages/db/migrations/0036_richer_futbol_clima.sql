-- 0036_richer_futbol_clima.sql
-- More real content for Fútbol and Clima.
--
-- Fútbol
--   * fixtures carry the stadium (venue_name, venue_city) the provider reports.
--   * league logos are fetched server-side into league_crests, like team crests.
--   * app.fixture_json: one match object (teams, crests, stadium, round, league
--     and its logo). A score appears only once the match is finished.
--   * football_page adds the team's form and goals from its last 5 real results,
--     the league's results from the last 7 days, and today's matches in the
--     other leagues. A client without a team still gets their country's league.
--
-- Clima
--   * local_places (Leamington, Windsor) with their own forecasts
--     (local_forecasts), from the same providers under the same rules, so
--     clients see the weather where they work as well as at home.
--   * forecast summaries add rain probability and rain amount, the median of
--     at least two providers that report them.
--   * weather_page adds each town's coordinates, timezone and photo flag, and
--     the local places.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
alter table fixtures
  add column venue_name text,
  add column venue_city text;

alter table leagues add column crest_source_url text;

create table league_crests (
  league_id    bigint primary key references leagues(id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  bytes        bytea not null check (octet_length(bytes) between 1 and 50000),
  sha256       text not null,
  source_url   text not null,
  fetched_at   timestamptz not null default now()
);
alter table league_crests enable row level security;
create policy league_crests_read on league_crests for select using (auth.role() in ('authenticated', 'service_role'));

create or replace function app.league_has_crest(p_league_id bigint)
returns boolean language sql stable set search_path = public, app as $$
  select exists (select 1 from league_crests where league_id = p_league_id)
$$;

create table local_places (
  id        bigint generated always as identity primary key,
  key       text not null unique,
  name      text not null,
  region    text not null,
  lat       double precision not null,
  lng       double precision not null,
  timezone  text not null default 'America/Toronto',
  sort      integer not null default 0,
  active    boolean not null default true
);
insert into local_places (key, name, region, lat, lng, sort) values
  ('leamington', 'Leamington', 'Ontario', 42.0531, -82.5998, 1),
  ('windsor',    'Windsor',    'Ontario', 42.3149, -83.0364, 2)
on conflict (key) do nothing;

create table local_forecasts (
  id           bigint generated always as identity primary key,
  place_id     bigint not null references local_places(id) on delete cascade,
  provider     forecast_provider not null,
  target_date  date not null,
  temp_min_c   numeric,
  temp_max_c   numeric,
  precip_prob  numeric,
  precip_mm    numeric,
  fetched_at   timestamptz not null default now(),
  unique (place_id, provider, target_date)
);
alter table local_places enable row level security;
alter table local_forecasts enable row level security;
create policy local_places_read on local_places for select using (auth.role() in ('authenticated', 'service_role'));
create policy local_forecasts_read on local_forecasts for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- Forecast summaries: the same rules for towns and local places
-- ---------------------------------------------------------------------------

-- Summarise one day from provider rows: at least two providers updated within
-- 12 hours; the median, or a range when they disagree by more than 2 degrees;
-- rain only when most providers expect it; rain probability and amount only
-- when at least two providers report them.
create or replace function app.summarize_forecast(
  p_providers integer, p_median double precision, p_min numeric, p_max numeric, p_low double precision,
  p_rainy integer, p_newest timestamptz, p_prob double precision, p_prob_n integer,
  p_mm double precision, p_mm_n integer, p_date date, p_now timestamptz, p_lang text
) returns jsonb language plpgsql immutable as $$
declare
  v_temp text;
begin
  if coalesce(p_providers, 0) < 2 or p_newest < p_now - interval '12 hours' then
    return null;
  end if;
  v_temp := case when round(p_max) - round(p_min) <= 2
                 then format('%s°', round(p_median::numeric))
                 else format('%s–%s°', round(p_min), round(p_max)) end;
  return jsonb_build_object(
    'date', p_date,
    'temp', v_temp,
    'temp_max', round(p_median::numeric),
    'low', case when p_low is not null then round(p_low::numeric) end,
    'rain', p_rainy * 2 > p_providers,
    'rain_prob', case when p_prob_n >= 2 then round(p_prob::numeric) end,
    'rain_mm', case when p_mm_n >= 2 then round(p_mm::numeric, 1) end,
    'providers', p_providers,
    'text', v_temp || case when p_rainy * 2 > p_providers
                           then case when p_lang = 'en' then ', rain' else ', lluvia' end
                           else '' end);
end $$;

create or replace function app.forecast_summary(p_municipality_id bigint, p_date date, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  select app.summarize_forecast(
           count(*)::int,
           percentile_cont(0.5) within group (order by fc.temp_max_c),
           min(fc.temp_max_c), max(fc.temp_max_c),
           percentile_cont(0.5) within group (order by fc.temp_min_c),
           count(*) filter (where fc.precip_prob >= 50)::int,
           max(fc.fetched_at),
           percentile_cont(0.5) within group (order by fc.precip_prob), count(fc.precip_prob)::int,
           percentile_cont(0.5) within group (order by fc.precip_mm), count(fc.precip_mm)::int,
           p_date, p_now, p_lang)
    from forecasts fc
   where fc.municipality_id = p_municipality_id and fc.target_date = p_date and fc.temp_max_c is not null
$$;

create or replace function app.local_forecast_summary(p_place_id bigint, p_date date, p_now timestamptz, p_lang text)
returns jsonb language sql stable set search_path = public, app as $$
  select app.summarize_forecast(
           count(*)::int,
           percentile_cont(0.5) within group (order by fc.temp_max_c),
           min(fc.temp_max_c), max(fc.temp_max_c),
           percentile_cont(0.5) within group (order by fc.temp_min_c),
           count(*) filter (where fc.precip_prob >= 50)::int,
           max(fc.fetched_at),
           percentile_cont(0.5) within group (order by fc.precip_prob), count(fc.precip_prob)::int,
           percentile_cont(0.5) within group (order by fc.precip_mm), count(fc.precip_mm)::int,
           p_date, p_now, p_lang)
    from local_forecasts fc
   where fc.place_id = p_place_id and fc.target_date = p_date and fc.temp_max_c is not null
$$;

-- ---------------------------------------------------------------------------
-- Fútbol
-- ---------------------------------------------------------------------------

-- One match. Null values are left out, so an unfinished match has no score keys.
create or replace function app.fixture_json(p_fixture_id bigint, p_tz text, p_today date)
returns jsonb language sql stable set search_path = public, app as $$
  select jsonb_strip_nulls(jsonb_build_object(
           'id', f.id, 'kickoff', f.kickoff_utc, 'status', f.status,
           'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
           'home_id', h.id, 'away_id', a.id,
           'home_crest', app.team_has_crest(h.id), 'away_crest', app.team_has_crest(a.id),
           'home_score', case when f.status = 'finished' then f.home_score end,
           'away_score', case when f.status = 'finished' then f.away_score end,
           'is_today', (f.kickoff_utc at time zone p_tz)::date = p_today,
           'venue', f.venue_name, 'city', f.venue_city, 'round', f.round,
           'league', l.name, 'league_id', l.id, 'league_country', l.country, 'league_crest', app.league_has_crest(l.id)))
    from fixtures f
    join teams h on h.id = f.home_team_id
    join teams a on a.id = f.away_team_id
    join leagues l on l.id = f.league_id
   where f.id = p_fixture_id
$$;

create or replace function app.football_page(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_lang     text;
  v_tz       text;
  v_country  country_code;
  v_team_id  bigint;
  v_team     text;
  v_league   bigint;
  v_lname    text;
  v_today    date;
  v_ok       timestamptz;
  v_current  boolean;
begin
  select cl.language::text, cl.timezone, cl.team_id, cl.country into v_lang, v_tz, v_team_id, v_country
    from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_tz)::date;
  select h.last_ok_at into v_ok from feed_health h where h.feed = 'fixtures';
  v_current := v_ok is not null and v_ok >= p_now - interval '3 hours';

  if v_team_id is not null then
    select coalesce(tm.short_name, tm.name), lg.id, lg.name into v_team, v_league, v_lname
      from teams tm join leagues lg on lg.id = tm.league_id where tm.id = v_team_id;
  else
    -- No team chosen: their country's league.
    select lg.id, lg.name into v_league, v_lname
      from leagues lg where lg.country = v_country and lg.active order by lg.id limit 1;
  end if;

  return jsonb_build_object(
    'language', v_lang,
    'timezone', v_tz,
    'country', v_country,
    'team', v_team,
    'team_id', v_team_id,
    'team_crest', case when v_team_id is not null then app.team_has_crest(v_team_id) end,
    'league', v_lname,
    'league_id', v_league,
    'league_crest', case when v_league is not null then app.league_has_crest(v_league) end,
    'fixtures_current', v_current,
    'fixtures_confirmed_at', v_ok,

    -- Today and the next 7 days: only while the feed is current, only fixtures
    -- confirmed within 6 hours, and never a score (no live polling).
    'upcoming', case when v_team_id is null then null when v_current then coalesce((
       select jsonb_agg(app.fixture_json(f.id, v_tz, v_today) order by f.kickoff_utc)
         from fixtures f
        where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
          and f.status in ('scheduled', 'live', 'postponed', 'cancelled')
          and (f.kickoff_utc at time zone v_tz)::date between v_today and v_today + 7
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,

    -- Results are final, so they are shown at any age, with their date.
    'results', case when v_team_id is null then null else coalesce((
       select jsonb_agg(app.fixture_json(x.id, v_tz, v_today) order by x.kickoff_utc desc)
         from (select f.id, f.kickoff_utc from fixtures f
                where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
                  and f.status = 'finished' and f.home_score is not null and f.away_score is not null
                order by f.kickoff_utc desc limit 5) x), '[]'::jsonb) end,

    -- Form from those same results, newest first: W won, D drew, L lost.
    'form', case when v_team_id is null then null else coalesce((
       select jsonb_agg(x.r order by x.k desc)
         from (select f.kickoff_utc as k,
                      case when f.home_score = f.away_score then 'D'
                           when (f.home_team_id = v_team_id) = (f.home_score > f.away_score) then 'W'
                           else 'L' end as r
                 from fixtures f
                where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
                  and f.status = 'finished' and f.home_score is not null and f.away_score is not null
                order by f.kickoff_utc desc limit 5) x), '[]'::jsonb) end,
    'goals', case when v_team_id is null then null else (
       select jsonb_build_object(
                'matches', count(*),
                'for', coalesce(sum(case when x.home_team_id = v_team_id then x.home_score else x.away_score end), 0),
                'against', coalesce(sum(case when x.home_team_id = v_team_id then x.away_score else x.home_score end), 0))
         from (select f.* from fixtures f
                where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
                  and f.status = 'finished' and f.home_score is not null and f.away_score is not null
                order by f.kickoff_utc desc limit 5) x) end,

    -- Every match in their league today; a score only once finished.
    'league_today', case when v_league is not null and v_current then coalesce((
       select jsonb_agg(app.fixture_json(f.id, v_tz, v_today) order by f.kickoff_utc)
         from fixtures f
        where f.league_id = v_league
          and (f.kickoff_utc at time zone v_tz)::date = v_today
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,

    -- Their league's results over the last 7 days (final, so any age within that window).
    'league_recent', case when v_league is null then null else coalesce((
       select jsonb_agg(app.fixture_json(x.id, v_tz, v_today) order by x.kickoff_utc desc)
         from (select f.id, f.kickoff_utc from fixtures f
                where f.league_id = v_league and f.status = 'finished'
                  and f.home_score is not null and f.away_score is not null
                  and (f.kickoff_utc at time zone v_tz)::date between v_today - 7 and v_today - 1
                order by f.kickoff_utc desc limit 8) x), '[]'::jsonb) end,

    -- Today in the other leagues we follow, while the feed is current.
    'region_today', case when v_current then coalesce((
       select jsonb_agg(app.fixture_json(f.id, v_tz, v_today) order by l.name, f.kickoff_utc)
         from fixtures f join leagues l on l.id = f.league_id
        where l.active and f.league_id is distinct from v_league
          and (f.kickoff_utc at time zone v_tz)::date = v_today
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,

    -- The table only when current-season standings exist and are fresh (0015).
    'table', (
       select jsonb_build_object(
                'state', av.table_state,
                'reason', av.unavailable_reason,
                'rows', case when av.table_state = 'available' then (
                  select jsonb_agg(jsonb_build_object('group', cs.group_name, 'rank', cs.rank,
                           'team', coalesce(cs.short_name, cs.team_name), 'points', cs.points, 'played', cs.played)
                         order by cs.group_name, cs.rank)
                    from current_standings cs where cs.league_id = av.league_id) end)
         from league_table_availability av where av.league_id = v_league));
end $$;

-- ---------------------------------------------------------------------------
-- Clima
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
