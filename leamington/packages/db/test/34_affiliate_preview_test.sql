-- Affiliate preview (0051): app.prospect_preview's parts present and absent,
-- the rules each part follows (current only, newest highlight never a Short,
-- pictures first in news, alerts only while monitored and current), no client
-- data in it, only active affiliates and the owner, and the anonymous counter's
-- row-level security.
-- The clock is pinned for the parts: 2026-09-17 16:00 UTC (10:00 in Morelia,
-- 12:00 in Leamington). The alerts part uses now(), as feed_health does.
\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
-- Supabase's defaults for `authenticated`, as 02_rls_test.sql mirrors them.
grant usage on schema public, app, extensions, auth to authenticated;
grant select on all tables in schema public to authenticated;
-- Supabase grants every table privilege and leaves the rest to row-level security.
grant select, insert, update, delete on affiliate_previews to authenticated;
grant execute on all functions in schema app to authenticated;

-- Owner, two active affiliates and one deactivated one.
do $$
declare r jsonb;
begin
  r := app.portal_create_owner('preview.owner');
  perform set_config('request.jwt.claim.sub', r->>'auth_user_id', false);
  perform app.create_affiliate('Ana Preview', 'Tienda Ana', null, 0.40, 'preview.ana');
  perform app.create_affiliate('Beto Preview', null, null, 0.40, 'preview.beto');
  perform app.create_affiliate('Old Preview', null, null, 0.40, 'preview.old');
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
update affiliates set active = false where id = (select affiliate_id from portal_logins where login = 'preview.old');

create temp table t_ids as
select (select auth_user_id from portal_logins where login = 'preview.owner') as owner_auth,
       (select auth_user_id from portal_logins where login = 'preview.ana')   as ana_auth,
       (select auth_user_id from portal_logins where login = 'preview.beto')  as beto_auth,
       (select auth_user_id from portal_logins where login = 'preview.old')   as old_auth,
       (select affiliate_id from portal_logins where login = 'preview.ana')   as ana_aff,
       (select affiliate_id from portal_logins where login = 'preview.beto')  as beto_aff,
       (select id from municipalities where country = 'MX' and admin_region = 'Michoacán' and name = 'Morelia') as morelia,
       (select id from municipalities where country = 'HN' and admin_region = 'Atlántida' and name = 'La Ceiba') as ceiba,
       (select id from municipalities where country = 'JM' and admin_region = 'St. James' and name = 'Montego Bay') as montego;
grant select on t_ids to authenticated;

-- Only our rows for the controlled parts (earlier test files commit some of theirs).
update video_channels set active = false;
update news_sources set active = false;
update alert_sources set active = false;
delete from fx_rates where quote in ('MXN', 'HNL');
delete from holidays where country in ('MX', 'HN');
delete from source_runs where feed = 'alerts:JM';
delete from municipality_photos where municipality_id in (select unnest(array[morelia, ceiba, montego]) from t_ids);
delete from current_conditions where municipality_id in (select unnest(array[morelia, ceiba, montego]) from t_ids);
delete from forecasts where municipality_id in (select unnest(array[morelia, ceiba, montego]) from t_ids);

-- ---------------------------------------------------------------------------
-- Morelia: every part present
-- ---------------------------------------------------------------------------
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'MX', v.name, 'preview-test', v.sid
  from leagues l, (values ('Preview FC', 'pv-1'), ('Rival Preview', 'pv-2')) v(name, sid)
 where l.id = (select id from leagues where country = 'MX' and active order by id limit 1);
insert into teams (league_id, country, name, source, source_team_id)
select l.id, 'HN', 'Honduras Preview', 'preview-test', 'pv-3'
  from leagues l where l.id = (select id from leagues where country = 'HN' and active order by id limit 1);

insert into municipality_photos (municipality_id, content_type, bytes, width, height, sha256, file_title, source_page_url, article_url, author, license, license_url)
select morelia, 'image/jpeg', decode('ffd8ffe0', 'hex'), 480, 320, 'pv', 'File:Preview.jpg',
       'https://commons.wikimedia.org/wiki/File:Preview.jpg', 'https://es.wikipedia.org/wiki/Morelia', 'Preview Photographer', 'CC BY-SA 4.0',
       'https://creativecommons.org/licenses/by-sa/4.0/' from t_ids;

