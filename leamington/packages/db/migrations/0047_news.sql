-- 0047_news.sql
-- Noticias: news of the member's country, and of their municipio or parish.
--
-- Copyright stance (docs/OPEN-DECISIONS.md 3.24): Hoy keeps each story's
-- headline, the publisher's OWN short summary from its feed (plain text, at
-- most 300 characters), a small cached copy of the publisher's image, the
-- source name and the publish time, and links to the full article on the
-- publisher's site. Hoy never stores or shows full article text. Only official
-- RSS/Atom feeds of the publisher; images only from the item's own feed or the
-- article's og:image, always credited to the source.
--
--   news_sources   the verified outlets (seeds/news_sources.sql)
--   news_items     one row per story, 30 days
--   news_images    two JPEG variants per picture, shared by stories that use it
--   news_mentions  which of our towns a story names, precomputed at ingest
--                  (services/ingest/src/feeds/news/mentions.mjs)
--
-- Written only by the ingest feed "news" (every 30 minutes). Pages read
-- app.news_page and app.news_home; the home screen gets 'news' in app.home_more.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table news_sources (
  id            bigint generated always as identity primary key,
  key           text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name          text not null check (length(name) between 1 and 80),
  country       country_code not null,
  -- null for a national outlet; for a regional one, the exact
  -- municipalities.admin_region text of its state, department or parish.
  admin_region  text,
  homepage_url  text not null check (homepage_url ~ '^https://[^\s]+$'),
  feed_url      text not null unique check (feed_url ~ '^https://[^\s]+$'),
  language      ui_language not null,
  active        boolean not null default true,
  -- false: the outlet's stories are still shown, never its pictures (one update, no stories lost).
  show_images   boolean not null default true,
  verified_at   date not null,
  notes         text,
  created_at    timestamptz not null default now()
);

-- A regional outlet's region must be one we know, spelled as the catalogue spells it.
create or replace function app.news_source_region_known()
returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  if new.admin_region is not null and not exists (
       select 1 from municipalities m where m.country = new.country and m.admin_region = new.admin_region) then
    raise exception 'news source %: admin_region "%" is not a region of % in municipalities', new.key, new.admin_region, new.country
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger news_sources_region_known
  before insert or update of country, admin_region on news_sources
  for each row execute function app.news_source_region_known();

create table news_images (
  id            bigint generated always as identity primary key,
  sha256        text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),  -- of the downloaded original
  source_url    text not null check (source_url ~ '^https://[^\s]+$'),
  fetched_at    timestamptz not null default now(),
  thumb         bytea not null check (octet_length(thumb) between 1 and 10000),
  thumb_width   integer not null check (thumb_width between 1 and 160),
  thumb_height  integer not null check (thumb_height between 1 and 160),
  lead          bytea not null check (octet_length(lead) between 1 and 45000),
  lead_width    integer not null check (lead_width between 1 and 480),
  lead_height   integer not null check (lead_height between 1 and 480),
  content_type  text not null default 'image/jpeg' check (content_type = 'image/jpeg')
);

create table news_items (
  id            bigint generated always as identity primary key,
  source_id     bigint not null references news_sources(id) on delete cascade,
  guid          text not null check (length(guid) between 1 and 500),
  url           text not null check (url ~ '^https://[^\s]+$'),
  -- The normalised url (host without www, no tracking parameters): one story, one row, across outlets.
  url_key       text not null unique,
  title         text not null check (length(title) between 1 and 300),
  summary       text check (summary is null or length(summary) between 1 and 300),
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  image_id      bigint references news_images(id) on delete set null,
  -- When ingest looked for the story's picture (found, failed or none). Null: not yet, because a
  -- run's picture budget was spent; a later run tries while the outlet still lists the story.
  image_checked_at timestamptz,
  -- No graphic pictures: the death or violence term found in the title or summary
  -- (services/ingest/src/feeds/news/graphic.mjs). Such a story is kept; its picture is never fetched.
  image_suppressed text check (image_suppressed is null or length(image_suppressed) between 1 and 60),
  unique (source_id, guid),
  check (image_suppressed is null or image_id is null)
);
create index news_items_published_idx on news_items (published_at desc);
create index news_items_source_published_idx on news_items (source_id, published_at desc);
create index news_items_image_idx on news_items (image_id) where image_id is not null;

