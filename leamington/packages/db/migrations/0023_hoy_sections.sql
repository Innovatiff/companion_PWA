-- 0023_hoy_sections.sql
-- The data behind Hoy's sections: Fútbol, Clima, and in Más the reference rate
-- and lottery pages.
--
-- Each function returns only what is current enough to show. Anything else is
-- simply not there, and the page renders nothing in its place, per
-- docs/DESIGN.md. The one exception is weather alerts: the page must say when
-- the official source was last checked, and never "no alerts".

-- Where a person can read an agency's own warnings, for when our copy is stale
-- or the country is not monitored yet.
alter table alert_sources add column website_url text;
update alert_sources set website_url = case country::text
    when 'JM' then 'https://metservice.gov.jm/'
    when 'MX' then 'https://smn.conagua.gob.mx/'
    when 'HN' then 'https://copeco.gob.hn/'
    when 'GT' then 'https://insivumeh.gob.gt/'
  end
 where website_url is null;

-- ---------------------------------------------------------------------------
-- Forecast for one town and date, by the home-line rules: at least two
-- providers updated within 12 hours; the median, or a range when they disagree
-- by more than 2 degrees; rain only when most providers expect it.
-- ---------------------------------------------------------------------------
create or replace function app.forecast_summary(p_municipality_id bigint, p_date date, p_now timestamptz, p_lang text)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_providers integer;
  v_median    double precision;
  v_min       numeric;
  v_max       numeric;
  v_low       double precision;
  v_rainy     integer;
  v_newest    timestamptz;
  v_temp      text;
begin
  select count(*)::int,
         percentile_cont(0.5) within group (order by fc.temp_max_c),
         min(fc.temp_max_c), max(fc.temp_max_c),
         percentile_cont(0.5) within group (order by fc.temp_min_c),
         count(*) filter (where fc.precip_prob >= 50)::int,
         max(fc.fetched_at)
    into v_providers, v_median, v_min, v_max, v_low, v_rainy, v_newest
    from forecasts fc
   where fc.municipality_id = p_municipality_id and fc.target_date = p_date and fc.temp_max_c is not null;

  if v_providers < 2 or v_newest < p_now - interval '12 hours' then
    return null;
  end if;
  v_temp := case when round(v_max) - round(v_min) <= 2
                 then format('%s°', round(v_median::numeric))
                 else format('%s–%s°', round(v_min), round(v_max)) end;
  return jsonb_build_object(
    'date', p_date,
    'temp', v_temp,
    'low', case when v_low is not null then round(v_low::numeric) end,
    'rain', v_rainy * 2 > v_providers,
    'providers', v_providers,
    'text', v_temp || case when v_rainy * 2 > v_providers
                           then case when p_lang = 'en' then ', rain' else ', lluvia' end
                           else '' end);
end $$;