insert into current_conditions (municipality_id, provider, observed_at, temp_c, feels_like_c, humidity, wind_kph, condition, is_day, fetched_at)
select morelia, v.p::forecast_provider, timestamptz '2026-09-17 15:50+00', v.t, v.t, 60, 8, 'clear', true, timestamptz '2026-09-17 15:55+00'
  from t_ids, (values ('open-meteo', 24.0), ('openweather', 25.0)) v(p, t);
insert into forecasts (municipality_id, provider, target_date, temp_max_c, precip_prob, fetched_at)
select morelia, v.p::forecast_provider, date '2026-09-17', v.t, 20, timestamptz '2026-09-17 15:00+00'
  from t_ids, (values ('open-meteo', 27.0), ('openweather', 28.0)) v(p, t);

insert into fx_rates (rate_date, quote, rate) values ('2026-09-16', 'MXN', 13.1), ('2026-09-15', 'MXN', 13.0), ('2026-09-10', 'HNL', 18.4);

insert into holidays (country, holiday_date, name, verified_at) values
  ('MX', '2026-09-16', 'Día de la Independencia', '2026-09-13'),
  ('MX', '2026-11-16', 'Día de la Revolución', '2026-09-13');

insert into fixtures (league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, source, source_fixture_id, fetched_at)
select h.league_id, h.id, a.id, v.k::timestamptz, v.s::fixture_status, v.hs, v.aw, 'preview-test', v.sid, v.k::timestamptz
  from teams h, teams a,
       (values ('2026-09-14 01:00+00', 'finished', 2, 1, 'pvf-1'), ('2026-09-07 01:00+00', 'finished', 0, 0, 'pvf-2'),
               ('2026-09-20 01:00+00', 'scheduled', null, null, 'pvf-3')) v(k, s, hs, aw, sid)
 where h.name = 'Preview FC' and a.name = 'Rival Preview';

insert into video_channels (key, name, youtube_channel_id, country, league_id, kind, verified_at)
select 'pv-league', 'Preview League Channel', 'UC' || substr(md5('pv-league'), 1, 22), 'MX', l.id, 'league', date '2026-09-15'
  from leagues l where l.id = (select id from leagues where country = 'MX' and active order by id limit 1);
create function pg_temp.vid(p_key text, p_title text, p_at timestamptz, p_category text, p_short boolean default false) returns bigint language sql as $$
  insert into videos (channel_id, youtube_id, url, title, published_at, category, is_short, views, thumb, thumb_w, thumb_h, thumb_checked_at, classified_at)
  select c.id, substr(md5(p_key), 1, 11),
         case when p_short then 'https://www.youtube.com/shorts/' else 'https://www.youtube.com/watch?v=' end || substr(md5(p_key), 1, 11),
         p_title, p_at, p_category, p_short, 10, '\xffd8ffe000'::bytea,
         case when p_short then 180 else 320 end, case when p_short then 320 else 180 end, p_at, p_at
    from video_channels c where c.key = 'pv-league'
  returning id
$$;
create function pg_temp.vt(p_video bigint) returns void language sql as $$
  insert into video_teams (video_id, team_id, matched, rule) select p_video, id, name, 'name' from teams where name = 'Preview FC'
$$;
select pg_temp.vt(pg_temp.vid('pv-a', 'Team Highlight Newest', '2026-09-15 16:00+00', 'highlight'));
select pg_temp.vt(pg_temp.vid('pv-b', 'Team Highlight Older', '2026-09-12 16:00+00', 'goals'));
select pg_temp.vt(pg_temp.vid('pv-c', 'Team Short Newer', '2026-09-17 15:00+00', 'highlight', true));
select pg_temp.vt(pg_temp.vid('pv-d', 'Team Interview Newer', '2026-09-17 14:00+00', 'interview'));
select pg_temp.vid('pv-e', 'League Highlight Newer', '2026-09-16 16:00+00', 'highlight');

create function pg_temp.pic() returns bigint language sql as $$
  insert into news_images (sha256, source_url, thumb, thumb_width, thumb_height, lead, lead_width, lead_height)
  values (md5(random()::text) || md5(random()::text), 'https://img.example/p.jpg', '\xffd8ff00', 160, 90, '\xffd8ff0000', 480, 270)
  returning id
