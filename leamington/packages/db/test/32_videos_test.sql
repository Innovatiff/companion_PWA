-- Football videos (0049): sections and their windows, highlights first, channel
-- mixing, team videos from stored video_teams rows only, a member without a
-- team, the stale flag, pruning, thumbnails, and football_page.videos.
-- The clock is pinned: 2026-09-17 16:00 UTC.
-- Clients (all America/Toronto):
--   A  Mexico, es, team Club America (Liga MX)
--   N  Mexico, es, no team
--   J  Jamaica, en, team Montego Bay United
\set ON_ERROR_STOP on
begin;

-- Only this test's channels are active (the seeded real ones are switched off inside this transaction).
update video_channels set active = false;
insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000032', 'Videos Test');
insert into teams (league_id, country, name, source, source_team_id)
select l.id, l.country, v.name, 'videos-test', v.sid
  from (values ('MX', 'Club America', 'vt-1'), ('MX', 'Cruz Azul', 'vt-2'), ('MX', 'Guadalajara Chivas', 'vt-3'),
               ('JM', 'Montego Bay United', 'vt-4'), ('JM', 'Cavalier', 'vt-5')) v(country, name, sid)
  join leagues l on l.id = (select lg.id from leagues lg where lg.country = v.country::country_code and lg.active order by lg.id limit 1);
insert into clients (id, affiliate_id, code, full_name, country, language, timezone, team_id)
select v.id::uuid, '99990000-0000-4000-8000-000000000032', v.code, v.name, v.country::country_code, v.lang::ui_language, 'America/Toronto',
       (select t.id from teams t where t.name = v.team and t.source = 'videos-test')
  from (values
    ('99990000-0000-4000-8000-0000000003b1', 'ZECTAQ62', 'Videos America', 'MX', 'es', 'Club America'),
    ('99990000-0000-4000-8000-0000000003b2', 'ZECTAQ63', 'Videos No Team', 'MX', 'es', null),
    ('99990000-0000-4000-8000-0000000003b3', 'ZECTAQ64', 'Videos MoBay',   'JM', 'en', 'Montego Bay United')
  ) v(id, code, name, country, lang, team);
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-03-01', date '2099-01-01', '2026-03-01 15:00+00', 'sale', affiliate_id from clients where code in ('ZECTAQ62', 'ZECTAQ63', 'ZECTAQ64');

-- A channel: kind league (of its country's league), broadcaster, or club (of a team).
create function pg_temp.chan(p_key text, p_country text, p_kind text, p_team text default null) returns bigint language sql as $$
  insert into video_channels (key, name, youtube_channel_id, country, league_id, team_id, club_key, kind, verified_at)
  values (p_key, 'Channel ' || p_key, 'UC' || substr(md5(p_key), 1, 22), p_country::country_code,
          case when p_kind = 'league' then (select id from leagues where country = p_country::country_code and active order by id limit 1) end,
          (select id from teams where name = p_team and source = 'videos-test'),
          case when p_kind = 'club' then lower(p_country) || '-test' end, p_kind, date '2026-09-14')
  returning id
$$;
-- A video; youtube ids are 11 characters from the key.
create function pg_temp.vid(p_chan text, p_key text, p_title text, p_at timestamptz, p_highlight boolean, p_thumb boolean default false) returns bigint language sql as $$
  insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight, views, thumb, thumb_w, thumb_h, thumb_checked_at)
  select c.id, substr(md5(p_key), 1, 11), 'https://www.youtube.com/watch?v=' || substr(md5(p_key), 1, 11), p_title, p_at, p_highlight, 1000,
         case when p_thumb then '\xffd8ffe000'::bytea end, case when p_thumb then 320 end, case when p_thumb then 180 end, p_at
    from video_channels c where c.key = p_chan
  returning id
$$;
create function pg_temp.vt(p_video bigint, p_team text, p_rule text default 'name') returns void language sql as $$
  insert into video_teams (video_id, team_id, matched, rule)
  select p_video, t.id, p_team, p_rule from teams t where t.name = p_team and t.source = 'videos-test'
$$;
create function pg_temp.titles(p jsonb, p_section text) returns text[] language sql as $$
  select coalesce(array_agg(e->>'title' order by o), '{}') from jsonb_array_elements(p->p_section) with ordinality a(e, o)
$$;

select pg_temp.chan('t-mx-league', 'MX', 'league');
select pg_temp.chan('t-mx-tv1', 'MX', 'broadcaster');
select pg_temp.chan('t-mx-tv2', 'MX', 'broadcaster');
select pg_temp.chan('t-mx-america', 'MX', 'club', 'Club America');
select pg_temp.chan('t-jm-league', 'JM', 'league');
select pg_temp.chan('t-jm-mbu', 'JM', 'club', 'Montego Bay United');

