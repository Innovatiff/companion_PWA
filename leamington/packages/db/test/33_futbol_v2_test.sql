-- Fútbol v2 (0050): categories and is_highlight kept in step, Shorts, national
-- channels and the confederation, category ordering in team videos, the league's
-- 14 days, the shorts section, national teams from stored video_nations rows
-- (men's and women's apart), team news (7 days, the team's country, graphic
-- stories never first), and football_page's new fields.
-- The clock is pinned: 2026-09-17 16:00 UTC.
-- Clients (all America/Toronto):
--   A  Mexico, es, team Club America (Liga MX)
--   N  Mexico, es, no team
--   H  Honduras, es, team CD Motagua
\set ON_ERROR_STOP on
begin;

update video_channels set active = false;
update news_sources set active = false;
insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000033', 'Futbol v2 Test');
insert into teams (league_id, country, name, source, source_team_id)
select l.id, l.country, v.name, 'futbol-v2-test', v.sid
  from (values ('MX', 'Club America', 'fv-1'), ('MX', 'Cruz Azul', 'fv-2'), ('MX', 'Guadalajara Chivas', 'fv-3'), ('HN', 'CD Motagua', 'fv-4')) v(country, name, sid)
  join leagues l on l.id = (select lg.id from leagues lg where lg.country = v.country::country_code and lg.active order by lg.id limit 1);
insert into clients (id, affiliate_id, code, full_name, country, language, timezone, team_id)
select v.id::uuid, '99990000-0000-4000-8000-000000000033', v.code, v.name, v.country::country_code, 'es', 'America/Toronto',
       (select t.id from teams t where t.name = v.team and t.source = 'futbol-v2-test')
  from (values
    ('99990000-0000-4000-8000-0000000033a1', 'ZECTAQ32', 'V2 America', 'MX', 'Club America'),
    ('99990000-0000-4000-8000-0000000033a2', 'ZECTAQ33', 'V2 No Team', 'MX', null),
    ('99990000-0000-4000-8000-0000000033a3', 'ZECTAQ34', 'V2 Motagua', 'HN', 'CD Motagua')
  ) v(id, code, name, country, team);
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-03-01', date '2099-01-01', '2026-03-01 15:00+00', 'sale', affiliate_id from clients where code in ('ZECTAQ32', 'ZECTAQ33', 'ZECTAQ34');

create function pg_temp.team(p_name text) returns bigint language sql as $$
  select id from teams where name = p_name and source = 'futbol-v2-test'
