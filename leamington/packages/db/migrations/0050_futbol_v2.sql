-- 0050_futbol_v2.sql
-- Fútbol v2: more videos (national teams, Shorts, categories) and team news.
--
-- Why: the owner asked "improve the sports page. More videos please", while the
-- football data provider's account is suspended (no fixtures, standings or live
-- scores). The page is made rich from verified video channels and news.
-- Stance unchanged (docs/OPEN-DECISIONS.md 3.25, 3.24, 3.26): links to YouTube
-- and to the publisher, small cached thumbnails, never a player, never full text.
--
--   video_channels.kind 'national'  a national federation's official channel
--   video_channels.women            that channel is a women's national team's
--   videos.is_short                 a YouTube Short (url /shorts/{id}, 180 x 320 thumbnail)
--   videos.category                 highlight | goals | interview | preview | other
--                                   (services/ingest/src/feeds/videos/highlight.mjs);
--                                   is_highlight stays, kept equal to category in (highlight, goals)
--   videos.classified_at            when ingest classified the title (null: 0049 rows, backfilled)
--   video_nations                   which national team a video is about (videos/nations.mjs)
--   news_teams                      which clubs a story is about (news/teams.mjs)
--   news_items.teams_checked_at     when ingest matched the story to clubs (null: not yet)
--
-- Pages read app.football_videos (plus shorts, national, national_women),
-- app.team_news, and app.football_page ('videos' grows, 'team_news' is new).

-- ---------------------------------------------------------------------------
-- 1. Channels: national teams
-- ---------------------------------------------------------------------------

alter table video_channels drop constraint video_channels_kind_check;
alter table video_channels add constraint video_channels_kind_check
  check (kind in ('league', 'broadcaster', 'club', 'national', 'confederation'));
-- A confederation's channel (Concacaf) covers every country: no country. Its
-- videos reach members only through stored matches (video_teams, video_nations).
alter table video_channels alter column country drop not null;
alter table video_channels add constraint video_channels_country_check
  check ((country is null) = (kind = 'confederation'));
alter table video_channels add column women boolean not null default false;
-- A national channel covers its country's team: no league, no club.
alter table video_channels add constraint video_channels_national_check
  check (kind <> 'national' or (league_id is null and team_id is null));
alter table video_channels add constraint video_channels_women_check
  check (not women or kind = 'national');

-- ---------------------------------------------------------------------------
-- 2. Videos: Shorts and categories
-- ---------------------------------------------------------------------------

alter table videos add column is_short boolean not null default false;
alter table videos add column category text
  check (category in ('highlight', 'goals', 'interview', 'preview', 'other'));
alter table videos add column classified_at timestamptz;
alter table videos alter column is_highlight set default false;
update videos set category = case when is_highlight then 'highlight' else 'other' end;
alter table videos alter column category set not null;

-- A Short links to its /shorts/ page; everything else to the watch page.
alter table videos drop constraint videos_url_check;
alter table videos drop constraint videos_check;
alter table videos add constraint videos_url_check
  check (url = case when is_short then 'https://www.youtube.com/shorts/' else 'https://www.youtube.com/watch?v=' end || youtube_id);
-- A Short's thumbnail is vertical (about 180 x 320), a video's horizontal (about 320 x 180).
alter table videos add constraint videos_thumb_shape_check
  check (thumb_w is null or is_short = (thumb_h > thumb_w));

-- is_highlight is kept for pages and writers of 0049: it always equals
-- category in ('highlight', 'goals'). A writer that gives only is_highlight
-- gets category 'highlight' or 'other'; a writer that gives category wins.
create or replace function app.videos_category_sync()
returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if tg_op = 'INSERT' then
    if new.category is null then
      new.category := case when new.is_highlight then 'highlight' else 'other' end;
    end if;
  elsif new.category is distinct from old.category then
    null;
  elsif new.is_highlight is distinct from old.is_highlight then
    new.category := case when new.is_highlight then 'highlight' else 'other' end;
  end if;
  new.is_highlight := new.category in ('highlight', 'goals');
  return new;
end $$;

create trigger videos_category_sync
  before insert or update on videos
  for each row execute function app.videos_category_sync();

create index videos_short_published_idx on videos (is_short, published_at desc);