-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight)
    select id, 'short', 'https://www.youtube.com/watch?v=short', 'Bad id', now(), false from video_channels where key = 't-mx-tv1';
    assert false, 'a video id that is not 11 characters is refused';
  exception when check_violation then null;
  end;
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight)
    select id, 'abcdefghijk', 'https://www.youtube.com/watch?v=zzzzzzzzzzz', 'Other url', now(), false from video_channels where key = 't-mx-tv1';
    assert false, 'the url must be the watch page of its own video id';
  exception when check_violation then null;
  end;
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight, thumb, thumb_w, thumb_h)
    select id, 'abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'Big thumb', now(), false, decode(repeat('ff', 14001), 'hex'), 320, 180
      from video_channels where key = 't-mx-tv1';
    assert false, 'a thumbnail over 14 KB is refused';
  exception when check_violation then null;
  end;
  begin
    insert into video_channels (key, name, youtube_channel_id, country, kind, verified_at)
    values ('t-bad-club', 'Bad club', 'UCabcdefghijklmnopqrstuv', 'MX', 'club', date '2026-09-14');
    assert false, 'a club channel names its club';
  exception when check_violation then null;
  end;
  raise notice 'PASS videos tables: 11-character ids, watch urls of their own id, 14 KB thumbnails, club channels name their club';
end $$;

-- ---------------------------------------------------------------------------
-- Team: stored matches only, 30 days, highlights first, broadcasters' highlights only, channels mixed.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000003b1';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  -- Club channel: every video counts (a press conference too), stored as club_channel.
  v_i := pg_temp.vid('t-mx-america', 'c1', 'Club press conference', v_now - interval '2 days', false, true);
  perform pg_temp.vt(v_i, 'Club America', 'club_channel');
  -- Broadcaster 1: three highlights about América, newest 1, 3, 5 hours ago; a talk clip; one 31 days old.
  v_i := pg_temp.vid('t-mx-tv1', 'b1', 'TV1 highlight 1h', v_now - interval '1 hour', true);  perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('t-mx-tv1', 'b2', 'TV1 highlight 3h', v_now - interval '3 hours', true); perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('t-mx-tv1', 'b3', 'TV1 highlight 5h', v_now - interval '5 hours', true); perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('t-mx-tv1', 'b4', 'TV1 talk clip', v_now - interval '30 minutes', false); perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('t-mx-tv1', 'b5', 'TV1 highlight 31 days', v_now - interval '31 days', true); perform pg_temp.vt(v_i, 'Club America');
  -- Broadcaster 2: one highlight about América, 10 hours ago.
  v_i := pg_temp.vid('t-mx-tv2', 'b6', 'TV2 highlight 10h', v_now - interval '10 hours', true); perform pg_temp.vt(v_i, 'Club America');
  -- A title that names América with no stored match: not theirs (matching happens at ingest only).
  perform pg_temp.vid('t-mx-tv2', 'b7', 'América vence a Cruz Azul (no stored match)', v_now - interval '20 minutes', true);
  -- Another club's press conference naming América: not América's video (its highlights would be).
  perform pg_temp.chan('t-mx-cruz-azul', 'MX', 'club', 'Cruz Azul');
  v_i := pg_temp.vid('t-mx-cruz-azul', 'b9', 'Conferencia Cruz Azul vs América', v_now - interval '40 minutes', false);
  perform pg_temp.vt(v_i, 'Club America', 'name+match'); perform pg_temp.vt(v_i, 'Cruz Azul', 'club_channel');
  -- Dated in the future: not shown.
  v_i := pg_temp.vid('t-mx-tv2', 'b8', 'TV2 from the future', v_now + interval '3 hours', true); perform pg_temp.vt(v_i, 'Club America');

  p := app.football_videos(v_a, v_now);
  assert p->'team' = jsonb_build_object('id', (select id from teams where name = 'Club America' and source = 'videos-test'), 'name', 'Club America'), format('%s', p->'team');
  assert p->'league'->>'name' = 'Liga MX', format('%s', p->'league');
  assert pg_temp.titles(p, 'team_videos') = array['TV1 highlight 1h', 'TV2 highlight 10h', 'TV1 highlight 3h', 'TV1 highlight 5h', 'Club press conference'],
    format('highlights first, round-robin across channels, then the club''s own video; no talk clip, nothing 31 days old or unmatched: %s', pg_temp.titles(p, 'team_videos'));

  p := app.football_videos(v_a, v_now, 2);
  assert pg_temp.titles(p, 'team_videos') = array['TV1 highlight 1h', 'TV2 highlight 10h'], format('one channel cannot fill a short list: %s', pg_temp.titles(p, 'team_videos'));

  p := app.football_videos(v_a, v_now);
  assert p->'team_videos'->0 ?& array['id', 'youtube_id', 'url', 'title', 'channel', 'published_at', 'views', 'is_highlight', 'thumb', 'thumb_w', 'thumb_h', 'teams'], format('%s', p->'team_videos'->0);
  assert p->'team_videos'->0->'teams' = '["Club America"]'::jsonb and p->'team_videos'->0->>'channel' = 'Channel t-mx-tv1', format('%s', p->'team_videos'->0);
  assert (p->'team_videos'->4->>'thumb')::boolean and (p->'team_videos'->4->>'thumb_w')::int = 320, format('%s', p->'team_videos'->4);
  raise notice 'PASS videos team: stored matches only, 30 days, highlights first, broadcasters'' highlights only, channels mixed';