-- ---------------------------------------------------------------------------
-- Fútbol
-- ---------------------------------------------------------------------------
create or replace function app.football_page(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_lang     text;
  v_tz       text;
  v_team_id  bigint;
  v_team     text;
  v_league   bigint;
  v_lname    text;
  v_today    date;
  v_ok       timestamptz;
  v_current  boolean;
begin
  select cl.language::text, cl.timezone, cl.team_id into v_lang, v_tz, v_team_id
    from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_tz)::date;
  select h.last_ok_at into v_ok from feed_health h where h.feed = 'fixtures';
  v_current := v_ok is not null and v_ok >= p_now - interval '3 hours';

  if v_team_id is null then
    return jsonb_build_object('language', v_lang, 'timezone', v_tz, 'team', null,
                              'fixtures_current', v_current, 'fixtures_confirmed_at', v_ok);
  end if;
  select coalesce(tm.short_name, tm.name), lg.id, lg.name into v_team, v_league, v_lname
    from teams tm join leagues lg on lg.id = tm.league_id where tm.id = v_team_id;

  return jsonb_build_object(
    'language', v_lang,
    'timezone', v_tz,
    'team', v_team,
    'league', v_lname,
    'fixtures_current', v_current,
    'fixtures_confirmed_at', v_ok,
    -- Today and the next 7 days: only while the feed is current, only fixtures
    -- confirmed within 6 hours, and never a score (no live polling).
    'upcoming', case when v_current then coalesce((
       select jsonb_agg(jsonb_build_object(
                'kickoff', f.kickoff_utc, 'status', f.status,
                'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                'is_today', (f.kickoff_utc at time zone v_tz)::date = v_today)
              order by f.kickoff_utc)
         from fixtures f
         join teams h on h.id = f.home_team_id
         join teams a on a.id = f.away_team_id
        where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
          and f.status in ('scheduled', 'live', 'postponed', 'cancelled')
          and (f.kickoff_utc at time zone v_tz)::date between v_today and v_today + 7
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,
    -- Results are final, so they are shown at any age, with their date.
    'results', coalesce((
       select jsonb_agg(x.r order by x.kickoff desc)
         from (select f.kickoff_utc as kickoff,
                      jsonb_build_object('kickoff', f.kickoff_utc,
                        'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                        'home_score', f.home_score, 'away_score', f.away_score) as r
                 from fixtures f
                 join teams h on h.id = f.home_team_id
                 join teams a on a.id = f.away_team_id
                where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
                  and f.status = 'finished' and f.home_score is not null and f.away_score is not null
                order by f.kickoff_utc desc
                limit 5) x), '[]'::jsonb),
    -- Every match in their league today; a score only once finished.
    'league_today', case when v_current then coalesce((
       select jsonb_agg(jsonb_build_object(
                'kickoff', f.kickoff_utc, 'status', f.status,
                'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                'home_score', case when f.status = 'finished' then f.home_score end,
                'away_score', case when f.status = 'finished' then f.away_score end)
              order by f.kickoff_utc)
         from fixtures f
         join teams h on h.id = f.home_team_id
         join teams a on a.id = f.away_team_id
        where f.league_id = v_league
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

-- An alert exactly as the agency wrote it, plus who issued it.
create or replace function app.alert_json(p_alert_id bigint)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'id', a.id, 'agency', s.agency, 'agency_full', s.agency_full,
           'level', a.level, 'severity_raw', a.severity_raw, 'msg_type', a.msg_type,
           'event', a.event, 'headline', a.headline, 'description', a.description,
           'instruction', a.instruction, 'area_desc', a.area_desc,
           'issued_at', a.issued_at, 'effective_at', a.effective_at, 'expires_at', a.expires_at,
           'source_url', a.source_url, 'cancelled_at', a.cancelled_at,
           'superseded', a.superseded_by_id is not null)
    from weather_alerts a
    join alert_sources s on s.id = a.source_id
   where a.id = p_alert_id
$$;

create or replace function app.alert_severity_order(p_level alert_level)
returns integer language sql immutable as $$
  select case p_level when 'red' then 1 when 'orange' then 2 when 'yellow' then 3 when 'green' then 4 else 5 end
$$;

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
                'days', (select coalesce(jsonb_agg(d.s order by d.dt), '[]'::jsonb)
                           from (select g::date as dt, app.forecast_summary(m.id, g::date, p_now, v_lang) as s
                                   from generate_series((p_now at time zone m.timezone)::date,
                                                        (p_now at time zone m.timezone)::date + 2, interval '1 day') g) d
                          where d.s is not null))
              order by (m.id = v_home) desc, m.name)
         from municipalities m where m.id = any(v_town_ids)), '[]'::jsonb),
    'alerts_state', v_state,
    'alerts_checked_at', v_checked,
    'agency', v_agency,
    'agency_full', v_agency_full,
    'agency_url', v_website,
    -- Only offered when our copy is current: a stale list is not shown as the list.
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
    -- History: the last 30 days of messages no longer active, newest first.
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
-- Más: reference rate, with 30 days of context
-- ---------------------------------------------------------------------------
create or replace function app.rate_page(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_lang     text;
  v_today    date;
  v_currency text;
  v_latest   date;
  v_rate     numeric;
begin
  select cl.language::text, (p_now at time zone cl.timezone)::date,
         case cl.country::text when 'MX' then 'MXN' when 'HN' then 'HNL' when 'GT' then 'GTQ' when 'JM' then 'JMD' end
    into v_lang, v_today, v_currency
    from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;

  select fr.rate_date, fr.rate into v_latest, v_rate
    from fx_rates fr where fr.quote = v_currency::fx_currency order by fr.rate_date desc limit 1;
  if v_latest is null or v_latest < v_today - 3 then
    return jsonb_build_object('language', v_lang, 'currency', v_currency, 'current', false);
  end if;

  return jsonb_build_object(
    'language', v_lang,
    'currency', v_currency,
    'current', true,
    'note', case when v_lang = 'en' then 'reference rate' else 'tasa de referencia' end,
    'latest', jsonb_build_object('date', v_latest, 'rate', v_rate),
    'high_30d', (select max(fr.rate) from fx_rates fr where fr.quote = v_currency::fx_currency and fr.rate_date > v_latest - 30),
    'low_30d',  (select min(fr.rate) from fx_rates fr where fr.quote = v_currency::fx_currency and fr.rate_date > v_latest - 30),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', fr.rate_date, 'rate', fr.rate) order by fr.rate_date desc), '[]'::jsonb)
               from fx_rates fr where fr.quote = v_currency::fx_currency and fr.rate_date > v_latest - 30));
end $$;

-- ---------------------------------------------------------------------------
-- Más: lottery. Official results only, recent draws only: a stale lottery
-- number is worse than no number. Never odds, predictions or buy links.
-- ---------------------------------------------------------------------------
create or replace function app.lottery_page(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_lang    text;
  v_country country_code;
begin
  select cl.language::text, cl.country into v_lang, v_country from clients cl where cl.id = p_client_id and cl.active;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'language', v_lang,
    'games', coalesce((
       select jsonb_agg(jsonb_build_object('game', g.name, 'operator', g.operator, 'draws', d.draws) order by g.name)
         from lottery_games g
         cross join lateral (
           select jsonb_agg(jsonb_build_object(
                    'draw_date', lr.draw_date, 'draw_time', lr.draw_time_local, 'numbers', lr.numbers,
                    'extras', lr.extras, 'verified_at', lr.verified_at, 'source_url', lr.source_url)
                  order by lr.draw_date desc, lr.draw_time_local desc nulls last) as draws
             from (select * from lottery_results r
                    where r.game_id = g.id
                      and r.draw_date >= (p_now at time zone g.timezone)::date - 2
                    order by r.draw_date desc, r.draw_time_local desc nulls last
                    limit 6) lr
         ) d
        where g.country = v_country and g.active and g.parser_implemented and d.draws is not null), '[]'::jsonb));
end $$;