$$;
-- A channel: kind league (its country's league), broadcaster, club (of a team), national, confederation (no country).
create function pg_temp.chan(p_key text, p_country text, p_kind text, p_team text default null) returns bigint language sql as $$
  insert into video_channels (key, name, youtube_channel_id, country, league_id, team_id, club_key, kind, verified_at)
  values (p_key, 'Channel ' || p_key, 'UC' || substr(md5(p_key), 1, 22), p_country::country_code,
          case when p_kind = 'league' then (select id from leagues where country = p_country::country_code and active order by id limit 1) end,
          pg_temp.team(p_team), case when p_kind = 'club' then lower(p_country) || '-test' end, p_kind, date '2026-09-15')
  returning id
$$;
-- A video with its category; a Short gets its /shorts/ url and a vertical thumbnail.
create function pg_temp.vid(p_chan text, p_key text, p_title text, p_at timestamptz, p_category text, p_short boolean default false) returns bigint language sql as $$
  insert into videos (channel_id, youtube_id, url, title, published_at, category, is_short, views, thumb, thumb_w, thumb_h, thumb_checked_at, classified_at)
  select c.id, substr(md5(p_key), 1, 11),
         case when p_short then 'https://www.youtube.com/shorts/' else 'https://www.youtube.com/watch?v=' end || substr(md5(p_key), 1, 11),
         p_title, p_at, p_category, p_short, 10, '\xffd8ffe000'::bytea,
         case when p_short then 180 else 320 end, case when p_short then 320 else 180 end, p_at, p_at
    from video_channels c where c.key = p_chan
  returning id
$$;
create function pg_temp.vt(p_video bigint, p_team text) returns void language sql as $$
  insert into video_teams (video_id, team_id, matched, rule) values (p_video, pg_temp.team(p_team), p_team, 'name')
$$;
create function pg_temp.vn(p_video bigint, p_country text, p_women boolean default false, p_rule text default 'alias') returns void language sql as $$
  insert into video_nations (video_id, country, women, matched, rule) values (p_video, p_country::country_code, p_women, 'test', p_rule)
$$;
create function pg_temp.titles(p jsonb, p_section text) returns text[] language sql as $$
  select coalesce(array_agg(e->>'title' order by o), '{}') from jsonb_array_elements(p->p_section) with ordinality a(e, o)
$$;

select pg_temp.chan('v2-mx-league', 'MX', 'league');
select pg_temp.chan('v2-mx-tv1', 'MX', 'broadcaster');
select pg_temp.chan('v2-mx-tv2', 'MX', 'broadcaster');
select pg_temp.chan('v2-mx-america', 'MX', 'club', 'Club America');
select pg_temp.chan('v2-mx-cruz-azul', 'MX', 'club', 'Cruz Azul');
select pg_temp.chan('v2-mx-fmf', 'MX', 'national');
select pg_temp.chan('v2-concacaf', null, 'confederation');

-- ---------------------------------------------------------------------------
do $$
declare
  v_id bigint;
  r    record;
begin
  -- A 0049 writer that gives only is_highlight gets a category; a category gives is_highlight.
  insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight)
  select id, 'old49aaaaaa', 'https://www.youtube.com/watch?v=old49aaaaaa', 'A 0049 insert', now(), true from video_channels where key = 'v2-mx-tv1'
  returning id into v_id;
  select category, is_highlight into r from videos where id = v_id;
  assert r.category = 'highlight' and r.is_highlight, format('%s', r);
  update videos set category = 'interview' where id = v_id;
  select category, is_highlight into r from videos where id = v_id;
  assert r.category = 'interview' and not r.is_highlight, format('%s', r);
  update videos set is_highlight = true where id = v_id;
  select category, is_highlight into r from videos where id = v_id;
  assert r.category = 'highlight' and r.is_highlight, format('a 0049 update of is_highlight: %s', r);
  update videos set category = 'goals', is_highlight = false where id = v_id;
  select category, is_highlight into r from videos where id = v_id;
  assert r.category = 'goals' and r.is_highlight, format('the category wins: %s', r);
  delete from videos where id = v_id;

  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, category) select id, 'badcategory', 'https://www.youtube.com/watch?v=badcategory', 'x', now(), 'memes' from video_channels where key = 'v2-mx-tv1';
    assert false, 'an unknown category is refused';
  exception when check_violation then null;
  end;
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, category, is_short) select id, 'shortwatchx', 'https://www.youtube.com/watch?v=shortwatchx', 'x', now(), 'goals', true from video_channels where key = 'v2-mx-tv1';
    assert false, 'a Short links to its /shorts/ page';
  exception when check_violation then null;
  end;
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, category) select id, 'notashortxx', 'https://www.youtube.com/shorts/notashortxx', 'x', now(), 'goals' from video_channels where key = 'v2-mx-tv1';
    assert false, 'a video that is not a Short links to the watch page';
  exception when check_violation then null;
  end;
  begin
    insert into videos (channel_id, youtube_id, url, title, published_at, category, is_short, thumb, thumb_w, thumb_h)
    select id, 'shortwidexx', 'https://www.youtube.com/shorts/shortwidexx', 'x', now(), 'goals', true, '\xffd8'::bytea, 320, 180 from video_channels where key = 'v2-mx-tv1';
    assert false, 'a Short''s thumbnail is vertical';
  exception when check_violation then null;
  end;
  begin
    insert into video_channels (key, name, youtube_channel_id, country, kind, verified_at) values ('v2-bad-conf', 'x', 'UC' || substr(md5('v2-bad-1'), 1, 22), 'MX', 'confederation', date '2026-09-15');
    assert false, 'a confederation has no country';
  exception when check_violation then null;
  end;
  begin
    insert into video_channels (key, name, youtube_channel_id, country, kind, verified_at) values ('v2-bad-null', 'x', 'UC' || substr(md5('v2-bad-2'), 1, 22), null, 'broadcaster', date '2026-09-15');
    assert false, 'every other channel has a country';
  exception when check_violation then null;
  end;
  begin
    insert into video_channels (key, name, youtube_channel_id, country, league_id, kind, verified_at)
    values ('v2-bad-nat', 'x', 'UC' || substr(md5('v2-bad-3'), 1, 22), 'MX', (select id from leagues where country = 'MX' order by id limit 1), 'national', date '2026-09-15');
    assert false, 'a national channel has no league';
  exception when check_violation then null;
  end;
  begin
    insert into video_channels (key, name, youtube_channel_id, country, kind, women, verified_at) values ('v2-bad-women', 'x', 'UC' || substr(md5('v2-bad-4'), 1, 22), 'MX', 'broadcaster', true, date '2026-09-15');
    assert false, 'only a national channel is a women''s team''s';
  exception when check_violation then null;
  end;
  begin
    insert into news_teams (item_id, team_id, matched, rule) values (0, pg_temp.team('Club America'), 'x', 'guess');
    assert false, 'news_teams rules are known ones';
  exception when check_violation or foreign_key_violation then null;
  end;
  raise notice 'PASS futbol v2 tables: category and is_highlight in step, Shorts urls and vertical thumbs, national and confederation channels';