end $$;

-- ---------------------------------------------------------------------------
-- League: highlights of 7 days from the league's channels, or broadcasters' about two of its teams; not already in team.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000003b1';
  v_n   uuid := '99990000-0000-4000-8000-0000000003b2';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  v_i := pg_temp.vid('t-mx-league', 'l1', 'League: Chivas 3-0 Cruz Azul', v_now - interval '2 days', true);
  perform pg_temp.vt(v_i, 'Guadalajara Chivas'); perform pg_temp.vt(v_i, 'Cruz Azul');
  perform pg_temp.vid('t-mx-league', 'l2', 'League highlight 8 days', v_now - interval '8 days', true);
  perform pg_temp.vid('t-mx-league', 'l3', 'League tunnel clip', v_now - interval '1 day', false);
  v_i := pg_temp.vid('t-mx-tv2', 'l4', 'TV2: Cruz Azul vs Chivas resumen', v_now - interval '1 day', true);
  perform pg_temp.vt(v_i, 'Guadalajara Chivas'); perform pg_temp.vt(v_i, 'Cruz Azul');
  v_i := pg_temp.vid('t-mx-tv2', 'l5', 'TV2: Chivas golazo (one team)', v_now - interval '1 day', true);
  perform pg_temp.vt(v_i, 'Guadalajara Chivas');
  perform pg_temp.vid('t-mx-tv2', 'l6', 'TV2: Serie A resumen (no league teams)', v_now - interval '1 day', true);
  -- In the team section already: not repeated in league.
  v_i := pg_temp.vid('t-mx-league', 'l7', 'League: América 1-1 Chivas', v_now - interval '3 days', true);
  perform pg_temp.vt(v_i, 'Club America'); perform pg_temp.vt(v_i, 'Guadalajara Chivas');
  -- Jamaica's league: never in Mexico's.
  perform pg_temp.vid('t-jm-league', 'l8', 'JPL highlight', v_now - interval '1 day', true);

  p := app.football_videos(v_a, v_now);
  assert 'League: América 1-1 Chivas' = any(pg_temp.titles(p, 'team_videos')), format('%s', pg_temp.titles(p, 'team_videos'));
  assert pg_temp.titles(p, 'league_videos') = array['TV2: Cruz Azul vs Chivas resumen', 'League: Chivas 3-0 Cruz Azul'],
    format('league highlights, newest first across channels: %s', pg_temp.titles(p, 'league_videos'));

  -- No team: their country's league, no team section.
  p := app.football_videos(v_n, v_now);
  assert p->'team' = 'null'::jsonb and p->'team_videos' = '[]'::jsonb, format('%s', p);
  assert p->'league'->>'name' = 'Liga MX', format('%s', p->'league');
  assert pg_temp.titles(p, 'league_videos') = array['TV2: Cruz Azul vs Chivas resumen', 'League: Chivas 3-0 Cruz Azul', 'League: América 1-1 Chivas'],
    format('%s', pg_temp.titles(p, 'league_videos'));

  -- Channels: the club's, the league's and the country's broadcasters; not Jamaica's.
  p := app.football_videos(v_a, v_now);
  assert (select array_agg(e->>'name' order by o) from jsonb_array_elements(p->'channels') with ordinality a(e, o))
         = array['Channel t-mx-america', 'Channel t-mx-league', 'Channel t-mx-tv1', 'Channel t-mx-tv2'], format('%s', p->'channels');
  assert p->'channels'->0->>'url' ~ '^https://www\.youtube\.com/channel/UC', format('%s', p->'channels');
  p := app.football_videos(v_n, v_now);
  assert not exists (select 1 from jsonb_array_elements(p->'channels') e where e->>'name' = 'Channel t-mx-america'), 'no club channel without a team';

  -- Jamaica: the club channel counts for its team.
  v_i := pg_temp.vid('t-jm-mbu', 'j1', 'MBU vs Cavalier - Extended Match Highlights', v_now - interval '4 days', true);
  perform pg_temp.vt(v_i, 'Montego Bay United', 'club_channel'); perform pg_temp.vt(v_i, 'Cavalier', 'name+match');
  p := app.football_videos('99990000-0000-4000-8000-0000000003b3', v_now);
  assert pg_temp.titles(p, 'team_videos') = array['MBU vs Cavalier - Extended Match Highlights'] and pg_temp.titles(p, 'league_videos') = array['JPL highlight'],
    format('%s', p);
  assert p->>'language' = 'en' and p->'team_videos'->0->'teams' = '["Cavalier", "Montego Bay United"]'::jsonb, format('%s', p->'team_videos'->0);

  -- An inactive channel's videos are not shown.
  update video_channels set active = false where key = 't-mx-tv2';
  p := app.football_videos(v_a, v_now);
  assert not exists (select 1 from jsonb_array_elements(p->'team_videos' || p->'league_videos') e where e->>'channel' = 'Channel t-mx-tv2'), format('%s', p);
  update video_channels set active = true where key = 't-mx-tv2';
  raise notice 'PASS videos league: 7 days of highlights, league channels or broadcasters naming two teams, not repeated; no team gets the country''s league';