$$;
insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, verified_at) values
  ('pv-mich', 'Outlet Michoacán', 'MX', 'Michoacán', 'https://pv-mich.example/', 'https://pv-mich.example/feed', 'es', '2026-09-14'),
  ('pv-nat', 'Outlet Nacional', 'MX', null, 'https://pv-nat.example/', 'https://pv-nat.example/feed', 'es', '2026-09-14');
create function pg_temp.story(p_key text, p_guid text, p_title text, p_at timestamptz, p_pic boolean) returns bigint language sql as $$
  insert into news_items (source_id, guid, url, url_key, title, summary, published_at, image_id)
  select s.id, p_guid, 'https://' || p_key || '.example/' || p_guid, p_key || '.example/' || p_guid,
         p_title, 'Resumen: ' || p_title, p_at, case when p_pic then pg_temp.pic() end
    from news_sources s where s.key = p_key
  returning id
$$;
insert into news_mentions (item_id, municipality_id, matched, rule)
select x, (select morelia from t_ids), 'Morelia', 'name'
  from unnest(array[pg_temp.story('pv-mich', 'a', 'Town Story With Picture', '2026-09-15 16:00+00', true),
                    pg_temp.story('pv-mich', 'b', 'Town Story No Picture', '2026-09-17 15:00+00', false)]) x;
select pg_temp.story('pv-mich', 'c', 'Region Story With Picture', '2026-09-16 16:00+00', true);
select pg_temp.story('pv-nat', 'd', 'National Story With Picture', '2026-09-17 15:30+00', true);

-- A client in Morelia with the same team: nothing of theirs may appear.
insert into clients (id, affiliate_id, code, full_name, country, language, timezone, team_id, municipality_id, admin_region)
select '99990000-0000-4000-8000-0000000034c1', ana_aff, 'ZPVWEC42', 'Secreta Clienta Morelia', 'MX', 'es', 'America/Toronto',
       (select id from teams where name = 'Preview FC'), morelia, 'Michoacán' from t_ids;

-- ---------------------------------------------------------------------------
-- As Ana (an active affiliate)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select ana_auth::text from t_ids), false),
       set_config('request.jwt.claim.role', 'authenticated', false) \g /dev/null
set role authenticated;

do $$
declare
  v_t   t_ids%rowtype;
  p     jsonb;
  n     jsonb;
  now_  timestamptz := '2026-09-17 16:00+00';
  team  bigint := (select id from teams where name = 'Preview FC');
