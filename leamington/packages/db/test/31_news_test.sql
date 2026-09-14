-- Noticias (0047): sections and their windows, outlet mixing, local stories from
-- stored mentions only, the stale flag, news on the home screen, and pruning.
-- The clock is pinned: 2026-09-17 16:00 UTC.
-- Clients (all America/Toronto):
--   H  Honduras, es, hometown San Pedro Sula (Cortés), watches La Ceiba
--   M  Mexico, es, hometown Zamora (Michoacán)
--   G  Guatemala, es, no hometown, and no stories of Guatemala
\set ON_ERROR_STOP on
begin;

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000031', 'News Test');
insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, timezone)
select v.id::uuid, '99990000-0000-4000-8000-000000000031', v.code, v.name, v.country::country_code, 'es',
       m.id, m.name, 'America/Toronto'
  from (values
    ('99990000-0000-4000-8000-0000000003a1', 'ZECTAQ32', 'News Honduras', 'HN', 'Cortés', 'San Pedro Sula'),
    ('99990000-0000-4000-8000-0000000003a2', 'ZECTAQ33', 'News Mexico',   'MX', 'Michoacán', 'Zamora'),
    ('99990000-0000-4000-8000-0000000003a3', 'ZECTAQ34', 'News Guate',    'GT', null, null)
  ) v(id, code, name, country, region, town)
  left join municipalities m on m.country = v.country::country_code and m.admin_region = v.region and m.name = v.town;
insert into client_watch_locations (client_id, municipality_id)
select '99990000-0000-4000-8000-0000000003a1', id from municipalities where country = 'HN' and admin_region = 'Atlántida' and name = 'La Ceiba';
insert into subscriptions (client_id, period_start, period_end, paid_at, kind, affiliate_id)
select id, date '2026-03-01', date '2099-01-01', '2026-03-01 15:00+00', 'sale', affiliate_id from clients where code like 'ZECTAQ3_';

create function pg_temp.src(p_key text, p_country text, p_region text) returns bigint language sql as $$
  insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, verified_at)
  values (p_key, 'Outlet ' || p_key, p_country::country_code, p_region, 'https://' || p_key || '.example/',
          'https://' || p_key || '.example/feed', 'es', date '2026-09-14')
  returning id
$$;
create function pg_temp.pic() returns bigint language sql as $$
  insert into news_images (sha256, source_url, thumb, thumb_width, thumb_height, lead, lead_width, lead_height)
  values (md5(random()::text) || md5(random()::text), 'https://img.example/p.jpg', '\xffd8ff00', 160, 90, '\xffd8ff0000', 480, 270)
  returning id
$$;
create function pg_temp.item(p_key text, p_guid text, p_title text, p_at timestamptz, p_pic boolean default false) returns bigint language sql as $$
  insert into news_items (source_id, guid, url, url_key, title, summary, published_at, image_id)
  select s.id, p_guid, 'https://' || p_key || '.example/' || p_guid, p_key || '.example/' || p_guid,
         p_title, 'Resumen: ' || p_title, p_at, case when p_pic then pg_temp.pic() end
    from news_sources s where s.key = p_key
  returning id
$$;
create function pg_temp.mention(p_item bigint, p_country text, p_region text, p_name text, p_matched text, p_rule text default 'name') returns void language sql as $$
  insert into news_mentions (item_id, municipality_id, matched, rule)
  select p_item, m.id, p_matched, p_rule from municipalities m
   where m.country = p_country::country_code and m.admin_region = p_region and m.name = p_name
$$;
-- Titles of one section, in order.
create function pg_temp.titles(p jsonb, p_section text) returns text[] language sql as $$
  select coalesce(array_agg(e->>'title' order by o), '{}') from jsonb_array_elements(p->p_section) with ordinality a(e, o)
$$;