end $$;

-- ---------------------------------------------------------------------------
-- Team videos: 45 days, highlights and goals, then interviews and previews, then the club's other videos.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000033a1';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  v_i := pg_temp.vid('v2-mx-tv1', 't1', 'T highlight 2h', v_now - interval '2 hours', 'highlight');       perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv2', 't2', 'T goals 3h', v_now - interval '3 hours', 'goals');               perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-concacaf', 't3', 'C highlight 5h', v_now - interval '5 hours', 'highlight');     perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't4', 'T highlight 44 days', v_now - interval '44 days', 'highlight');  perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't5', 'T highlight 46 days', v_now - interval '46 days', 'highlight');  perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't6', 'T interview 1h', v_now - interval '1 hour', 'interview');        perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't7', 'T preview 30m', v_now - interval '30 minutes', 'preview');       perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't8', 'T talk show 20m', v_now - interval '20 minutes', 'other');       perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-america', 't9', 'T club other 4h', v_now - interval '4 hours', 'other');      perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-cruz-azul', 't10', 'T other club presser', v_now - interval '10 minutes', 'interview'); perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-tv1', 't11', 'T short 1 day', v_now - interval '1 day', 'goals', true);       perform pg_temp.vt(v_i, 'Club America');

  p := app.football_videos(v_a, v_now);
  assert pg_temp.titles(p, 'team_videos') = array['T highlight 2h', 'T goals 3h', 'C highlight 5h', 'T highlight 44 days', 'T preview 30m', 'T interview 1h', 'T club other 4h'],
    format('highlights and goals mixed across channels (the confederation''s too), then interviews and previews, then the club''s own; no talk show, no other club''s press conference, no Short, nothing 46 days old: %s', pg_temp.titles(p, 'team_videos'));
  assert p->'team_videos'->0->>'category' = 'highlight' and (p->'team_videos'->0->>'is_highlight')::boolean
     and p->'team_videos'->1->>'category' = 'goals' and (p->'team_videos'->1->>'is_highlight')::boolean
     and p->'team_videos'->4->>'category' = 'preview' and not (p->'team_videos'->4->>'is_highlight')::boolean
     and not (p->'team_videos'->0->>'is_short')::boolean, format('%s', p->'team_videos');
  assert jsonb_array_length((app.football_videos(v_a, v_now, 3))->'team_videos') = 3;
  raise notice 'PASS futbol v2 team videos: 45 days, highlights and goals, then interviews and previews, then the club''s other videos; Shorts apart';