begin
  select * into v_t from t_ids;
  p := app.prospect_preview(v_t.morelia, team, 'es', now_);

  if p->'municipality' <> jsonb_build_object('id', v_t.morelia, 'name', 'Morelia', 'admin_region', 'Michoacán', 'country', 'MX', 'timezone', 'America/Mexico_City') then
    raise exception 'FAIL preview: municipality part %', p->'municipality';
  end if;
  raise notice 'PASS preview: municipality has name, admin_region, country and timezone';

  if p->'team'->>'name' <> 'Preview FC' or p->'team' ? 'crest' is not true then
    raise exception 'FAIL preview: team part %', p->'team';
  end if;
  if p->'photo'->>'author' <> 'Preview Photographer' or p->'photo'->>'license' <> 'CC BY-SA 4.0'
     or p->'photo'->>'source_page_url' is null or (p->'photo'->>'municipality_id')::bigint <> v_t.morelia then
    raise exception 'FAIL preview: photo part %', p->'photo';
  end if;
  raise notice 'PASS preview: photo carries its credit (author, license, source page)';

  if p->'now' is null or p->'now'->>'temp' is null or (p->'now'->>'providers')::int <> 2 or p->'now'->>'observed_at' is null
     or p->'now' <> app.current_summary(v_t.morelia, null, now_, 'es') then
    raise exception 'FAIL preview: now part %', p->'now';
  end if;
  if p->'today'->>'date' <> '2026-09-17' or p->'today' <> app.forecast_summary(v_t.morelia, date '2026-09-17', now_, 'es') then
    raise exception 'FAIL preview: today part % (the town''s local today)', p->'today';
  end if;
  raise notice 'PASS preview: now is current_summary (with observed_at) and today is forecast_summary for the town''s local date';

  if p->'time' <> jsonb_build_object('local', '10:00', 'date', '2026-09-17', 'timezone', 'America/Mexico_City',
                                     'leamington_timezone', 'America/Toronto', 'offset_minutes', -120) then
    raise exception 'FAIL preview: time part %', p->'time';
  end if;
  raise notice 'PASS preview: local time 10:00, two hours behind Leamington';

  if p->'fx'->>'currency' <> 'MXN' or (p->'fx'->>'rate')::numeric <> 13.1 or p->'fx'->>'date' <> '2026-09-16'
     or p->'fx'->>'note' <> 'tasa de referencia' then
    raise exception 'FAIL preview: fx part %', p->'fx';
  end if;
  raise notice 'PASS preview: fx is the latest reference rate with its date, labelled tasa de referencia';

  if p->'video'->>'title' <> 'Team Highlight Newest' or p->'video'->>'scope' <> 'team' or (p->'video'->>'is_short')::boolean
     or not (p->'video'->>'thumb')::boolean then
    raise exception 'FAIL preview: video part % (newest team highlight, never a Short or an interview)', p->'video';
  end if;
  raise notice 'PASS preview: video is the team''s newest highlight, not a newer Short or interview';

  if p->'result'->>'home_score' <> '2' or p->'result'->>'away_score' <> '1' or p->'result'->>'status' <> 'finished' then
    raise exception 'FAIL preview: result part %', p->'result';
  end if;
  raise notice 'PASS preview: result is the team''s latest final score, not a later scheduled match';

  if p->'holiday' <> jsonb_build_object('date', '2026-11-16', 'name', 'Día de la Revolución', 'days_left', 60, 'verified_at', '2026-09-13') then
    raise exception 'FAIL preview: holiday part %', p->'holiday';
  end if;
  raise notice 'PASS preview: holiday is the next one at home, with days_left and verified_at';

  if (select array_agg(e->>'title' order by o) from jsonb_array_elements(p->'news') with ordinality a(e, o))
     <> array['Town Story With Picture', 'Region Story With Picture'] then
    raise exception 'FAIL preview: news part %', p->'news';
  end if;
  if not (p->'news'->0->>'image')::boolean or p->'news'->0->>'source' <> 'Outlet Michoacán' or p->'news'->0->>'published_at' is null then
    raise exception 'FAIL preview: news item shape %', p->'news'->0;
  end if;
  raise notice 'PASS preview: news is at most 2, town then region, pictures first, never national';

  if (p->>'alerts_active')::boolean then
    raise exception 'FAIL preview: alerts_active true with no monitored source';
  end if;
  raise notice 'PASS preview: alerts_active false where no source is monitored';

  -- No client data.
  if p::text ilike '%Secreta%' or p::text like '%ZPVWEC42%' or p::text like '%99990000-0000-4000-8000-0000000034c1%'
     or p::text like '%' || v_t.ana_aff::text || '%' then
    raise exception 'FAIL preview: client or affiliate data in the preview';
  end if;
  if exists (select 1 from pg_proc where proname = 'prospect_preview' and prosrc ~* '\m(clients|client_watch_locations|subscriptions|notifications|client_preferences)\M') then
    raise exception 'FAIL preview: prospect_preview reads a client table';
  end if;
  raise notice 'PASS preview: no client name, code, id or affiliate id, and the function reads no client table';

  -- No team: the league's newest highlight, labelled as the league's; no result, no team.
  n := app.prospect_preview(v_t.morelia, null, 'en', now_);
  if n->'video'->>'title' <> 'League Highlight Newer' or n->'video'->>'scope' <> 'league' or n->'video'->>'league' is null
     or n->>'result' is not null or n->>'team' is not null or n->'fx'->>'note' <> 'reference rate' then
    raise exception 'FAIL preview: no-team preview %', jsonb_build_object('video', n->'video', 'result', n->'result', 'fx', n->'fx');
  end if;
  raise notice 'PASS preview: without a team, the league''s newest highlight (scope league), no result, English labels';

  -- La Ceiba: nothing stored for it.
  n := app.prospect_preview(v_t.ceiba, (select id from teams where name = 'Honduras Preview'), 'es', now_);
  -- ->> is SQL null for a JSON null, so these test the parts are absent.
  if n->>'photo' is not null or n->>'now' is not null or n->>'today' is not null or n->>'fx' is not null or n->>'video' is not null
     or n->>'result' is not null or n->>'holiday' is not null or n->'news' <> '[]'::jsonb or (n->>'alerts_active')::boolean
     or n->'municipality'->>'name' <> 'La Ceiba' or n->'time'->>'local' <> '10:00' then
    raise exception 'FAIL preview: absent parts %', n;
  end if;
  raise notice 'PASS preview: absent parts are null (a stale HNL rate included), news [], time still there';

  -- A stale MXN rate is not shown either.
  n := app.prospect_preview(v_t.morelia, null, 'es', timestamptz '2026-09-24 16:00+00');
  if n->>'fx' is not null then
    raise exception 'FAIL preview: a rate 8 days old was shown %', n->'fx';
  end if;
  raise notice 'PASS preview: a rate more than 3 days old is not shown';

  if app.prospect_preview(-1, null, 'es', now_) is not null then
    raise exception 'FAIL preview: unknown municipality is not null';
  end if;
  begin
    perform app.prospect_preview(v_t.morelia, (select id from teams where name = 'Honduras Preview'), 'es', now_);
    raise exception 'FAIL preview: a Honduran team accepted for Morelia';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform app.prospect_preview(v_t.morelia, null, 'fr', now_);
    raise exception 'FAIL preview: language fr accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'PASS preview: unknown town is null; a team of another country and an unknown language are refused';