select pg_temp.src('t-hn-a', 'HN', null);
select pg_temp.src('t-hn-b', 'HN', null);
select pg_temp.src('t-hn-c', 'HN', null);
select pg_temp.src('t-hn-cortes', 'HN', 'Cortés');
select pg_temp.src('t-hn-atlantida', 'HN', 'Atlántida');
select pg_temp.src('t-mx-nat', 'MX', null);
select pg_temp.src('t-mx-mich', 'MX', 'Michoacán');

-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform pg_temp.src('t-bad-region', 'HN', 'Michoacán');
    assert false, 'a regional outlet of a region Honduras does not have is refused';
  exception when check_violation then null;
  end;
  begin
    insert into news_items (source_id, guid, url, url_key, title, published_at)
    select id, 'x', 'http://t-hn-a.example/x', 'x', 'Insecure', now() from news_sources where key = 't-hn-a';
    assert false, 'an http url is refused';
  exception when check_violation then null;
  end;
  begin
    insert into news_items (source_id, guid, url, url_key, title, summary, published_at)
    select id, 'y', 'https://t-hn-a.example/y', 'y', 'Long', repeat('a', 301), now() from news_sources where key = 't-hn-a';
    assert false, 'a summary over 300 characters is refused';
  exception when check_violation then null;
  end;
  begin
    insert into news_images (sha256, source_url, thumb, thumb_width, thumb_height, lead, lead_width, lead_height)
    values (repeat('a', 64), 'https://img.example/big.jpg', decode(repeat('ff', 10001), 'hex'), 160, 90, '\xff', 480, 270);
    assert false, 'a thumb over 10 KB is refused';
  exception when check_violation then null;
  end;
  raise notice 'PASS news tables: known regions, https only, 300-character summaries, image byte limits';
end $$;

