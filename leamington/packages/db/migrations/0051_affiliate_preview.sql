-- 0051_affiliate_preview.sql
-- "Vista previa": a personal preview for the seller.
--
-- While talking to a prospect, an affiliate picks the prospect's town (and
-- optionally a team) and shows, on the portal, what Hoy would show that person
-- today. Nothing is stored about the prospect: no name, no phone, no team, no
-- client link. The only write is an anonymous counter row (who previewed,
-- which town and its country, when), so the owner can see how often previews
-- are used and the weather feeds can fetch the towns being shown.
--
--   affiliate_previews        the counter: an affiliate inserts and reads their own rows, the owner reads all
--   app.prospect_preview(...)  every part from our database with its freshness, each null when absent
--
-- Security: prospect_preview is SECURITY INVOKER. It runs under the caller's
-- row-level security (the portal calls it inside asPerson as `authenticated`),
-- reads only feed and catalogue tables every signed-in person may read, never
-- reads clients or anything client-scoped, and refuses anyone who is not an
-- active affiliate or the owner. The Hoy functions it builds on
-- (current_summary, forecast_summary, town_photo, fixture_json, video_json,
-- videos_mix, news_item_json, news_mix, fx_currency_for, team_has_crest) are
-- place-scoped already and are reused unchanged; the client-scoped ones
-- (football_videos, news_page, holidays_here_and_there, fx_history) read the
-- client row, so their place-level rules are repeated here instead, and they
-- stay unchanged.

-- ---------------------------------------------------------------------------
-- 1. The counter
-- ---------------------------------------------------------------------------

create table affiliate_previews (
  id              bigint generated always as identity primary key,
  affiliate_id    uuid not null default app.current_affiliate_id() references affiliates(id) on delete cascade,
  -- The previewed town. A town is not personal data: no name, phone or client
  -- link is ever stored with it. The weather feeds read recent ones
  -- (services/ingest forecast.mjs targetMunicipalities), so a previewed town
  -- has "Ahora" and a forecast from their next run.
  municipality_id bigint not null references municipalities(id) on delete cascade,
  -- Always the town's country (set by the trigger below, whatever is given).
  country         country_code not null,
  created_at      timestamptz not null default now()
);
create index affiliate_previews_affiliate_idx on affiliate_previews (affiliate_id, created_at desc);
create index affiliate_previews_recent_idx on affiliate_previews (created_at desc, municipality_id);

create or replace function app.affiliate_preview_country()
returns trigger
language plpgsql
set search_path = public, app
as $$
begin
  new.country := (select m.country from municipalities m where m.id = new.municipality_id);
  return new;
end $$;

create trigger affiliate_previews_country
  before insert or update of municipality_id, country on affiliate_previews
  for each row execute function app.affiliate_preview_country();

alter table affiliate_previews enable row level security;
create policy affiliate_previews_read on affiliate_previews
  for select using (affiliate_id = app.current_affiliate_id() or app.is_owner());
-- Only for yourself, only while your account is active, and only as of now (no
-- backdated or future counts). No update or delete policy: a count once
-- recorded stays.
create policy affiliate_previews_insert on affiliate_previews
  for insert with check (affiliate_id = app.current_affiliate_id()
                         and exists (select 1 from affiliates a where a.id = affiliate_id and a.active)
                         and created_at between now() - interval '1 minute' and now() + interval '1 minute');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert on affiliate_previews to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The preview
-- ---------------------------------------------------------------------------

