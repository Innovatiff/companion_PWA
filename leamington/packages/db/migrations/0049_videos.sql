-- 0049_videos.sql
-- Football videos: highlights of the member's team and league, as links to YouTube.
--
-- Stance (docs/OPEN-DECISIONS.md 3.25): videos come only from the public upload
-- feeds of verified official channels (leagues, the broadcasters that post
-- highlights, clubs): https://www.youtube.com/feeds/videos.xml?channel_id=UC…,
-- no API key. Hoy keeps the title, the channel, the publish time, the video id
-- and a small cached copy of YouTube's thumbnail, credited "YouTube · {channel}",
-- and links to the video on YouTube. Hoy never embeds a player (a player would
-- make the phone call YouTube); the page says watching opens YouTube and uses
-- a lot of data.
--
--   video_channels  the verified channels (seeds/video_channels.sql)
--   videos          one row per upload (not Shorts), 60 days
--   video_teams     which teams a video is about, precomputed at ingest
--                   (services/ingest/src/feeds/videos/teams.mjs)
--
-- Written only by the ingest feed "videos" (hourly). Pages read
-- app.football_videos and app.video_thumb; app.football_page gets 'videos'.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table video_channels (
  id                  bigint generated always as identity primary key,
  key                 text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name                text not null check (length(name) between 1 and 80),
  youtube_channel_id  text not null unique check (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  country             country_code not null,
  -- The league the channel covers; null for a general sports channel.
  league_id           bigint references leagues(id) on delete set null,
  -- A club's official channel: its team. Teams are created by the fixtures feed,
  -- so the seed names the club (club_key, an entry of videos/team-aliases.json)
  -- and ingest fills team_id once that team exists.
  team_id             bigint references teams(id) on delete set null,
  club_key            text check (club_key is null or club_key ~ '^[a-z]{2}-[a-z0-9-]{1,40}$'),
  kind                text not null check (kind in ('league', 'broadcaster', 'club')),
  active              boolean not null default true,
  verified_at         date not null,
  notes               text,
  created_at          timestamptz not null default now(),
  check ((kind = 'club') = (club_key is not null)),
  check (kind = 'club' or team_id is null)
);

create table videos (
  id                bigint generated always as identity primary key,
  channel_id        bigint not null references video_channels(id) on delete cascade,
  youtube_id        text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  url               text not null check (url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'),
  title             text not null check (length(title) between 1 and 300),
  published_at      timestamptz not null,
  fetched_at        timestamptz not null default now(),
  views             bigint check (views is null or views >= 0),
  -- From the title (services/ingest/src/feeds/videos/highlight.mjs).
  is_highlight      boolean not null,
  -- YouTube's thumbnail re-encoded by ingest: a JPEG of at most 14 KB, about 320 x 180.
  thumb             bytea check (thumb is null or octet_length(thumb) between 1 and 14000),
  thumb_w           integer check (thumb_w is null or thumb_w between 1 and 320),
  thumb_h           integer check (thumb_h is null or thumb_h between 1 and 320),
  -- When ingest tried the thumbnail (made, or failed). Null: not yet, because a run's budget was spent.
  thumb_checked_at  timestamptz,
  check (url = 'https://www.youtube.com/watch?v=' || youtube_id),
  check ((thumb is null) = (thumb_w is null) and (thumb is null) = (thumb_h is null))
);
create index videos_published_idx on videos (published_at desc);
create index videos_channel_published_idx on videos (channel_id, published_at desc);

create table video_teams (
  video_id    bigint not null references videos(id) on delete cascade,
  team_id     bigint not null references teams(id) on delete cascade,
  matched     text not null check (length(matched) between 1 and 120),  -- the name or alias that matched
  rule        text not null check (rule in ('club_channel', 'name', 'name+match', 'name+fixture')),
  created_at  timestamptz not null default now(),
  primary key (video_id, team_id)
);
create index video_teams_team_idx on video_teams (team_id, video_id);

alter table video_channels enable row level security;
alter table videos         enable row level security;
alter table video_teams    enable row level security;
create policy video_channels_read on video_channels for select using (auth.role() in ('authenticated', 'service_role'));
create policy videos_read         on videos         for select using (auth.role() in ('authenticated', 'service_role'));
create policy video_teams_read    on video_teams    for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- 2. Pruning: 60 days of videos
-- ---------------------------------------------------------------------------

create or replace function app.prune_videos(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public, app
as $$
declare
  v_videos integer;
begin
  delete from videos where published_at < p_now - interval '60 days';
  get diagnostics v_videos = row_count;
  return jsonb_build_object('videos', v_videos);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Reading
-- ---------------------------------------------------------------------------

-- When the videos feed last answered: a run that finished ok or partial (some
-- channels failed, the others were read).
create or replace function app.videos_updated_at(p_now timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public, app
as $$
  select max(r.finished_at) from source_runs r
   where r.feed = 'videos' and r.status in ('ok', 'partial') and r.finished_at is not null and r.finished_at <= p_now
$$;

-- One video as the pages show it. `teams` names the teams it is about.
create or replace function app.video_json(p_video_id bigint)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'id', v.id, 'youtube_id', v.youtube_id, 'url', v.url, 'title', v.title,
           'channel', c.name, 'published_at', v.published_at, 'views', v.views,
           'is_highlight', v.is_highlight,
           'thumb', v.thumb is not null, 'thumb_w', v.thumb_w, 'thumb_h', v.thumb_h,
           'teams', coalesce((select jsonb_agg(coalesce(t.short_name, t.name) order by coalesce(t.short_name, t.name))
                                from video_teams vt join teams t on t.id = vt.team_id
                               where vt.video_id = v.id), '[]'::jsonb))
    from videos v join video_channels c on c.id = v.channel_id
   where v.id = p_video_id
$$;

-- Up to p_limit of the candidates, highlights first, mixed across channels so no
-- single channel fills the list: within highlights (then within the rest) each
-- channel's newest, then each one's second newest, and so on, newest first in
-- each round. Returned in that order.
create or replace function app.videos_mix(p_ids bigint[], p_limit integer)
returns bigint[]
language sql
stable
set search_path = public, app
as $$
  with r as (
    select v.id, v.is_highlight, v.published_at,
           row_number() over (partition by v.channel_id, v.is_highlight order by v.published_at desc, v.id desc) as rn
      from videos v where v.id = any(p_ids)
  ), p as (
    select id, row_number() over (order by is_highlight desc, rn, published_at desc, id desc) as o
      from r
  )
  select coalesce(array_agg(id order by o), '{}') from p where o <= greatest(coalesce(p_limit, 0), 0)
$$;

-- The Fútbol page's videos for one member.
--   team    videos about their team (video_teams), last 30 days, highlights first
--   league  highlights of their league, last 7 days, not already in team: from
--           channels covering that league, and from broadcaster channels of the
--           league's country when the video is about two teams of the league
-- A member without a team gets their country's league (football_page's rule).
-- Never "no videos": stale true when the feed has not answered within 3 hours,
-- with updated_at. Null for an unknown or inactive member.
create or replace function app.football_videos(p_client_id uuid, p_now timestamptz default now(), p_limit integer default 12)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c        clients%rowtype;
  v_team     teams%rowtype;
  v_league   leagues%rowtype;
  v_team_ids bigint[];
  v_league_ids bigint[];
  v_updated  timestamptz;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  if v_c.team_id is not null then
    select * into v_team from teams where id = v_c.team_id;
    select * into v_league from leagues where id = v_team.league_id;
  else
    select * into v_league from leagues lg where lg.country = v_c.country and lg.active order by lg.id limit 1;
  end if;
  v_updated := app.videos_updated_at(p_now);

  v_team_ids := case when v_team.id is null then '{}'::bigint[] else app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active
       and v.published_at > p_now - interval '30 days' and v.published_at <= p_now + interval '1 hour'
       -- Other videos (press conferences, clips, full matches) only from their club's own channel or the league's:
       -- a broadcaster's talk shows and another club's press conferences are not their team's videos.
       and (v.is_highlight or c.kind = 'league' or c.team_id = v_team.id)
       and exists (select 1 from video_teams vt where vt.video_id = v.id and vt.team_id = v_team.id)), p_limit) end;

  v_league_ids := case when v_league.id is null then '{}'::bigint[] else app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and v.is_highlight
       and v.published_at > p_now - interval '7 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_team_ids)
       and (c.league_id = v_league.id
            or (c.kind = 'broadcaster' and c.country = v_league.country and c.league_id is null
                and (select count(distinct vt.team_id) from video_teams vt join teams t on t.id = vt.team_id
                      where vt.video_id = v.id and t.league_id = v_league.id) >= 2))), p_limit) end;

  return jsonb_build_object(
    'language', v_c.language,
    'team', case when v_team.id is not null then jsonb_build_object('id', v_team.id, 'name', coalesce(v_team.short_name, v_team.name)) end,
    'league', case when v_league.id is not null then jsonb_build_object('id', v_league.id, 'name', v_league.name) end,
    'updated_at', v_updated,
    'stale', v_updated is null or v_updated < p_now - interval '3 hours',
    -- The channels these sections read: their club's, their league's, and their league country's broadcasters.
    'channels', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'url', 'https://www.youtube.com/channel/' || c.youtube_channel_id)
                                           order by case c.kind when 'club' then 0 when 'league' then 1 else 2 end, c.name)
                            from video_channels c
                           where c.active
                             and ((v_team.id is not null and c.team_id = v_team.id)
                                  or (v_league.id is not null and c.league_id = v_league.id and c.kind <> 'club')
                                  or (v_league.id is not null and c.kind = 'broadcaster' and c.league_id is null and c.country = v_league.country))), '[]'::jsonb),
    'team_videos', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_team_ids) with ordinality u(x, o)),
    'league_videos', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_league_ids) with ordinality u(x, o)));
end $$;

-- A video's thumbnail for the /video-thumb route.
create or replace function app.video_thumb(p_video_id bigint)
returns table (content_type text, bytes bytea, sha256 text, width integer, height integer)
language sql
stable
set search_path = public, app
as $$
  select 'image/jpeg'::text, v.thumb, encode(sha256(v.thumb), 'hex'), v.thumb_w, v.thumb_h
    from videos v join video_channels c on c.id = v.channel_id
   where v.id = p_video_id and v.thumb is not null and c.active
$$;

-- ---------------------------------------------------------------------------
-- 4. Fútbol: plus videos (0036 otherwise unchanged)
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
         from league_table_availability av where av.league_id = v_league),

    -- Videos (0049): the first 6 of their team's and of their league's, with when the feed last answered.
    'videos', (
       select jsonb_build_object('team', fv->'team_videos', 'league', fv->'league_videos',
                                 'updated_at', fv->'updated_at', 'stale', fv->'stale')
         from app.football_videos(p_client_id, p_now, 6) fv));
end $$;