-- ---------------------------------------------------------------------------
-- Sections and windows (client H, no news run yet)
do $$
declare
  v_h   uuid := '99990000-0000-4000-8000-0000000003a1';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  -- Local: San Pedro Sula (home) within 7 days, La Ceiba (watched), not 8 days old.
  v_i := pg_temp.item('t-hn-a', 'l1', 'Local SPS six days', v_now - interval '6 days');
  perform pg_temp.mention(v_i, 'HN', 'Cortés', 'San Pedro Sula', 'SPS', 'alias');
  v_i := pg_temp.item('t-hn-b', 'l2', 'Local La Ceiba yesterday', v_now - interval '1 day', true);
  perform pg_temp.mention(v_i, 'HN', 'Atlántida', 'La Ceiba', 'La Ceiba');
  v_i := pg_temp.item('t-hn-a', 'l3', 'Local SPS eight days', v_now - interval '8 days');
  perform pg_temp.mention(v_i, 'HN', 'Cortés', 'San Pedro Sula', 'San Pedro Sula');
  -- A story of the Cortés outlet that names SPS: local only, never also in region.
  v_i := pg_temp.item('t-hn-cortes', 'r0', 'Regional and local', v_now - interval '2 hours');
  perform pg_temp.mention(v_i, 'HN', 'Cortés', 'San Pedro Sula', 'San Pedro Sula');
  -- Region: Cortés outlet within 3 days; not 4 days; not the Atlántida outlet (not their home region).
  perform pg_temp.item('t-hn-cortes', 'r1', 'Region two days', v_now - interval '2 days');
  perform pg_temp.item('t-hn-cortes', 'r2', 'Region four days', v_now - interval '4 days');
  perform pg_temp.item('t-hn-atlantida', 'r3', 'Other region today', v_now - interval '1 hour');
  -- National: within 48 hours; not 49; not dated in the future; not another country's.
  perform pg_temp.item('t-hn-c', 'n1', 'National 47 hours', v_now - interval '47 hours', true);
  perform pg_temp.item('t-hn-c', 'n2', 'National 49 hours', v_now - interval '49 hours');
  perform pg_temp.item('t-hn-c', 'n3', 'National from the future', v_now + interval '3 hours');
  perform pg_temp.item('t-mx-nat', 'n4', 'Mexico national', v_now - interval '1 hour');

  p := app.news_page(v_h, v_now);
  assert p->>'language' = 'es' and p->>'country' = 'HN', p::text;
  assert p->'municipality'->>'name' = 'San Pedro Sula' and p->'municipality'->>'admin_region' = 'Cortés', p->>'municipality';
  assert pg_temp.titles(p, 'local') = array['Regional and local', 'Local La Ceiba yesterday', 'Local SPS six days'], pg_temp.titles(p, 'local')::text;
  assert pg_temp.titles(p, 'region') = array['Region two days'], pg_temp.titles(p, 'region')::text;
  assert pg_temp.titles(p, 'national') = array['National 47 hours'], pg_temp.titles(p, 'national')::text;
  assert p->'local'->1->'mentions' = '["La Ceiba"]'::jsonb, p->'local'->1::text;
  assert (p->'local'->1->>'image')::boolean and (p->'local'->1->>'thumb_w')::int = 160 and (p->'local'->1->>'lead_h')::int = 270;
  assert not (p->'local'->0->>'image')::boolean and p->'local'->0->'thumb_w' = 'null'::jsonb;
  assert p->'local'->0->>'url' = 'https://t-hn-cortes.example/r0' and p->'local'->0->>'source' = 'Outlet t-hn-cortes'
     and p->'local'->0->>'source_url' = 'https://t-hn-cortes.example/' and p->'local'->0->>'summary' = 'Resumen: Regional and local';
  assert p->'region'->0->'mentions' = '[]'::jsonb;
  -- Sources: their country's national outlets and their region's, never another region's or country's.
  assert p->'sources' @> '[{"name": "Outlet t-hn-a"}, {"name": "Outlet t-hn-cortes"}]'::jsonb
     and not p->'sources' @> '[{"name": "Outlet t-hn-atlantida"}]'::jsonb
     and not p->'sources' @> '[{"name": "Outlet t-mx-nat"}]'::jsonb, p->>'sources';
  -- Never "no news": no run has succeeded, the stories are still there, marked stale.
  assert (p->>'stale')::boolean and p->'updated_at' = 'null'::jsonb;
  -- A deactivated outlet's stories are not shown.
  update news_sources set active = false where key = 't-hn-c';
  assert pg_temp.titles(app.news_page(v_h, v_now), 'national') = '{}';
  update news_sources set active = true where key = 't-hn-c';
  assert app.news_page('00000000-0000-4000-8000-000000000000', v_now) is null, 'unknown client';
  raise notice 'PASS news_page: local 7 days (home and watched), region 3 days, national 48 hours, one section per story';
end $$;

-- ---------------------------------------------------------------------------
-- Outlet mixing: one busy outlet does not fill the list; a shared wire headline counts once.
do $$
declare
  v_m   uuid := '99990000-0000-4000-8000-0000000003a2';
  v_now timestamptz := '2026-09-17 16:00+00';
  p     jsonb;
  v_t   text[];
begin
  insert into news_sources (key, name, country, homepage_url, feed_url, language, verified_at)
  values ('t-mx-quiet', 'Outlet t-mx-quiet', 'MX', 'https://t-mx-quiet.example/', 'https://t-mx-quiet.example/feed', 'es', '2026-09-14');
  for i in 1..10 loop
    perform pg_temp.item('t-mx-nat', 'busy' || i, 'Busy ' || i, v_now - make_interval(mins => 10 * i));
  end loop;
  perform pg_temp.item('t-mx-quiet', 'q1', 'Quiet 1', v_now - interval '20 hours');
  perform pg_temp.item('t-mx-quiet', 'q2', 'Quiet 2', v_now - interval '30 hours');
  perform pg_temp.item('t-mx-quiet', 'q3', 'Busy 1', v_now - interval '5 minutes');   -- the same wire story

  -- By newest alone the four would all be Busy. Round-robin: each outlet's newest ("Busy 1", kept
  -- once, from the quiet outlet whose copy is newer; "Busy 2"), then each one's second ("Quiet 1", "Busy 3").
  p := app.news_page(v_m, v_now, 4);
  v_t := pg_temp.titles(p, 'national');
  assert v_t = array['Busy 1', 'Busy 2', 'Busy 3', 'Quiet 1'], v_t::text;
  assert p->'national'->0->>'source' = 'Outlet t-mx-quiet', p->'national'->0::text;
  assert (select count(*) from jsonb_array_elements(p->'national') e where e->>'source' = 'Outlet t-mx-quiet') = 2;
  -- All of them: 10 busy + "Mexico national" + 3 quiet, with "Busy 1" once.
  assert jsonb_array_length(app.news_page(v_m, v_now, 30)->'national') = 13, app.news_page(v_m, v_now, 30)->>'national';
  raise notice 'PASS news mixing: round-robin across outlets, newest first, a repeated headline once';