end $$;

-- ---------------------------------------------------------------------------
-- League (14 days, highlights and goals) and Shorts (team, then league, then national team; 14 days).
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000033a1';
  v_n   uuid := '99990000-0000-4000-8000-0000000033a2';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  v_i := pg_temp.vid('v2-mx-league', 'l1', 'L goals 13 days', v_now - interval '13 days', 'goals');       perform pg_temp.vt(v_i, 'Guadalajara Chivas'); perform pg_temp.vt(v_i, 'Cruz Azul');
  perform pg_temp.vid('v2-mx-league', 'l2', 'L highlight 15 days', v_now - interval '15 days', 'highlight');
  perform pg_temp.vid('v2-mx-league', 'l3', 'L interview 1 day', v_now - interval '1 day', 'interview');
  v_i := pg_temp.vid('v2-mx-tv2', 'l4', 'L tv goals two teams', v_now - interval '1 day', 'goals');      perform pg_temp.vt(v_i, 'Guadalajara Chivas'); perform pg_temp.vt(v_i, 'Cruz Azul');
  v_i := pg_temp.vid('v2-concacaf', 'l5', 'L confederation two teams', v_now - interval '1 day', 'highlight'); perform pg_temp.vt(v_i, 'Guadalajara Chivas'); perform pg_temp.vt(v_i, 'Cruz Azul');

  perform pg_temp.vid('v2-mx-league', 's1', 'S league 2 days', v_now - interval '2 days', 'highlight', true);
  v_i := pg_temp.vid('v2-mx-tv2', 's2', 'S Chivas 3 days', v_now - interval '3 days', 'goals', true);   perform pg_temp.vt(v_i, 'Guadalajara Chivas');
  v_i := pg_temp.vid('v2-mx-tv2', 's3', 'S America 15 days', v_now - interval '15 days', 'goals', true); perform pg_temp.vt(v_i, 'Club America');
  v_i := pg_temp.vid('v2-mx-fmf', 's4', 'S national 1h', v_now - interval '1 hour', 'goals', true);     perform pg_temp.vn(v_i, 'MX', false, 'national_channel');
  v_i := pg_temp.vid('v2-mx-fmf', 's5', 'S national women 1h', v_now - interval '1 hour', 'goals', true); perform pg_temp.vn(v_i, 'MX', true, 'national_channel');
  v_i := pg_temp.vid('v2-mx-tv1', 's6', 'S unmatched tv 1h', v_now - interval '1 hour', 'highlight', true);

  p := app.football_videos(v_a, v_now);
  assert pg_temp.titles(p, 'league_videos') = array['L tv goals two teams', 'L goals 13 days'],
    format('14 days of highlights and goals from the league''s channel or its country''s broadcasters naming two teams (not the confederation): %s', pg_temp.titles(p, 'league_videos'));
  assert pg_temp.titles(p, 'shorts') = array['T short 1 day', 'S league 2 days', 'S Chivas 3 days', 'S national 1h'],
    format('their team''s Shorts, then the league''s, then the men''s national team''s; 14 days: %s', pg_temp.titles(p, 'shorts'));
  assert (p->'shorts'->0->>'is_short')::boolean and p->'shorts'->0->>'url' ~ '^https://www\.youtube\.com/shorts/[0-9a-f]{11}$'
     and (p->'shorts'->0->>'thumb_w')::int = 180 and (p->'shorts'->0->>'thumb_h')::int = 320, format('%s', p->'shorts'->0);
  assert jsonb_array_length((app.football_videos(v_a, v_now, 2))->'shorts') = 2;

  p := app.football_videos(v_n, v_now);
  assert pg_temp.titles(p, 'shorts') = array['T short 1 day', 'S league 2 days', 'S Chivas 3 days', 'S national 1h'],
    format('no team: the league''s Shorts (a Short about América is the league''s too), then the national team''s: %s', pg_temp.titles(p, 'shorts'));
  raise notice 'PASS futbol v2 league and shorts: 14 days; Shorts of the team, the league, the national team, never the women''s in the men''s';