create table news_mentions (
  item_id          bigint not null references news_items(id) on delete cascade,
  municipality_id  bigint not null references municipalities(id) on delete cascade,
  matched          text not null check (length(matched) between 1 and 120),  -- the name, alias or parish that matched
  rule             text not null check (rule in ('name', 'alias', 'parish', 'name+region', 'name+regional_source')),
  created_at       timestamptz not null default now(),
  primary key (item_id, municipality_id)
);
create index news_mentions_municipality_idx on news_mentions (municipality_id, item_id);

alter table news_sources  enable row level security;
alter table news_items    enable row level security;
alter table news_images   enable row level security;
alter table news_mentions enable row level security;
create policy news_sources_read  on news_sources  for select using (auth.role() in ('authenticated', 'service_role'));
create policy news_items_read    on news_items    for select using (auth.role() in ('authenticated', 'service_role'));
create policy news_images_read   on news_images   for select using (auth.role() in ('authenticated', 'service_role'));
create policy news_mentions_read on news_mentions for select using (auth.role() in ('authenticated', 'service_role'));

-- ---------------------------------------------------------------------------
-- 2. Pruning: 30 days of stories, and the pictures no story uses any more
-- ---------------------------------------------------------------------------

create or replace function app.prune_news(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = public, app
as $$
declare
  v_items  integer;
  v_images integer;
begin
  delete from news_items where published_at < p_now - interval '30 days';
  get diagnostics v_items = row_count;
  delete from news_images im where not exists (select 1 from news_items i where i.image_id = im.id);
  get diagnostics v_images = row_count;
  return jsonb_build_object('items', v_items, 'images', v_images);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Reading
-- ---------------------------------------------------------------------------

-- When the news feed last answered: a run that finished ok or partial (a partial
-- run is one where some outlets failed and the others were read). feed_health's
-- last_ok_at counts only 'ok', and with ~20 outlets one is often down.
create or replace function app.news_updated_at(p_now timestamptz default now())
returns timestamptz
language sql
stable
set search_path = public, app
as $$
  select max(r.finished_at) from source_runs r
   where r.feed = 'news' and r.status in ('ok', 'partial') and r.finished_at is not null and r.finished_at <= p_now
$$;

-- One story as the pages show it. `mentions` lists the member's own towns the story names.
create or replace function app.news_item_json(p_item_id bigint, p_town_ids bigint[])
returns jsonb
language sql
stable
set search_path = public, app
as $$
  select jsonb_build_object(
           'id', i.id, 'title', i.title, 'summary', i.summary, 'url', i.url,
           'source', s.name, 'source_url', s.homepage_url, 'published_at', i.published_at,
           'image', im.id is not null,
           'thumb_w', im.thumb_width, 'thumb_h', im.thumb_height, 'lead_w', im.lead_width, 'lead_h', im.lead_height,
           'mentions', coalesce((select jsonb_agg(m.name order by m.name)
                                   from news_mentions nm join municipalities m on m.id = nm.municipality_id
                                  where nm.item_id = i.id and nm.municipality_id = any(p_town_ids)), '[]'::jsonb))
    from news_items i
    join news_sources s on s.id = i.source_id
    -- No picture for a suppressed story, nor for an outlet whose pictures are switched off.
    left join news_images im on im.id = i.image_id and i.image_suppressed is null and s.show_images
   where i.id = p_item_id
$$;

-- Up to p_limit of the candidate stories, mixed across outlets so no single one
-- fills the list: each outlet's newest first, then each one's second newest, and
-- so on (a wire story carried under the same headline by two outlets counts
-- once). Returned newest first.
create or replace function app.news_mix(p_ids bigint[], p_limit integer)
returns bigint[]
language sql
stable
set search_path = public, app
as $$
  with c as (
    select i.id, i.source_id, i.published_at, lower(regexp_replace(i.title, '\s+', ' ', 'g')) as t
      from news_items i where i.id = any(p_ids)
  ), d as (
    select distinct on (t) id, source_id, published_at from c order by t, published_at desc, id desc
  ), r as (
    select id, published_at, row_number() over (partition by source_id order by published_at desc, id desc) as rn from d
  ), p as (
    select id, published_at from r order by rn, published_at desc, id desc limit greatest(coalesce(p_limit, 0), 0)
  )
  select coalesce(array_agg(id order by published_at desc, id desc), '{}') from p
$$;

-- The Noticias page for one member.
--   local     stories naming their hometown or a town they watch, last 7 days
--   region    stories of regional outlets of their hometown's region, last 3 days
--   national  stories of national outlets of their country, last 48 hours
-- A story appears in one section only (local, then region, then national).
-- Never "no news": when the feed has not answered within 3 hours the stories we
-- have are still returned, with stale true and updated_at, so the page can say
-- when it was last updated. Null for an unknown or inactive member.
create or replace function app.news_page(p_client_id uuid, p_now timestamptz default now(), p_limit integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c        clients%rowtype;
  v_home     municipalities%rowtype;
  v_towns    bigint[];
  v_local    bigint[];
  v_region   bigint[];
  v_national bigint[];
  v_updated  timestamptz;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  select * into v_home from municipalities where id = v_c.municipality_id;
  v_towns := array_remove(array[v_c.municipality_id], null)
             || coalesce((select array_agg(w.municipality_id order by w.municipality_id) from client_watch_locations w
                           where w.client_id = p_client_id and w.municipality_id is distinct from v_c.municipality_id), '{}');
  v_updated := app.news_updated_at(p_now);

  v_local := app.news_mix(array(
    select i.id from news_items i join news_sources s on s.id = i.source_id
     where s.active
       and i.published_at > p_now - interval '7 days' and i.published_at <= p_now + interval '1 hour'
       and exists (select 1 from news_mentions nm where nm.item_id = i.id and nm.municipality_id = any(v_towns))), p_limit);

  v_region := case when v_home.id is null then '{}'::bigint[] else app.news_mix(array(
    select i.id from news_items i join news_sources s on s.id = i.source_id
     where s.active and s.country = v_home.country and s.admin_region = v_home.admin_region
       and i.published_at > p_now - interval '3 days' and i.published_at <= p_now + interval '1 hour'
       and i.id <> all(v_local)), p_limit) end;

  v_national := app.news_mix(array(
    select i.id from news_items i join news_sources s on s.id = i.source_id
     where s.active and s.country = v_c.country and s.admin_region is null
       and i.published_at > p_now - interval '48 hours' and i.published_at <= p_now + interval '1 hour'
       and i.id <> all(v_local) and i.id <> all(v_region)), p_limit);

  return jsonb_build_object(
    'language', v_c.language,
    'country', v_c.country,
    'municipality', case when v_home.id is not null
       then jsonb_build_object('id', v_home.id, 'name', v_home.name, 'admin_region', v_home.admin_region) end,
    'updated_at', v_updated,
    'stale', v_updated is null or v_updated < p_now - interval '3 hours',
    'sources', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'homepage_url', s.homepage_url)
                                          order by (s.admin_region is null), s.name)
                           from news_sources s
                          where s.active and s.country = v_c.country
                            and (s.admin_region is null or (v_home.id is not null and s.admin_region = v_home.admin_region))), '[]'::jsonb),
    'local',    (select coalesce(jsonb_agg(app.news_item_json(x, v_towns) order by o), '[]'::jsonb) from unnest(v_local) with ordinality u(x, o)),
    'region',   (select coalesce(jsonb_agg(app.news_item_json(x, v_towns) order by o), '[]'::jsonb) from unnest(v_region) with ordinality u(x, o)),
    'national', (select coalesce(jsonb_agg(app.news_item_json(x, v_towns) order by o), '[]'::jsonb) from unnest(v_national) with ordinality u(x, o)));