end $$;

-- Alerts: only while a source is monitored for the country and checked within 45 minutes.
reset role;
insert into alert_sources (country, agency, kind, feed_url, active) values ('JM', 'TEST-JMS', 'cap', 'https://example.invalid/jm', true);
insert into source_runs (feed, started_at, finished_at, status) values ('alerts:JM', now() - interval '2 hours', now() - interval '2 hours', 'ok');
set role authenticated;
do $$
begin
  if (app.prospect_preview((select montego from t_ids), null, 'en')->>'alerts_active')::boolean then
    raise exception 'FAIL preview: alerts_active true on a copy checked 2 hours ago';
  end if;
  raise notice 'PASS preview: alerts_active false when our copy is stale';
end $$;
reset role;
insert into source_runs (feed, started_at, finished_at, status) values ('alerts:JM', now() - interval '10 minutes', now() - interval '10 minutes', 'ok');
set role authenticated;
do $$
begin
  if not (app.prospect_preview((select montego from t_ids), null, 'en')->>'alerts_active')::boolean then
    raise exception 'FAIL preview: alerts_active false with a monitored, current source';
  end if;
  if (app.prospect_preview((select morelia from t_ids), null, 'es')->>'alerts_active')::boolean then
    raise exception 'FAIL preview: Jamaica''s source made Mexico active';
  end if;
  raise notice 'PASS preview: alerts_active true only for the monitored country with a current copy';
end $$;
reset role;
update alert_sources set active = false where agency = 'TEST-JMS';
set role authenticated;
do $$
begin
  if (app.prospect_preview((select montego from t_ids), null, 'en')->>'alerts_active')::boolean then
    raise exception 'FAIL preview: alerts_active true for an inactive source';
  end if;
  raise notice 'PASS preview: alerts_active false once the source is not monitored';
end $$;

-- ---------------------------------------------------------------------------
-- Who may call it
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform app.prospect_preview((select morelia from t_ids), null, 'es');
    raise exception 'FAIL access: an anonymous caller got a preview';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', (select old_auth::text from t_ids), false);
  begin
    perform app.prospect_preview((select morelia from t_ids), null, 'es');
    raise exception 'FAIL access: a deactivated affiliate got a preview';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', (select owner_auth::text from t_ids), false);
  if app.prospect_preview((select morelia from t_ids), null, 'es') is null then
    raise exception 'FAIL access: the owner got no preview';
  end if;
  perform set_config('request.jwt.claim.sub', (select beto_auth::text from t_ids), false);
  if app.prospect_preview((select morelia from t_ids), null, 'es') is null then
    raise exception 'FAIL access: an active affiliate got no preview';
  end if;
  raise notice 'PASS access: anonymous and deactivated callers are refused; active affiliates and the owner are served';
end $$;