end $$;

-- ---------------------------------------------------------------------------
-- National teams from stored video_nations rows.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000033a1';
  v_h   uuid := '99990000-0000-4000-8000-0000000033a3';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  v_i := pg_temp.vid('v2-mx-fmf', 'n1', 'N presentación 2 days', v_now - interval '2 days', 'other');             perform pg_temp.vn(v_i, 'MX', false, 'national_channel');
  v_i := pg_temp.vid('v2-mx-tv1', 'n2', 'N México vs Panamá 1 day', v_now - interval '1 day', 'highlight');        perform pg_temp.vn(v_i, 'MX', false, 'name+match'); perform pg_temp.vn(v_i, 'HN', false, 'name+match');
  v_i := pg_temp.vid('v2-mx-tv1', 'n3', 'N talk show about El Tri', v_now - interval '3 hours', 'other');           perform pg_temp.vn(v_i, 'MX');
  v_i := pg_temp.vid('v2-mx-tv1', 'n4', 'N 31 days', v_now - interval '31 days', 'highlight');                     perform pg_temp.vn(v_i, 'MX');
  v_i := pg_temp.vid('v2-mx-fmf', 'n5', 'NW Tri Femenil resumen', v_now - interval '5 hours', 'highlight');          perform pg_temp.vn(v_i, 'MX', true);
  -- Already their team's video: not repeated under the national team.
  update videos set published_at = published_at where title = 'T highlight 2h';
  perform pg_temp.vn((select id from videos where title = 'T highlight 2h'), 'MX');
  v_i := pg_temp.vid('v2-concacaf', 'n6', 'N Concacaf preview', v_now - interval '6 hours', 'preview');             perform pg_temp.vn(v_i, 'MX');

  p := app.football_videos(v_a, v_now);
  assert pg_temp.titles(p, 'national') = array['N México vs Panamá 1 day', 'N Concacaf preview', 'N presentación 2 days'],
    format('the men''s national team: highlights, then previews, then the federation''s own other videos; no talk show, no 31 days, not in team: %s', pg_temp.titles(p, 'national'));
  assert pg_temp.titles(p, 'national_women') = array['NW Tri Femenil resumen'], format('%s', pg_temp.titles(p, 'national_women'));
  assert p->>'country' = 'MX';
  assert (select array_agg(e->>'name' order by o) from jsonb_array_elements(p->'channels') with ordinality a(e, o))
         = array['Channel v2-mx-america', 'Channel v2-mx-league', 'Channel v2-mx-fmf', 'Channel v2-mx-tv1', 'Channel v2-mx-tv2'],
    format('club, league, national team, broadcasters; not the confederation: %s', p->'channels');

  p := app.football_videos(v_h, v_now);
  assert pg_temp.titles(p, 'national') = array['N México vs Panamá 1 day'] and p->'national_women' = '[]'::jsonb,
    format('Honduras gets the match it played, nothing of Mexico''s: %s', p);
  assert p->'team_videos' = '[]'::jsonb and p->'shorts' = '[]'::jsonb, format('%s', p);
  raise notice 'PASS futbol v2 national: stored matches, 30 days, the men''s and the women''s apart, not repeated from team';
end $$;

-- ---------------------------------------------------------------------------
-- Team news: stored news_teams rows, 7 days, the team's country, mixed, graphic stories never first.
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000033a1';
  v_n   uuid := '99990000-0000-4000-8000-0000000033a2';
  v_h   uuid := '99990000-0000-4000-8000-0000000033a3';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_img bigint;
  p     jsonb;
