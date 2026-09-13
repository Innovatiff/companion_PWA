-- 0015_football_tables.sql
-- League tables and crests, gated on data availability.
--
-- v1 runs on API-Football's free plan (docs/OPEN-DECISIONS.md #2). It can read
-- current-season fixtures and results by date, but not current league tables:
-- league+season queries are locked to 2022-2024. The table is built into the
-- schema now so the upgrade is a configuration change, and it is gated on DATA
-- rather than a flag: a table is shown only when current-season standings exist
-- and are fresh.
--
-- HARD RULE: never display 2022-2024 standings as current. A standings row can
-- only be written for the league's current season, and a table that has not
-- been refreshed is withdrawn rather than shown stale.

alter table leagues
  -- The provider's own current-season key (e.g. '2026'), taken from its
  -- catalogue. Null until ingest has confirmed it: unknown is not current.
  add column current_season            text,
  add column current_season_checked_at timestamptz;

alter table teams
  -- Crests are copied into our own storage. Client apps never call external
  -- APIs, and that includes loading a provider's image URL.
  add column crest_path        text,
  add column crest_source_url  text,
  add column crest_fetched_at  timestamptz;

alter table fixtures
  add column season text,
  add column round  text;

create table standings (
  id                bigint generated always as identity primary key,
  league_id         bigint not null references leagues(id) on delete cascade,
  season            text not null,
  group_name        text not null default '',     -- 'Apertura', 'Clausura', 'Regular Season'
  team_id           bigint not null references teams(id) on delete cascade,
  rank              smallint not null check (rank > 0),
  points            smallint not null,
  played            smallint not null check (played >= 0),
  won               smallint,
  drawn             smallint,
  lost              smallint,
  goals_for         smallint,
  goals_against     smallint,
  source            text not null,
  source_updated_at timestamptz,                  -- the provider's own "last updated"
  fetched_at        timestamptz not null default now(),
  unique (league_id, season, group_name, team_id)
);

create index standings_league_season_idx on standings (league_id, season, group_name, rank);

-- Only the league's current season may be stored. A plan that can read only
-- 2022-2024 must not be able to put one of those tables where the app reads.
create or replace function app.standings_current_season_only()
returns trigger language plpgsql as $$
declare
  current text;
begin
  select l.current_season into current from leagues l where l.id = new.league_id;
  if current is null or new.season is distinct from current then
    raise exception 'standings for season % rejected: league % current season is %',
      new.season, new.league_id, coalesce(current, 'unknown')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger standings_current_season_only
  before insert or update of season, league_id on standings
  for each row execute function app.standings_current_season_only();

-- How long a table may go unrefreshed and still be shown as current.
create or replace function app.standings_max_age()
returns interval language sql immutable as $$ select interval '36 hours' $$;

-- Whether each active league has a table the app may show, and if not, why.
-- The app renders the section from table_state; it never infers availability
-- from an empty query.
create view league_table_availability as
select
  l.id             as league_id,
  l.country,
  l.name,
  l.current_season,
  s.rows           as current_rows,
  s.oldest_fetch   as fetched_at,
  case
    when l.current_season is null                            then 'unavailable'
    when s.rows = 0                                          then 'unavailable'
    when s.oldest_fetch < now() - app.standings_max_age()    then 'unavailable'
    else 'available'
  end              as table_state,
  case
    when l.current_season is null                            then 'current season unknown'
    when s.rows = 0                                          then 'no table for the current season'
    when s.oldest_fetch < now() - app.standings_max_age()    then 'table not refreshed within 36 hours'
  end              as unavailable_reason
from leagues l
cross join lateral (
  select count(*) as rows, min(st.fetched_at) as oldest_fetch
    from standings st
   where st.league_id = l.id and st.season = l.current_season
) s
where l.active;

-- The only table the app reads. Current season, and fresh, or nothing.
create view current_standings as
select
  st.league_id,
  st.season,
  st.group_name,
  st.rank,
  t.name        as team_name,
  t.short_name,
  t.crest_path,
  st.points,
  st.played,
  st.won,
  st.drawn,
  st.lost,
  st.goals_for,
  st.goals_against,
  st.source_updated_at,
  st.fetched_at
from standings st
join leagues l on l.id = st.league_id and st.season = l.current_season
join league_table_availability a on a.league_id = st.league_id and a.table_state = 'available'
join teams t on t.id = st.team_id;

-- Same access as the other feed tables: no PII, readable by portal users,
-- written only by ingest.
alter table standings enable row level security;
create policy standings_read on standings
  for select using (auth.role() in ('authenticated', 'service_role'));