reset role;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'prospect_preview' and prosecdef) then
    raise exception 'FAIL access: prospect_preview is security definer';
  end if;
  if has_function_privilege('public', 'app.prospect_preview(bigint, bigint, text, timestamptz)', 'execute') then
    raise exception 'FAIL access: PUBLIC can execute prospect_preview';
  end if;
  raise notice 'PASS access: security invoker, and not executable by PUBLIC';
end $$;

-- ---------------------------------------------------------------------------
-- The counter: anonymous, own rows, owner reads all
-- ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  v_t t_ids%rowtype;
  n   int;
begin
  select * into v_t from t_ids;
  perform set_config('request.jwt.claim.sub', v_t.ana_auth::text, false);
  insert into affiliate_previews (municipality_id) values (v_t.morelia), (v_t.montego);
  if (select string_agg(country::text || ':' || municipality_id, ',' order by id) from affiliate_previews)
     <> 'MX:' || v_t.morelia || ',JM:' || v_t.montego then
    raise exception 'FAIL counter: the country does not follow the town';
  end if;
  insert into affiliate_previews (municipality_id, country) values (v_t.ceiba, 'MX');
  if (select country::text from affiliate_previews where municipality_id = v_t.ceiba) <> 'HN' then
    raise exception 'FAIL counter: a country other than the town''s was stored';
  end if;
  begin
    insert into affiliate_previews (municipality_id) values (-1);
    raise exception 'FAIL counter: an unknown town was counted';
  exception when not_null_violation or foreign_key_violation then null;
  end;
  raise notice 'PASS counter: the row names the town, its country always the town''s, and an unknown town is refused';
  if (select count(*) from affiliate_previews) <> 3 or exists (select 1 from affiliate_previews where affiliate_id <> v_t.ana_aff) then
    raise exception 'FAIL counter: Ana''s rows are not hers';
  end if;
  begin
    insert into affiliate_previews (affiliate_id, municipality_id) values (v_t.beto_aff, v_t.morelia);
    raise exception 'FAIL counter: Ana recorded a preview as Beto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into affiliate_previews (municipality_id, created_at) values (v_t.morelia, now() - interval '30 days');
    raise exception 'FAIL counter: a backdated count was accepted';
  exception when insufficient_privilege then null;
  end;
  update affiliate_previews set municipality_id = v_t.ceiba;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL counter: Ana updated % counts', n; end if;
  delete from affiliate_previews;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL counter: Ana deleted % counts', n; end if;
  raise notice 'PASS counter: an affiliate records only her own current counts and cannot change or delete them';

  perform set_config('request.jwt.claim.sub', v_t.beto_auth::text, false);
  insert into affiliate_previews (municipality_id) values (v_t.ceiba);
  if exists (select 1 from affiliate_previews where municipality_id in (v_t.morelia, v_t.montego)) then
    raise exception 'FAIL counter: Beto reads the towns Ana previewed';
  end if;
  if (select count(*) from affiliate_previews) <> 1 then
    raise exception 'FAIL counter: Beto sees % rows', (select count(*) from affiliate_previews);
  end if;
  raise notice 'PASS counter: Beto sees only his own count, and none of the towns Ana previewed';

  perform set_config('request.jwt.claim.sub', v_t.old_auth::text, false);
  begin
    insert into affiliate_previews (municipality_id) values (v_t.morelia);
    raise exception 'FAIL counter: a deactivated affiliate recorded a preview';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS counter: a deactivated affiliate records nothing';

  perform set_config('request.jwt.claim.sub', v_t.owner_auth::text, false);
  if (select count(*) from affiliate_previews) <> 4
     or (select count(distinct municipality_id) from affiliate_previews) <> 3 then
    raise exception 'FAIL counter: the owner sees % rows, expected 4 across 3 towns', (select count(*) from affiliate_previews);
  end if;
  raise notice 'PASS counter: the owner reads every count and its town';
end $$;
reset role;

do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'affiliate_previews'
              and column_name not in ('id', 'affiliate_id', 'municipality_id', 'country', 'created_at')) then
    raise exception 'FAIL counter: affiliate_previews has a column beyond id, affiliate_id, municipality_id, country, created_at';
  end if;
  raise notice 'PASS counter: the row holds only affiliate, town, country and time (nothing about the prospect)';
end $$;

select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false) \g /dev/null
rollback;