create table video_nations (
  video_id    bigint not null references videos(id) on delete cascade,
  country     country_code not null,
  -- The women's national team (never mixed into the men's).
  women       boolean not null,
  matched     text not null check (length(matched) between 1 and 120),  -- the channel, name or alias that matched
  rule        text not null check (rule in ('national_channel', 'alias', 'name+match')),
  created_at  timestamptz not null default now(),
  primary key (video_id, country, women)
);
create index video_nations_country_idx on video_nations (country, women, video_id);

alter table video_nations enable row level security;
create policy video_nations_read on video_nations for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- 3. News: the clubs a story is about
-- ---------------------------------------------------------------------------

alter table news_items add column teams_checked_at timestamptz;

create table news_teams (
  item_id     bigint not null references news_items(id) on delete cascade,
  team_id     bigint not null references teams(id) on delete cascade,
  matched     text not null check (length(matched) between 1 and 120),
  rule        text not null check (rule in ('alias+context', 'alias+club', 'name+match', 'name+article')),
  created_at  timestamptz not null default now(),
  primary key (item_id, team_id)
);
create index news_teams_team_idx on news_teams (team_id, item_id);

alter table news_teams enable row level security;
create policy news_teams_read on news_teams for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- 4. Reading videos
-- ---------------------------------------------------------------------------

-- The order a category is shown in: highlights and goals, then interviews and previews, then the rest.
create or replace function app.video_tier(p_category text)
returns integer
language sql
immutable
as $$
  select case p_category when 'highlight' then 0 when 'goals' then 0 when 'interview' then 1 when 'preview' then 1 else 2 end
$$;

-- One video as the pages show it (0049 plus category and is_short).
create or replace function app.video_json(p_video_id bigint)
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'id', v.id, 'youtube_id', v.youtube_id, 'url', v.url, 'title', v.title,
           'channel', c.name, 'published_at', v.published_at, 'views', v.views,
           'is_highlight', v.is_highlight, 'category', v.category, 'is_short', v.is_short,
           'thumb', v.thumb is not null, 'thumb_w', v.thumb_w, 'thumb_h', v.thumb_h,
           'teams', coalesce((select jsonb_agg(coalesce(t.short_name, t.name) order by coalesce(t.short_name, t.name))
                                from video_teams vt join teams t on t.id = vt.team_id
                               where vt.video_id = v.id), '[]'::jsonb))
    from videos v join video_channels c on c.id = v.channel_id
   where v.id = p_video_id
$$;

-- Up to p_limit of the candidates, by tier (app.video_tier), mixed across
-- channels within a tier: each channel's newest, then each one's second newest,
-- and so on, newest first in each round. Returned in that order.
create or replace function app.videos_mix(p_ids bigint[], p_limit integer)
returns bigint[]
language sql
stable
set search_path = public, app
as $$
  with r as (
    select v.id, app.video_tier(v.category) as tier, v.published_at,
           row_number() over (partition by v.channel_id, app.video_tier(v.category) order by v.published_at desc, v.id desc) as rn
      from videos v where v.id = any(p_ids)
  ), p as (
    select id, row_number() over (order by tier, rn, published_at desc, id desc) as o
      from r
  )
  select coalesce(array_agg(id order by o), '{}') from p where o <= greatest(coalesce(p_limit, 0), 0)
$$;