end $$;

-- ---------------------------------------------------------------------------
-- Stale, football_page.videos, thumbnails, pruning, unknown members.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000003b1';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_old bigint;
  v_keep bigint;
  p     jsonb;
  r     record;
begin
  delete from source_runs where feed = 'videos';
  p := app.football_videos(v_a, v_now);
  assert (p->>'stale')::boolean and p->'updated_at' = 'null'::jsonb and jsonb_array_length(p->'team_videos') > 0,
    format('no run yet: stale, and the stored videos are still returned: %s', p->'updated_at');

  insert into source_runs (feed, started_at, finished_at, status) values ('videos', v_now - interval '61 minutes', v_now - interval '1 hour', 'partial');
  insert into source_runs (feed, started_at, finished_at, status, error) values ('videos', v_now - interval '10 minutes', v_now - interval '9 minutes', 'error', 'no video channel answered');
  p := app.football_videos(v_a, v_now);
  assert not (p->>'stale')::boolean and (p->>'updated_at')::timestamptz = v_now - interval '1 hour', format('a partial run counts, an error does not: %s', p);
  -- The partial run finished an hour before v_now: current for 3 hours after that.
  p := app.football_videos(v_a, v_now + interval '1 hour 59 minutes');
  assert not (p->>'stale')::boolean;
  p := app.football_videos(v_a, v_now + interval '2 hours 1 minute');
  assert (p->>'stale')::boolean, 'no answer for over 3 hours is stale';

  p := app.football_page(v_a, v_now);
  assert p->'videos' ?& array['team', 'league', 'updated_at', 'stale'], format('%s', p->'videos');
  assert jsonb_array_length(p->'videos'->'team') = 6 and p->'videos'->'team'->0->>'title' = 'TV1 highlight 1h', format('first 6 of team: %s', p->'videos'->'team');
  assert jsonb_array_length(p->'videos'->'league') between 1 and 6 and not (p->'videos'->>'stale')::boolean, format('%s', p->'videos');
  assert p->>'team' = 'Club America' and p ? 'league_recent', 'football_page otherwise unchanged';
  p := app.football_page('99990000-0000-4000-8000-0000000003b2', v_now);
  assert p->'videos'->'team' = '[]'::jsonb and jsonb_array_length(p->'videos'->'league') >= 1, format('%s', p->'videos');

  select * into r from app.video_thumb((select id from videos where title = 'Club press conference'));
  assert r.content_type = 'image/jpeg' and r.bytes = '\xffd8ffe000'::bytea and r.sha256 ~ '^[0-9a-f]{64}$' and r.width = 320 and r.height = 180, format('%s', r);
  assert not exists (select 1 from app.video_thumb((select id from videos where title = 'TV1 highlight 1h'))), 'no thumbnail, no row';

  v_old := pg_temp.vid('t-mx-tv1', 'p1', 'Sixty-one days', v_now - interval '61 days', true);
  perform pg_temp.vt(v_old, 'Club America');
  v_keep := pg_temp.vid('t-mx-tv1', 'p2', 'Fifty-nine days', v_now - interval '59 days', true);
  assert (app.prune_videos(v_now)->>'videos')::int = 1;
  assert not exists (select 1 from videos where id = v_old) and not exists (select 1 from video_teams where video_id = v_old)
     and exists (select 1 from videos where id = v_keep), 'videos older than 60 days go, with their matches';

  assert app.football_videos('99990000-0000-4000-8000-00000000ffff', v_now) is null, 'unknown member';
  raise notice 'PASS videos: stale after 3 hours without an answer, football_page.videos, thumbnails, 60-day pruning';
end $$;

rollback;