begin
  insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, verified_at) values
    ('v2-mx-a', 'MX Outlet A', 'MX', null, 'https://mxa.example/', 'https://mxa.example/feed', 'es', '2026-09-15'),
    ('v2-mx-b', 'MX Outlet B', 'MX', null, 'https://mxb.example/', 'https://mxb.example/feed', 'es', '2026-09-15'),
    ('v2-hn-a', 'HN Outlet A', 'HN', null, 'https://hna.example/', 'https://hna.example/feed', 'es', '2026-09-15');
  insert into news_images (sha256, source_url, thumb, thumb_width, thumb_height, lead, lead_width, lead_height)
  values (encode(sha256('v2'::bytea), 'hex'), 'https://img.example/v2.jpg', '\xffd8ffe000'::bytea, 160, 120, '\xffd8ffe000'::bytea, 480, 360)
  returning id into v_img;
  insert into news_items (source_id, guid, url, url_key, title, published_at, image_id, image_suppressed, teams_checked_at)
  select s.id, v.guid, 'https://' || v.guid || '.example/', v.guid || '.example/', v.title, v_now - v.age, case when v.img then v_img end, v.graphic, v_now
    from (values
      ('v2-mx-a', 'g1', 'Graphic: aficionado asesinado tras el partido del América', interval '1 hour', false, 'asesinado'),
      ('v2-mx-a', 'g2', 'América anuncia refuerzo', interval '2 hours', true, null),
      ('v2-mx-b', 'g3', 'Jornada 9: América visita a Chivas', interval '3 hours', false, null),
      ('v2-mx-b', 'g4', 'América anuncia refuerzo', interval '4 hours', false, null),
      ('v2-mx-a', 'g5', 'América: la noticia de hace 8 días', interval '8 days', false, null),
      ('v2-hn-a', 'g6', 'Honduran outlet about América', interval '30 minutes', false, null),
      ('v2-mx-a', 'g7', 'Cruz Azul, not América', interval '10 minutes', false, null),
      ('v2-hn-a', 'g8', 'Graphic: muere aficionado de Motagua', interval '1 hour', false, 'muere')
    ) v(src, guid, title, age, img, graphic)
    join news_sources s on s.key = v.src;
  insert into news_teams (item_id, team_id, matched, rule)
  select i.id, pg_temp.team(case when i.guid = 'g7' then 'Cruz Azul' when i.guid = 'g8' then 'CD Motagua' else 'Club America' end), 'América', 'name+article'
    from news_items i where i.guid in ('g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8');

  p := app.team_news(v_a, v_now);
  assert (select array_agg(e->>'title' order by o) from jsonb_array_elements(p->'items') with ordinality a(e, o))
         = array['América anuncia refuerzo', 'Graphic: aficionado asesinado tras el partido del América', 'Jornada 9: América visita a Chivas'],
    format('newest non-graphic story first, the graphic one after it; a repeated headline once; 7 days; the team''s country only: %s', p->'items');
  assert (p->'items'->0->>'image')::boolean and not (p->'items'->1->>'image')::boolean, format('%s', p->'items');
  assert p->'items'->0 ?& array['id', 'title', 'summary', 'url', 'source', 'source_url', 'published_at', 'image', 'thumb_w', 'thumb_h', 'lead_w', 'lead_h', 'mentions'],
    format('news_page''s item shape: %s', p->'items'->0);
  assert p->'team' = jsonb_build_object('id', pg_temp.team('Club America'), 'name', 'Club America') and (p->>'stale')::boolean and p->'updated_at' = 'null'::jsonb, format('%s', p);

  p := app.team_news(v_a, v_now, 1);
  assert jsonb_array_length(p->'items') = 1 and p->'items'->0->>'title' = 'América anuncia refuerzo', format('%s', p->'items');

  p := app.team_news(v_h, v_now);
  assert p->'items' = '[]'::jsonb, format('only a graphic story: none leads, so none: %s', p->'items');
  p := app.team_news(v_n, v_now);
  assert p->'items' = '[]'::jsonb and p->'team' = 'null'::jsonb, format('no team, no team news: %s', p);
  assert app.team_news('99990000-0000-4000-8000-00000000ffff', v_now) is null, 'unknown member';

  insert into source_runs (feed, started_at, finished_at, status) values ('news', v_now - interval '31 minutes', v_now - interval '30 minutes', 'ok');
  p := app.team_news(v_a, v_now);
  assert not (p->>'stale')::boolean and (p->>'updated_at')::timestamptz = v_now - interval '30 minutes', format('%s', p);
  raise notice 'PASS futbol v2 team news: stored matches, 7 days, the team''s country, mixed, graphic never first, stale and updated_at';