end $$;

-- News on the home screen: one lead story with a picture (their towns first,
-- else their country's) and two more headlines (their towns first). Null when
-- there is nothing to show; stale as on the page.
create or replace function app.news_home(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_p     jsonb;
  v_lead  jsonb;
  v_more  jsonb;
begin
  v_p := app.news_page(p_client_id, p_now, 30);
  if v_p is null then
    return null;
  end if;
  select e into v_lead from (
    select e, 1 as sec, o from jsonb_array_elements(v_p->'local') with ordinality a(e, o) where (e->>'image')::boolean
    union all
    select e, 2, o from jsonb_array_elements(v_p->'national') with ordinality a(e, o) where (e->>'image')::boolean
  ) s order by sec, o limit 1;

  select jsonb_agg(e order by sec, o) into v_more from (
    select e, sec, o from (
      select e, 1 as sec, o from jsonb_array_elements(v_p->'local') with ordinality a(e, o)
      union all
      select e, 2, o from jsonb_array_elements(v_p->'region') with ordinality a(e, o)
      union all
      select e, 3, o from jsonb_array_elements(v_p->'national') with ordinality a(e, o)
    ) all_items
    where v_lead is null or (e->>'id') <> (v_lead->>'id')
    order by sec, o limit 2
  ) s;

  if v_lead is null and v_more is null then
    return null;
  end if;
  return jsonb_build_object('lead', v_lead, 'more', coalesce(v_more, '[]'::jsonb),
                            'updated_at', v_p->'updated_at', 'stale', v_p->'stale');
end $$;

-- A story's picture for /news-image routes: the thumb or the lead variant.
create or replace function app.news_image(p_item_id bigint, p_variant text)
returns table (content_type text, bytes bytea, sha256 text, width integer, height integer)
language sql
stable
set search_path = public, app
as $$
  select im.content_type,
         case p_variant when 'thumb' then im.thumb else im.lead end,
         im.sha256 || '-' || p_variant,
         case p_variant when 'thumb' then im.thumb_width else im.lead_width end,
         case p_variant when 'thumb' then im.thumb_height else im.lead_height end
    from news_items i
    join news_sources s on s.id = i.source_id
    join news_images im on im.id = i.image_id
   where i.id = p_item_id and p_variant in ('thumb', 'lead')
     and i.image_suppressed is null and s.show_images
$$;

-- ---------------------------------------------------------------------------
-- 4. Home: plus news, one lead story and two headlines (0044 otherwise unchanged)
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
  v_b     jsonb;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_c.timezone)::date;
  v_f := app.football_page(p_client_id, p_now);
  v_w := app.weather_page(p_client_id, p_now);
  v_b := app.member_badges(p_client_id, p_now);

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
        order by s.start_date, s.event_name limit 1) end,

    -- Round 2: the member card, the season ring, badges, the welcome screen, and
    -- the hometown clock's time zone (null until a hometown is set).
    'member', app.member_card(p_client_id, p_now),
    'season', app.season_progress(p_client_id, p_now),
    'badges_earned', (select count(*) from jsonb_array_elements(coalesce(v_b, '[]'::jsonb)) b where (b->>'earned')::boolean),
    'badges_total', jsonb_array_length(coalesce(v_b, '[]'::jsonb)),
    'welcomed', v_c.welcomed_at is not null,
    'home_timezone', (select m.timezone from municipalities m where m.id = v_c.municipality_id),

    -- Round 4: Leamington's working day in icons (0044 rules; null without qualifying data).
    'workday', app.workday_outlook('leamington', p_now, v_c.language::text),

    -- Noticias (0047): a lead story and two more headlines; null without stories.
    'news', app.news_home(p_client_id, p_now));
end $$;