-- The Fútbol page's videos for one member. Each list holds up to p_limit.
--   team_videos     videos about their team (video_teams), 45 days: highlights and goals,
--                   then interviews and previews (not from another club's channel), then
--                   other videos only from their club's own channel or the league's
--   league_videos   highlights and goals of their league, 14 days, not in team: from the
--                   league's channels, or a broadcaster of its country naming two of its teams
--   shorts          14 days: their team's Shorts, then their league's (its channel's, or
--                   naming one of its teams), then their national team's
--   national        their country's men's national team (video_nations), 30 days, not in
--                   team or league; 'other' videos only from a national channel
--   national_women  the same for the women's national team ([] when none)
-- Sections other than shorts never hold Shorts. A member without a team gets
-- their country's league. Never "no videos": stale true when the feed has not
-- answered within 3 hours, with updated_at. Null for an unknown or inactive member.
create or replace function app.football_videos(p_client_id uuid, p_now timestamptz default now(), p_limit integer default 24)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c          clients%rowtype;
  v_team       teams%rowtype;
  v_league     leagues%rowtype;
  v_limit      integer := greatest(coalesce(p_limit, 0), 0);
  v_team_ids   bigint[];
  v_league_ids bigint[];
  v_short_ids  bigint[];
  v_s_team     bigint[];
  v_s_league   bigint[];
  v_s_nation   bigint[];
  v_nat_ids    bigint[];
  v_natw_ids   bigint[];
  v_updated    timestamptz;
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
     where c.active and not v.is_short
       and v.published_at > p_now - interval '45 days' and v.published_at <= p_now + interval '1 hour'
       -- A broadcaster's talk shows and another club's press conferences are not their team's videos.
       and (v.category in ('highlight', 'goals') or c.kind = 'league' or c.team_id = v_team.id
            or (v.category in ('interview', 'preview') and c.kind in ('broadcaster', 'national')))
       and exists (select 1 from video_teams vt where vt.video_id = v.id and vt.team_id = v_team.id)), v_limit) end;

  v_league_ids := case when v_league.id is null then '{}'::bigint[] else app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and not v.is_short and v.category in ('highlight', 'goals')
       and v.published_at > p_now - interval '14 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_team_ids)
       and (c.league_id = v_league.id
            or (c.kind = 'broadcaster' and c.country = v_league.country and c.league_id is null
                and (select count(distinct vt.team_id) from video_teams vt join teams t on t.id = vt.team_id
                      where vt.video_id = v.id and t.league_id = v_league.id) >= 2))), v_limit) end;

  -- Shorts (ingest keeps only Shorts about a team or a national team, or highlights and goals of league and national channels).
  v_s_team := case when v_team.id is null then '{}'::bigint[] else app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and v.is_short
       and v.published_at > p_now - interval '14 days' and v.published_at <= p_now + interval '1 hour'
       and exists (select 1 from video_teams vt where vt.video_id = v.id and vt.team_id = v_team.id)), v_limit) end;
  v_s_league := case when v_league.id is null then '{}'::bigint[] else app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and v.is_short
       and v.published_at > p_now - interval '14 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_s_team)
       and (c.league_id = v_league.id
            or exists (select 1 from video_teams vt join teams t on t.id = vt.team_id
                        where vt.video_id = v.id and t.league_id = v_league.id))), v_limit) end;
  v_s_nation := app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and v.is_short
       and v.published_at > p_now - interval '14 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_s_team || v_s_league)
       and exists (select 1 from video_nations vn where vn.video_id = v.id and vn.country = v_c.country and not vn.women)), v_limit);
  v_short_ids := (v_s_team || v_s_league || v_s_nation)[1:v_limit];

  v_nat_ids := app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and not v.is_short
       and v.published_at > p_now - interval '30 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_team_ids || v_league_ids)
       and (v.category <> 'other' or c.kind = 'national')
       and exists (select 1 from video_nations vn where vn.video_id = v.id and vn.country = v_c.country and not vn.women)), v_limit);

  v_natw_ids := app.videos_mix(array(
    select v.id from videos v join video_channels c on c.id = v.channel_id
     where c.active and not v.is_short
       and v.published_at > p_now - interval '30 days' and v.published_at <= p_now + interval '1 hour'
       and v.id <> all(v_team_ids || v_league_ids || v_nat_ids)
       and (v.category <> 'other' or c.kind = 'national')
       and exists (select 1 from video_nations vn where vn.video_id = v.id and vn.country = v_c.country and vn.women)), v_limit);

  return jsonb_build_object(
    'language', v_c.language,
    'country', v_c.country,
    'team', case when v_team.id is not null then jsonb_build_object('id', v_team.id, 'name', coalesce(v_team.short_name, v_team.name)) end,
    'league', case when v_league.id is not null then jsonb_build_object('id', v_league.id, 'name', v_league.name) end,
    'updated_at', v_updated,
    'stale', v_updated is null or v_updated < p_now - interval '3 hours',
    -- The channels these sections read: their club's, their league's, their country's national team's and broadcasters.
    'channels', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'url', 'https://www.youtube.com/channel/' || c.youtube_channel_id)
                                           order by case c.kind when 'club' then 0 when 'league' then 1 when 'national' then 2 else 3 end, c.name)
                            from video_channels c
                           where c.active
                             and ((v_team.id is not null and c.team_id = v_team.id)
                                  or (v_league.id is not null and c.league_id = v_league.id and c.kind <> 'club')
                                  or (v_league.id is not null and c.kind = 'broadcaster' and c.league_id is null and c.country = v_league.country)
                                  or (c.kind = 'national' and c.country = v_c.country))), '[]'::jsonb),
    'team_videos', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_team_ids) with ordinality u(x, o)),
    'league_videos', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_league_ids) with ordinality u(x, o)),
    'shorts', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_short_ids) with ordinality u(x, o)),
    'national', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_nat_ids) with ordinality u(x, o)),
    'national_women', (select coalesce(jsonb_agg(app.video_json(x) order by o), '[]'::jsonb) from unnest(v_natw_ids) with ordinality u(x, o)));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Team news
