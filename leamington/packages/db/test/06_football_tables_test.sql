-- League tables are shown only for the current season, and only while fresh.
--
-- HARD RULE: never display 2022-2024 standings as current. When no current,
-- fresh table exists, the app gets table_state = 'unavailable' and a reason,
-- never an old table and never an empty result it would have to interpret.
\set ON_ERROR_STOP on

insert into leagues (country, name, source, source_league_id, current_season)
  values ('JM', 'Test Premier League', 'api-football', '999322', '2026') on conflict do nothing;
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'JM', t.name, 'api-football', t.sid
  from leagues l, (values ('Test Cavalier', 't1'), ('Test Harbour View', 't2')) t(name, sid)
 where l.name = 'Test Premier League'
on conflict do nothing;

create or replace function pg_temp.league() returns bigint language sql as
  $$ select id from leagues where name = 'Test Premier League' $$;

-- --------------------------------------------------------------------------
-- No table stored: unavailable, with a reason; nothing to read
-- --------------------------------------------------------------------------
do $$
declare a record; n int;
begin
  select * into a from league_table_availability where league_id = pg_temp.league();
  assert a.table_state = 'unavailable', format('expected unavailable, got %s', a.table_state);
  assert a.unavailable_reason = 'no table for the current season', format('reason: %s', a.unavailable_reason);
  select count(*) into n from current_standings where league_id = pg_temp.league();
  assert n = 0, 'no rows may be served without a current table';
  raise notice 'PASS football tables: no table is unavailable, with a reason';
end $$;

-- --------------------------------------------------------------------------
-- A 2024 table cannot be written while the current season is 2026
-- --------------------------------------------------------------------------
do $$
declare rejected boolean := false;
begin
  begin
    insert into standings (league_id, season, team_id, rank, points, played, source)
    select pg_temp.league(), '2024', t.id, 1, 93, 39, 'api-football'
      from teams t where t.name = 'Test Cavalier';
  exception when check_violation then rejected := true;
  end;
  assert rejected, 'a past-season table must be rejected, never stored where the app reads';
  raise notice 'PASS football tables: a 2024 table is rejected while the season is 2026';
end $$;

-- --------------------------------------------------------------------------
-- A fresh current-season table is available and served
-- --------------------------------------------------------------------------
insert into standings (league_id, season, group_name, team_id, rank, points, played, source)
select pg_temp.league(), '2026', 'Regular Season', t.id, r.rank, r.points, 1, 'api-football'
  from teams t join (values ('Test Cavalier', 1, 3), ('Test Harbour View', 2, 0)) r(name, rank, points)
    on r.name = t.name;

do $$
declare a record; n int;
begin
  select * into a from league_table_availability where league_id = pg_temp.league();
  assert a.table_state = 'available' and a.unavailable_reason is null, format('got %s / %s', a.table_state, a.unavailable_reason);
  select count(*) into n from current_standings where league_id = pg_temp.league() and season = '2026';
  assert n = 2, format('expected 2 current rows, got %s', n);
  raise notice 'PASS football tables: a fresh current-season table is served';
end $$;

-- --------------------------------------------------------------------------
-- A table not refreshed within 36 hours is withdrawn, not shown stale
-- --------------------------------------------------------------------------
do $$
declare a record; n int;
begin
  update standings set fetched_at = now() - interval '37 hours' where league_id = pg_temp.league();
  select * into a from league_table_availability where league_id = pg_temp.league();
  assert a.table_state = 'unavailable' and a.unavailable_reason = 'table not refreshed within 36 hours',
    format('got %s / %s', a.table_state, a.unavailable_reason);
  select count(*) into n from current_standings where league_id = pg_temp.league();
  assert n = 0, 'a stale table must not be served';
  update standings set fetched_at = now() where league_id = pg_temp.league();
  raise notice 'PASS football tables: a stale table is withdrawn';
end $$;

-- --------------------------------------------------------------------------
-- When the season rolls over, last season's table stops being current
-- --------------------------------------------------------------------------
do $$
declare a record; n int;
begin
  update leagues set current_season = '2027' where id = pg_temp.league();
  select * into a from league_table_availability where league_id = pg_temp.league();
  assert a.table_state = 'unavailable' and a.unavailable_reason = 'no table for the current season',
    format('got %s / %s', a.table_state, a.unavailable_reason);
  select count(*) into n from current_standings where league_id = pg_temp.league();
  assert n = 0, 'last season''s table must not be served as this season''s';
  raise notice 'PASS football tables: a season rollover withdraws the old table';
end $$;

-- --------------------------------------------------------------------------
-- An unknown current season is unavailable, and blocks writes
-- --------------------------------------------------------------------------
do $$
declare a record; rejected boolean := false;
begin
  update leagues set current_season = null where id = pg_temp.league();
  select * into a from league_table_availability where league_id = pg_temp.league();
  assert a.table_state = 'unavailable' and a.unavailable_reason = 'current season unknown',
    format('got %s / %s', a.table_state, a.unavailable_reason);
  begin
    insert into standings (league_id, season, group_name, team_id, rank, points, played, source)
    select pg_temp.league(), '2026', 'Other', t.id, 1, 0, 0, 'api-football' from teams t where t.name = 'Test Cavalier';
  exception when check_violation then rejected := true;
  end;
  assert rejected, 'no table may be written while the current season is unknown';
  raise notice 'PASS football tables: an unknown season is unavailable and blocks writes';
end $$;