end $$;

-- ---------------------------------------------------------------------------
-- Local stories come from stored mentions only: an ambiguous name in a headline is not a mention.
do $$
declare
  v_m   uuid := '99990000-0000-4000-8000-0000000003a2';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_i   bigint;
  p     jsonb;
begin
  -- "Zamora" the surname: ingest stored no mention (mentions.mjs), so it is not local.
  perform pg_temp.item('t-mx-nat', 'z1', 'El diputado Zamora presenta iniciativa', v_now - interval '3 hours');
  -- "Zamora" with Michoacán named: ingest stored it with the rule that allowed it.
  v_i := pg_temp.item('t-mx-nat', 'z2', 'Lluvias en Zamora, Michoacán', v_now - interval '4 hours', true);
  perform pg_temp.mention(v_i, 'MX', 'Michoacán', 'Zamora', 'Zamora', 'name+region');
  -- A Michoacán outlet's story with a stored mention, and one without: local, then region.
  v_i := pg_temp.item('t-mx-mich', 'z3', 'Feria en Zamora', v_now - interval '5 hours');
  perform pg_temp.mention(v_i, 'MX', 'Michoacán', 'Zamora', 'Zamora', 'name+regional_source');
  perform pg_temp.item('t-mx-mich', 'z4', 'Morelia sin agua', v_now - interval '6 hours');

  p := app.news_page(v_m, v_now);
  assert pg_temp.titles(p, 'local') = array['Lluvias en Zamora, Michoacán', 'Feria en Zamora'], pg_temp.titles(p, 'local')::text;
  assert pg_temp.titles(p, 'region') = array['Morelia sin agua'], pg_temp.titles(p, 'region')::text;
  assert 'El diputado Zamora presenta iniciativa' = any(pg_temp.titles(p, 'national'));
  assert p->'local'->0->'mentions' = '["Zamora"]'::jsonb;
  assert (select rule from news_mentions where item_id = v_i) = 'name+regional_source';
  raise notice 'PASS news local: stored mentions only, with the rule and the text that matched';
end $$;

-- ---------------------------------------------------------------------------
-- Stale: a run that finished ok or partial within 3 hours is current; an error run is not.
do $$
declare
  v_h   uuid := '99990000-0000-4000-8000-0000000003a1';
  v_now timestamptz := '2026-09-17 16:00+00';
  p     jsonb;
begin
  insert into source_runs (feed, started_at, finished_at, status, records_written)
  values ('news', v_now - interval '4 hours 2 minutes', v_now - interval '4 hours', 'ok', 12);
  p := app.news_page(v_h, v_now);
  assert (p->>'stale')::boolean and (p->>'updated_at')::timestamptz = v_now - interval '4 hours', p::text;
  assert jsonb_array_length(p->'local') = 3, 'stale still returns the stories';

  insert into source_runs (feed, started_at, finished_at, status, error)
  values ('news', v_now - interval '32 minutes', v_now - interval '30 minutes', 'error', 'no news source answered');
  assert (app.news_page(v_h, v_now)->>'stale')::boolean, 'an error run does not make news current';

  insert into source_runs (feed, started_at, finished_at, status, records_written, notes)
  values ('news', v_now - interval '2 hours 2 minutes', v_now - interval '2 hours', 'partial', 5, '{"warnings": ["t-hn-b: HTTP 403"]}');
  p := app.news_page(v_h, v_now);
  assert not (p->>'stale')::boolean and (p->>'updated_at')::timestamptz = v_now - interval '2 hours', p::text;
  -- A run after the pinned clock does not count.
  insert into source_runs (feed, started_at, finished_at, status) values ('news', v_now + interval '1 hour', v_now + interval '1 hour', 'ok');
  assert (app.news_page(v_h, v_now)->>'updated_at')::timestamptz = v_now - interval '2 hours';
  raise notice 'PASS news stale: ok or partial within 3 hours is current; stale still lists the stories with updated_at';
