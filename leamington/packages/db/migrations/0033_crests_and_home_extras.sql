-- 0033_crests_and_home_extras.sql
-- Real images and real reference data on Hoy's screens, from our own database.
--
--   * team_crests: crest images fetched server-side (services/ingest/scripts/
--     fetch-crests.mjs) and served by Hoy from our own domain, so the phone
--     never calls a third party. A team without a stored crest shows no image.
--   * football_page (0023) now also returns team ids and whether each has a crest.
--   * app.home_extras: the home screen's quick cards. Every value is real
--     curated or ingested data with its own validity, or absent:
--       next_holiday   the next national holiday in their country (verified)
--       emergency      Ontario's emergency number (verified)
--       consulate      their country's consulate serving Windsor-Essex (verified)
--       lottery        the latest official draw in their country, from the last 2 days
--       team           their team, with its crest if stored

create table team_crests (
  team_id      bigint primary key references teams(id) on delete cascade,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  bytes        bytea not null check (octet_length(bytes) between 1 and 200000),
  sha256       text not null,
  source_url   text not null,
  fetched_at   timestamptz not null default now()
);

alter table team_crests enable row level security;
create policy team_crests_read on team_crests for select using (auth.role() in ('authenticated', 'service_role'));

create or replace function app.team_has_crest(p_team_id bigint)
returns boolean language sql stable set search_path = public, app as $$
  select exists (select 1 from team_crests where team_id = p_team_id)
$$;

-- ---------------------------------------------------------------------------
-- Fútbol, as 0023, with team ids and crest flags.
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
    'team_id', v_team_id,
    'team_crest', app.team_has_crest(v_team_id),
    'league', v_lname,
    'fixtures_current', v_current,
    'fixtures_confirmed_at', v_ok,
    'upcoming', case when v_current then coalesce((
       select jsonb_agg(jsonb_build_object(
                'kickoff', f.kickoff_utc, 'status', f.status,
                'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                'home_id', h.id, 'away_id', a.id,
                'home_crest', app.team_has_crest(h.id), 'away_crest', app.team_has_crest(a.id),
                'is_today', (f.kickoff_utc at time zone v_tz)::date = v_today)
              order by f.kickoff_utc)
         from fixtures f
         join teams h on h.id = f.home_team_id
         join teams a on a.id = f.away_team_id
        where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
          and f.status in ('scheduled', 'live', 'postponed', 'cancelled')
          and (f.kickoff_utc at time zone v_tz)::date between v_today and v_today + 7
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,
    'results', coalesce((
       select jsonb_agg(x.r order by x.kickoff desc)
         from (select f.kickoff_utc as kickoff,
                      jsonb_build_object('kickoff', f.kickoff_utc,
                        'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                        'home_id', h.id, 'away_id', a.id,
                        'home_crest', app.team_has_crest(h.id), 'away_crest', app.team_has_crest(a.id),
                        'home_score', f.home_score, 'away_score', f.away_score) as r
                 from fixtures f
                 join teams h on h.id = f.home_team_id
                 join teams a on a.id = f.away_team_id
                where (f.home_team_id = v_team_id or f.away_team_id = v_team_id)
                  and f.status = 'finished' and f.home_score is not null and f.away_score is not null
                order by f.kickoff_utc desc
                limit 5) x), '[]'::jsonb),
    'league_today', case when v_current then coalesce((
       select jsonb_agg(jsonb_build_object(
                'kickoff', f.kickoff_utc, 'status', f.status,
                'home', coalesce(h.short_name, h.name), 'away', coalesce(a.short_name, a.name),
                'home_id', h.id, 'away_id', a.id,
                'home_crest', app.team_has_crest(h.id), 'away_crest', app.team_has_crest(a.id),
                'home_score', case when f.status = 'finished' then f.home_score end,
                'away_score', case when f.status = 'finished' then f.away_score end)
              order by f.kickoff_utc)
         from fixtures f
         join teams h on h.id = f.home_team_id
         join teams a on a.id = f.away_team_id
        where f.league_id = v_league
          and (f.kickoff_utc at time zone v_tz)::date = v_today
          and f.fetched_at >= p_now - interval '6 hours'), '[]'::jsonb) end,
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
-- Home quick cards. Each is real data, or null.
-- ---------------------------------------------------------------------------
create or replace function app.home_extras(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c     clients%rowtype;
  v_today date;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;

  return jsonb_build_object(
    'language', v_c.language,
    'country', v_c.country,
    'timezone', v_c.timezone,
    -- Within the next 120 days; shown until the holiday itself has passed.
    'next_holiday', (
       select jsonb_build_object('date', h.holiday_date, 'name', h.name, 'days_until', h.holiday_date - v_today,
                                 'verified_at', h.verified_at, 'valid_until', (h.holiday_date + 1)::timestamp at time zone v_c.timezone)
         from holidays h
        where h.country = v_c.country and h.holiday_date >= v_today and h.holiday_date <= v_today + 120
        order by h.holiday_date, h.name limit 1),
    'emergency', (
       select jsonb_build_object('label', e.label, 'number', e.number, 'verified_at', e.verified_at)
         from emergency_contacts e
        where e.country = 'CA' and e.number = '911'
        order by e.region limit 1),
    'consulate', (
       select jsonb_build_object('city', k.city, 'phone', k.phone, 'verified_at', k.verified_at)
         from consulates k
        where k.country = v_c.country
        order by (k.city = 'Leamington') desc, k.city limit 1),
    -- The newest official draw from the last 2 days, for a game with a confirmed parser.
    'lottery', (
       select jsonb_build_object('game', g.name, 'draw_date', r.draw_date, 'draw_time', r.draw_time_local,
                                 'numbers', r.numbers, 'verified_at', r.verified_at,
                                 'valid_until', (r.draw_date + 3)::timestamp at time zone g.timezone)
         from lottery_results r
         join lottery_games g on g.id = r.game_id
        where g.country = v_c.country and g.active and g.parser_implemented
          and r.draw_date >= (p_now at time zone g.timezone)::date - 2
        order by r.draw_date desc, r.draw_time_local desc nulls last, r.verified_at desc
        limit 1),
    'team', (
       select jsonb_build_object('id', t.id, 'name', coalesce(t.short_name, t.name), 'crest', app.team_has_crest(t.id))
         from teams t where t.id = v_c.team_id));
end $$;