-- What Hoy would show a person from p_municipality_id (with team p_team_id, or
-- none) today, in p_lang. Leamington's clock is America/Toronto, as
-- app.business_today. Parts, each null when we hold nothing current for it:
--   municipality  id, name, admin_region, country, timezone
--   team          id, name, crest (only when a team is given)
--   photo         app.town_photo: author, license and source for the credit line
--   now           app.current_summary ("Ahora", observed_at and valid_until)
--   today         app.forecast_summary for the town's local today (a forecast)
--   time          the local time there, and minutes ahead of (+) or behind (-) Leamington
--   fx            the latest reference rate CAD -> the country's currency, only while
--                 current (rate_date no more than 3 days before Leamington's today, as rate_page)
--   video         the newest highlight or goals video about the team (45 days, as
--                 football_videos' team videos), else of the team's (or country's) league
--                 (14 days); scope says which. Never a Short.
--   result        the team's latest final result (final, so any age, with its date)
--   holiday       the next public holiday at home (verified_at)
--   news          up to 2 stories: naming the town (7 days), then regional outlets of its
--                 region (3 days); stories with a picture first
--   alerts_active true only when a national warning source is monitored for the country
--                 AND our copy was checked within 45 minutes (weather_page's "current")
-- Null for an unknown municipality. Raises for a caller who is not an active
-- affiliate or the owner, a language other than es/en, or a team that does not
-- play in the town's country.
create or replace function app.prospect_preview(p_municipality_id bigint, p_team_id bigint default null,
                                                p_lang text default 'es', p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app
as $$
declare
  v_m        municipalities%rowtype;
  v_team     teams%rowtype;
  v_league   leagues%rowtype;
  v_today    date;
  v_home     date;
  v_currency fx_currency;
  v_fx       record;
  v_video_id bigint;
  v_scope    text;
  v_result   bigint;
  v_news     bigint[];
  v_checked  timestamptz;
  v_monitored boolean;
begin
  if not (app.is_owner() or exists (select 1 from affiliates a where a.id = app.current_affiliate_id() and a.active)) then
    raise exception 'only an active affiliate or the owner can open a preview' using errcode = 'insufficient_privilege';
  end if;
  if p_lang is null or p_lang not in ('es', 'en') then
    raise exception 'p_lang must be es or en, got %', p_lang using errcode = 'invalid_parameter_value';
  end if;

  select * into v_m from municipalities where id = p_municipality_id;
  if not found then
    return null;
  end if;
  v_today := (p_now at time zone v_m.timezone)::date;
  v_home  := (p_now at time zone 'America/Toronto')::date;

  if p_team_id is not null then
    select t.* into v_team from teams t join leagues l on l.id = t.league_id
     where t.id = p_team_id and l.country = v_m.country;
    if not found then
      raise exception 'team % does not play in %', p_team_id, v_m.country using errcode = 'invalid_parameter_value';
    end if;
    select * into v_league from leagues where id = v_team.league_id;
  else
    select * into v_league from leagues lg where lg.country = v_m.country and lg.active order by lg.id limit 1;
  end if;

  -- Reference rate: current only.
  v_currency := app.fx_currency_for(v_m.country);
  select fr.rate_date, fr.rate into v_fx
    from fx_rates fr where fr.quote = v_currency order by fr.rate_date desc limit 1;

  -- Video: the team's newest highlight, else the league's.
  if v_team.id is not null then
    select v.id into v_video_id
      from videos v join video_channels c on c.id = v.channel_id
     where c.active and not v.is_short and v.category in ('highlight', 'goals')
       and v.published_at > p_now - interval '45 days' and v.published_at <= p_now + interval '1 hour'
       and exists (select 1 from video_teams vt where vt.video_id = v.id and vt.team_id = v_team.id)
     order by v.published_at desc, v.id desc limit 1;
    v_scope := case when v_video_id is not null then 'team' end;
  end if;
  if v_video_id is null and v_league.id is not null then
    select v.id into v_video_id
      from videos v join video_channels c on c.id = v.channel_id
     where c.active and not v.is_short and v.category in ('highlight', 'goals')
       and v.published_at > p_now - interval '14 days' and v.published_at <= p_now + interval '1 hour'
       and (c.league_id = v_league.id
            or (c.kind = 'broadcaster' and c.country = v_league.country and c.league_id is null
                and (select count(distinct vt.team_id) from video_teams vt join teams t on t.id = vt.team_id
                      where vt.video_id = v.id and t.league_id = v_league.id) >= 2))
     order by v.published_at desc, v.id desc limit 1;
    v_scope := case when v_video_id is not null then 'league' end;
  end if;

  if v_team.id is not null then
    select f.id into v_result from fixtures f
     where (f.home_team_id = v_team.id or f.away_team_id = v_team.id)
       and f.status = 'finished' and f.home_score is not null and f.away_score is not null
     order by f.kickoff_utc desc limit 1;
  end if;

  -- News: the town's own stories, then its region's outlets; a picture first.
  v_news := array(
    select x.id from (
      select i.id, 0 as sec, i.published_at,
             exists (select 1 from news_images im where im.id = i.image_id) and i.image_suppressed is null and s.show_images as pic
        from news_items i join news_sources s on s.id = i.source_id
       where s.active and i.published_at > p_now - interval '7 days' and i.published_at <= p_now + interval '1 hour'
         and exists (select 1 from news_mentions nm where nm.item_id = i.id and nm.municipality_id = v_m.id)
      union all
      select i.id, 1, i.published_at,
             exists (select 1 from news_images im where im.id = i.image_id) and i.image_suppressed is null and s.show_images
        from news_items i join news_sources s on s.id = i.source_id
       where s.active and s.country = v_m.country and s.admin_region = v_m.admin_region
         and i.published_at > p_now - interval '3 days' and i.published_at <= p_now + interval '1 hour'
         and not exists (select 1 from news_mentions nm where nm.item_id = i.id and nm.municipality_id = v_m.id)
    ) x
    order by x.pic desc, x.sec, x.published_at desc, x.id desc
    limit 2);

  select exists (select 1 from alert_sources s where s.country = v_m.country and s.active) into v_monitored;
  select h.last_ok_at into v_checked from feed_health h where h.feed = 'alerts:' || v_m.country::text;

  return jsonb_build_object(
    'language', p_lang,
    'municipality', jsonb_build_object('id', v_m.id, 'name', v_m.name, 'admin_region', v_m.admin_region,
                                       'country', v_m.country, 'timezone', v_m.timezone),
    'team', case when v_team.id is not null
                 then jsonb_build_object('id', v_team.id, 'name', coalesce(v_team.short_name, v_team.name),
                                         'crest', app.team_has_crest(v_team.id)) end,
    'photo', app.town_photo(v_m.id),
    'now', app.current_summary(v_m.id, null, p_now, p_lang),
    'today', app.forecast_summary(v_m.id, v_today, p_now, p_lang),
    'time', jsonb_build_object(
              'local', to_char(p_now at time zone v_m.timezone, 'HH24:MI'),
              'date', v_today,
              'timezone', v_m.timezone,
              'leamington_timezone', 'America/Toronto',
              'offset_minutes', (extract(epoch from (p_now at time zone v_m.timezone) - (p_now at time zone 'America/Toronto')) / 60)::int),
    'fx', case when v_fx.rate_date is not null and v_fx.rate_date >= v_home - 3
               then jsonb_build_object('currency', v_currency, 'rate', v_fx.rate, 'date', v_fx.rate_date,
                                       'note', case when p_lang = 'en' then 'reference rate' else 'tasa de referencia' end) end,
    'video', case when v_video_id is not null then app.video_json(v_video_id) || jsonb_build_object('scope', v_scope,
               'league', case when v_scope = 'league' then v_league.name end) end,
    'result', case when v_result is not null then app.fixture_json(v_result, v_m.timezone, v_today) end,
    'holiday', (select jsonb_build_object('date', h.holiday_date, 'name', h.name,
                                          'days_left', h.holiday_date - v_today, 'verified_at', h.verified_at)
                  from holidays h where h.country = v_m.country and h.holiday_date >= v_today
                 order by h.holiday_date, h.name limit 1),
    'news', (select coalesce(jsonb_agg(app.news_item_json(x, array[v_m.id]) order by o), '[]'::jsonb)
               from unnest(v_news) with ordinality u(x, o)),
    'alerts_active', v_monitored and v_checked is not null and v_checked >= p_now - interval '45 minutes');
end $$;

-- Only signed-in portal people call it (the check above refuses anyone else).
revoke execute on function app.prospect_preview(bigint, bigint, text, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.prospect_preview(bigint, bigint, text, timestamptz) to authenticated;
  end if;
end $$;