end $$;

-- ---------------------------------------------------------------------------
-- Home: lead with a picture (their towns first, else national), two more, local first.
do $$
declare
  v_h   uuid := '99990000-0000-4000-8000-0000000003a1';
  v_m   uuid := '99990000-0000-4000-8000-0000000003a2';
  v_g   uuid := '99990000-0000-4000-8000-0000000003a3';
  v_now timestamptz := '2026-09-17 16:00+00';
  x     jsonb;
begin
  x := app.news_home(v_h, v_now);
  assert x->'lead'->>'title' = 'Local La Ceiba yesterday', x::text;          -- the local story with a picture
  assert (select array_agg(e->>'title' order by o) from jsonb_array_elements(x->'more') with ordinality a(e, o))
         = array['Regional and local', 'Local SPS six days'], x->>'more';
  assert not (x->>'stale')::boolean and x ? 'updated_at';

  -- No local story with a picture: the national one with a picture leads.
  update news_items set image_id = null where guid = 'l2';
  x := app.news_home(v_h, v_now);
  assert x->'lead'->>'title' = 'National 47 hours', x::text;
  assert jsonb_array_length(x->'more') = 2 and x->'more'->0->>'title' = 'Regional and local';

  x := app.news_home(v_m, v_now);
  assert x->'lead'->>'title' = 'Lluvias en Zamora, Michoacán', x::text;

  -- Guatemala: no stories at all is no news block, never an empty "no news" one.
  assert app.news_home(v_g, v_now) is null;
  assert app.news_page(v_g, v_now)->'municipality' = 'null'::jsonb and app.news_page(v_g, v_now)->'region' = '[]'::jsonb;

  -- home_more carries it.
  assert app.home_more(v_h, v_now)->'news'->'lead'->>'title' = 'National 47 hours';
  assert app.home_more(v_g, v_now)->'news' = 'null'::jsonb and app.home_more(v_g, v_now) ? 'workday';
  raise notice 'PASS news_home: a lead with a picture, local first, two more; null without stories; in home_more';
end $$;

-- ---------------------------------------------------------------------------
-- Picture accessor and pruning.
do $$
declare
  v_now    timestamptz := '2026-09-17 16:00+00';
  v_shared bigint := pg_temp.pic();
  v_old    bigint;
  v_orphan bigint := pg_temp.pic();
  v_keep   bigint;
  r        record;
  x        jsonb;