-- ---------------------------------------------------------------------------

-- Stories about the member's team (news_teams), last 7 days, from active outlets
-- of the team's country, mixed across outlets (news_mix), in news_page's item
-- shape (app.news_item_json: a suppressed story has image false). A graphic
-- story (image_suppressed) is never first: the newest other story leads, and a
-- list with only graphic stories is empty. Never "no news": stale and
-- updated_at as on the news page. items [] without a team; null for an unknown
-- or inactive member.
create or replace function app.team_news(p_client_id uuid, p_now timestamptz default now(), p_limit integer default 10)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c       clients%rowtype;
  v_team    teams%rowtype;
  v_towns   bigint[];
  v_ids     bigint[] := '{}';
  v_updated timestamptz;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  if v_c.team_id is not null then
    select * into v_team from teams where id = v_c.team_id;
  end if;
  v_towns := array_remove(array[v_c.municipality_id], null)
             || coalesce((select array_agg(w.municipality_id order by w.municipality_id) from client_watch_locations w
                           where w.client_id = p_client_id and w.municipality_id is distinct from v_c.municipality_id), '{}');
  v_updated := app.news_updated_at(p_now);

  if v_team.id is not null then
    v_ids := app.news_mix(array(
      select i.id from news_items i join news_sources s on s.id = i.source_id
       where s.active and s.country = v_team.country
         and i.published_at > p_now - interval '7 days' and i.published_at <= p_now + interval '1 hour'
         and exists (select 1 from news_teams nt where nt.item_id = i.id and nt.team_id = v_team.id)), 1000);
    v_ids := array(
      with u as (
        select x, o, i.image_suppressed is not null as graphic
          from unnest(v_ids) with ordinality u(x, o) join news_items i on i.id = u.x
      ), f as (
        select min(o) as first_ok from u where not graphic
      )
      select u.x from u, f
       where f.first_ok is not null
       order by (u.o <> f.first_ok), u.o
       limit greatest(coalesce(p_limit, 0), 0));
  end if;

  return jsonb_build_object(
    'language', v_c.language,
    'team', case when v_team.id is not null then jsonb_build_object('id', v_team.id, 'name', coalesce(v_team.short_name, v_team.name)) end,
    'updated_at', v_updated,
    'stale', v_updated is null or v_updated < p_now - interval '3 hours',
    'items', (select coalesce(jsonb_agg(app.news_item_json(x, v_towns) order by o), '[]'::jsonb) from unnest(v_ids) with ordinality u(x, o)));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Fútbol: videos grow, team news (0049 otherwise unchanged)
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

    -- Videos (0050): the first 10 of their team's, their league's and the Shorts, 8 of their
    -- national team's, with when the feed last answered.
    'videos', (
       select jsonb_build_object('team', fv->'team_videos', 'league', fv->'league_videos', 'shorts', fv->'shorts',
                                 'national', coalesce((select jsonb_agg(e order by o) from jsonb_array_elements(fv->'national') with ordinality a(e, o) where o <= 8), '[]'::jsonb),
                                 'updated_at', fv->'updated_at', 'stale', fv->'stale')
         from app.football_videos(p_client_id, p_now, 10) fv),

    -- Team news (0050): the first 4 stories about their team, with when the news feed last answered.
    'team_news', (
       select jsonb_build_object('items', tn->'items', 'updated_at', tn->'updated_at', 'stale', tn->'stale')
         from app.team_news(p_client_id, p_now, 4) tn));
end $$;