end $$;

-- ---------------------------------------------------------------------------
-- football_page: videos {team, league, shorts, national (8), updated_at, stale} and team_news (4).
do $$
declare
  v_a   uuid := '99990000-0000-4000-8000-0000000033a1';
  v_n   uuid := '99990000-0000-4000-8000-0000000033a2';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  k     integer;
  p     jsonb;
begin
  for k in 1..9 loop
    v_i := pg_temp.vid('v2-mx-fmf', 'more-nat-' || k, 'N more ' || k, v_now - make_interval(hours => 10 + k), 'other');
    perform pg_temp.vn(v_i, 'MX', false, 'national_channel');
  end loop;
  for k in 1..12 loop
    v_i := pg_temp.vid('v2-mx-tv2', 'more-team-' || k, 'T more ' || k, v_now - make_interval(days => 2, hours => k), 'goals');
    perform pg_temp.vt(v_i, 'Club America');
  end loop;
  for k in 1..5 loop
    insert into news_items (source_id, guid, url, url_key, title, published_at, teams_checked_at)
    select id, 'more-news-' || k, 'https://more' || k || '.example/', 'more' || k || '.example/', 'Más del América ' || k, v_now - make_interval(hours => 5 + k), v_now
      from news_sources where key = 'v2-mx-b';
    insert into news_teams (item_id, team_id, matched, rule) select id, pg_temp.team('Club America'), 'América', 'alias+context' from news_items where guid = 'more-news-' || k;
  end loop;
  insert into source_runs (feed, started_at, finished_at, status) values ('videos', v_now - interval '21 minutes', v_now - interval '20 minutes', 'partial');

  p := app.football_page(v_a, v_now);
  assert p->'videos' ?& array['team', 'league', 'shorts', 'national', 'updated_at', 'stale'], format('%s', p->'videos');
  assert jsonb_array_length(p->'videos'->'team') = 10 and jsonb_array_length(p->'videos'->'league') = 2
     and jsonb_array_length(p->'videos'->'shorts') = 4 and jsonb_array_length(p->'videos'->'national') = 8,
    format('10 team, the league''s 2, 4 Shorts, 8 national: %s %s %s %s', jsonb_array_length(p->'videos'->'team'), jsonb_array_length(p->'videos'->'league'),
           jsonb_array_length(p->'videos'->'shorts'), jsonb_array_length(p->'videos'->'national'));
  assert not (p->'videos'->>'stale')::boolean and (p->'videos'->>'updated_at')::timestamptz = v_now - interval '20 minutes', format('%s', p->'videos');
  assert jsonb_array_length((app.football_videos(v_a, v_now))->'national') = 12, 'football_videos: up to 24 by default';
  assert p->'team_news' ?& array['items', 'updated_at', 'stale'] and jsonb_array_length(p->'team_news'->'items') = 4
     and p->'team_news'->'items'->0->>'title' = 'América anuncia refuerzo', format('%s', p->'team_news');
  assert p->>'team' = 'Club America' and p ? 'league_recent' and p ? 'table' and p ? 'upcoming', 'football_page otherwise unchanged';

  p := app.football_page(v_n, v_now);
  assert p->'team_news'->'items' = '[]'::jsonb and p->'videos'->'team' = '[]'::jsonb and jsonb_array_length(p->'videos'->'national') = 8, format('%s', p);
  assert app.football_page('99990000-0000-4000-8000-00000000ffff', v_now) is null, 'unknown member';
  raise notice 'PASS futbol v2 football_page: videos team 10, league 10, shorts 10, national 8, team_news 4, otherwise unchanged';
end $$;

rollback;