begin
  select * into r from app.news_image((select id from news_items where guid = 'n1'), 'thumb');
  assert r.content_type = 'image/jpeg' and r.width = 160 and r.height = 90 and octet_length(r.bytes) = 4 and r.sha256 like '%-thumb';
  assert not exists (select 1 from app.news_image((select id from news_items where guid = 'n1'), 'full'));

  v_old := pg_temp.item('t-hn-a', 'old1', 'Thirty-one days', v_now - interval '31 days', true);
  insert into news_items (source_id, guid, url, url_key, title, published_at, image_id)
  select id, 'old2', 'https://t-hn-a.example/old2', 't-hn-a.example/old2', 'Old, shared picture', v_now - interval '31 days', v_shared from news_sources where key = 't-hn-a';
  insert into news_items (source_id, guid, url, url_key, title, published_at, image_id)
  select id, 'new2', 'https://t-hn-a.example/new2', 't-hn-a.example/new2', 'New, shared picture', v_now - interval '1 day', v_shared from news_sources where key = 't-hn-a'
  returning id into v_keep;
  perform pg_temp.mention(v_old, 'HN', 'Cortés', 'San Pedro Sula', 'San Pedro Sula');

  x := app.prune_news(v_now);
  assert (x->>'items')::int = 2, x::text;
  assert not exists (select 1 from news_items where guid in ('old1', 'old2'));
  assert not exists (select 1 from news_mentions where item_id = v_old), 'mentions go with their story';
  assert exists (select 1 from news_images where id = v_shared), 'a picture a newer story uses stays';
  assert not exists (select 1 from news_images where id = v_orphan), 'an unused picture goes';
  assert exists (select 1 from news_items where id = v_keep) and exists (select 1 from news_items where guid = 'l3');
  raise notice 'PASS news pruning: stories older than 30 days, their mentions and unused pictures';
end $$;

-- ---------------------------------------------------------------------------
-- No graphic pictures: a suppressed story is shown without its picture; an outlet's pictures can be switched off.
do $$
declare
  v_h   uuid := '99990000-0000-4000-8000-0000000003a1';
  v_now timestamptz := '2026-09-17 16:00+00';
  v_n1  bigint := (select id from news_items where guid = 'n1');
  v_i   bigint;
  p     jsonb;
  x     jsonb;
  e     jsonb;
begin
  begin
    update news_items set image_suppressed = 'asesinato' where id = v_n1;
    assert false, 'a suppressed story cannot keep a picture';
  exception when check_violation then null;
  end;

  -- The owner switches off one outlet's pictures: its stories stay, without pictures, everywhere.
  update news_sources set show_images = false where key = 't-hn-c';
  p := app.news_page(v_h, v_now);
  select a.e into e from jsonb_array_elements(p->'national') a(e) where a.e->>'title' = 'National 47 hours';
  assert e is not null and not (e->>'image')::boolean and e->'thumb_w' = 'null'::jsonb and e->'lead_h' = 'null'::jsonb, e::text;
  assert not exists (select 1 from app.news_image(v_n1, 'thumb')) and not exists (select 1 from app.news_image(v_n1, 'lead'));
  x := app.news_home(v_h, v_now);
  assert x->'lead' = 'null'::jsonb or x->'lead'->>'source' <> 'Outlet t-hn-c', x::text;
  update news_sources set show_images = true where key = 't-hn-c';
  select a.e into e from jsonb_array_elements(app.news_page(v_h, v_now)->'national') a(e) where a.e->>'title' = 'National 47 hours';
  assert (e->>'image')::boolean and exists (select 1 from app.news_image(v_n1, 'thumb')), 'back on';

  -- A story ingest marked graphic: in its section, never with a picture, and never on the home card (0048).
  v_i := pg_temp.item('t-hn-a', 'g1', 'Asesinan a comerciante en San Pedro Sula', v_now - interval '10 minutes');
  update news_items set image_suppressed = 'asesinan' where id = v_i;
  perform pg_temp.mention(v_i, 'HN', 'Cortés', 'San Pedro Sula', 'San Pedro Sula');
  p := app.news_page(v_h, v_now);
  assert p->'local'->0->>'title' = 'Asesinan a comerciante en San Pedro Sula' and not (p->'local'->0->>'image')::boolean, p->>'local';
  x := app.news_home(v_h, v_now);
  assert x->'lead'->>'id' is distinct from v_i::text, x::text;
  assert not exists (select 1 from jsonb_array_elements(x->'more') m where m->>'id' = v_i::text),
    format('the newest local story is graphic, so home skips it: %s', x->'more');
  assert jsonb_array_length(x->'more') = 2, format('two other headlines instead: %s', x->'more');
  raise notice 'PASS news pictures: suppressed stories and outlets with pictures off keep their text, never a picture';
end $$;

rollback;
