-- Weather warnings for the family's towns (0052).
--
-- Polygon matching over home AND watched towns (a town just outside is not
-- matched), one push per identifier naming every town it covers, the lifecycle
-- carried to the people who received the original, yellow never pushing, and
-- nothing at all for a country whose warnings are not launched.
\set ON_ERROR_STOP on
begin;

insert into affiliates (id, name) values ('35353535-0000-4000-8000-000000000035', 'Family Warnings Test');

-- A square around two Jamaican test towns: longitude -77.60..-77.40, latitude 18.20..18.40.
insert into municipalities (country, admin_region, name, lat, lng, timezone) values
  ('JM', 'T35 Parish', 'T35 Home',    18.30, -77.50,   'America/Jamaica'),
  ('JM', 'T35 Parish', 'T35 Watch',   18.32, -77.45,   'America/Jamaica'),
  ('JM', 'T35 Parish', 'T35 Outside', 18.30, -77.3985, 'America/Jamaica'),   -- about 160 m east of the edge
  ('JM', 'T35 Parish', 'T35 Far',     18.00, -76.80,   'America/Jamaica'),
  ('MX', 'T35 Estado', 'T35 Pueblo',  19.00, -99.00,   'America/Mexico_City');

create function pg_temp.town(p text) returns bigint language sql as $$ select id from municipalities where name = p $$;

insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, timezone) values
  ('35000000-0000-4000-8000-00000000000a', '35353535-0000-4000-8000-000000000035', 'FMTJ2342', 'A (home and watched inside)', 'JM', 'en', pg_temp.town('T35 Home'), 'T35 Home', 'America/Toronto'),
  ('35000000-0000-4000-8000-00000000000b', '35353535-0000-4000-8000-000000000035', 'FMTJ2343', 'B (only a watched town inside)', 'JM', 'es', pg_temp.town('T35 Far'), 'T35 Far', 'America/Toronto'),
  ('35000000-0000-4000-8000-00000000000c', '35353535-0000-4000-8000-000000000035', 'FMTJ2344', 'C (a watched town just outside)', 'JM', 'es', pg_temp.town('T35 Far'), 'T35 Far', 'America/Toronto'),
  ('35000000-0000-4000-8000-00000000000d', '35353535-0000-4000-8000-000000000035', 'FMTJ2346', 'D (Mexico, not launched)', 'MX', 'es', pg_temp.town('T35 Pueblo'), 'T35 Pueblo', 'America/Toronto'),
  ('35000000-0000-4000-8000-00000000000e', '35353535-0000-4000-8000-000000000035', 'FMTJ2362', 'E (original never sent)', 'JM', 'es', pg_temp.town('T35 Watch'), 'T35 Watch', 'America/Toronto');

insert into client_watch_locations (client_id, municipality_id) values
  ('35000000-0000-4000-8000-00000000000a', pg_temp.town('T35 Watch')),
  ('35000000-0000-4000-8000-00000000000a', pg_temp.town('T35 Outside')),
  ('35000000-0000-4000-8000-00000000000b', pg_temp.town('T35 Watch')),
  ('35000000-0000-4000-8000-00000000000c', pg_temp.town('T35 Outside'));

-- A message from a seeded source (JM active, MX not). Polygon is WKT (lon lat).
create function pg_temp.msg(p_country text, p_ident text, p_type text, p_level text, p_event text,
                            p_wkt text, p_refs text[] default '{}', p_expires timestamptz default now() + interval '6 hours')
returns bigint language sql as $$
  insert into weather_alerts (source_id, country, cap_identifier, cap_sent, msg_type, event, level, issued_at, expires_at,
                              area_geog, source_url, cap_reference_ids)
  select s.id, p_country::country_code, p_ident, now(), p_type, p_event, p_level::alert_level, now(), p_expires,
         case when p_wkt is null then null
              else extensions.ST_Multi(extensions.ST_GeomFromText(p_wkt, 4326))::extensions.geography end,
         'https://example.invalid/t35', p_refs
    from alert_sources s where s.country = p_country::country_code and s.agency in ('Meteorological Service Jamaica', 'CONAGUA / SMN')
  returning id
$$;

create function pg_temp.square() returns text language sql as $$
  select 'POLYGON((-77.60 18.20, -77.40 18.20, -77.40 18.40, -77.60 18.40, -77.60 18.20))' $$;
create function pg_temp.elsewhere() returns text language sql as $$
  select 'POLYGON((-76.40 17.90, -76.20 17.90, -76.20 18.10, -76.40 18.10, -76.40 17.90))' $$;

do $$
begin
  assert (select active from alert_sources where agency = 'Meteorological Service Jamaica'), 'seeded Jamaica source is launched';
  assert not (select active from alert_sources where agency = 'CONAGUA / SMN'), 'seeded Mexico source is not launched';
end $$;

-- ---------------------------------------------------------------------------
-- Matching: home and watched towns by polygon; just outside is not matched.
-- ---------------------------------------------------------------------------
do $$
declare
  a bigint := pg_temp.msg('JM', 'T35-ORANGE-1', 'Alert', 'orange', 'Thunderstorm Watch', pg_temp.square());
  r record; n int;
begin
  perform app.queue_alert_pushes(a);

  select count(*) into n from notifications where weather_alert_id = a and client_id::text like '35000000-%';
  assert n = 3, format('A (home + watched), B (watched) and E (home) only, got %s', n);
  assert not exists (select 1 from notifications where weather_alert_id = a and client_id = '35000000-0000-4000-8000-00000000000c'),
    'a watched town 160 m outside the polygon is not matched';
  raise notice 'PASS family towns: home and watched towns match by polygon; a town just outside does not';

  -- One push per identifier across several towns, naming them, home first.
  select * into r from notifications where weather_alert_id = a and client_id = '35000000-0000-4000-8000-00000000000a';
  assert r.alert_towns = array['T35 Home', 'T35 Watch'], format('towns %s', r.alert_towns);
  assert r.title = 'Orange · Meteorological Service Jamaica', format('title %s', r.title);
  assert r.body = 'Thunderstorm Watch — T35 Home, T35 Watch', format('body %s', r.body);
  assert r.alert_reason = 'area' and r.channel = 'alert';
  select * into r from notifications where weather_alert_id = a and client_id = '35000000-0000-4000-8000-00000000000b';
  assert r.title = 'Naranja · Meteorological Service Jamaica' and r.body = 'Thunderstorm Watch — T35 Watch', format('%s / %s', r.title, r.body);
  raise notice 'PASS one push per client per identifier across several towns, towns listed: "%" / "%"', r.title, r.body;

  -- The same identifier again sends nothing more.
  perform app.queue_alert_pushes(a);
  select count(*) into n from notifications where cap_identifier = 'T35-ORANGE-1' and client_id::text like '35000000-%';
  assert n = 3, format('a resend adds nothing, got %s', n);

  -- The delivery log carries the towns.
  assert (select towns from alert_delivery_log where weather_alert_id = a and client_id = '35000000-0000-4000-8000-00000000000a')
         = array['T35 Home', 'T35 Watch'], 'delivery log lists the towns covered';
  raise notice 'PASS same-identifier resend adds nothing; the delivery log records the towns';
end $$;

-- ---------------------------------------------------------------------------
-- Yellow never pushes; no push for a country that is not launched; no push for
-- an expired or already-superseded message.
-- ---------------------------------------------------------------------------
do $$
declare
  y bigint := pg_temp.msg('JM', 'T35-YELLOW-1', 'Alert', 'yellow', 'Thunderstorm Advisory', pg_temp.square());
  m bigint := pg_temp.msg('MX', 'T35-MX-RED-1', 'Alert', 'red', 'Aviso de lluvias',
                          'POLYGON((-99.2 18.8, -98.8 18.8, -98.8 19.2, -99.2 19.2, -99.2 18.8))');
  x bigint := pg_temp.msg('JM', 'T35-EXPIRED-1', 'Alert', 'red', 'Hurricane Warning', pg_temp.square(), '{}', now() - interval '1 hour');
  s bigint := pg_temp.msg('JM', 'T35-SUPERSEDED-1', 'Alert', 'red', 'Hurricane Warning', pg_temp.square());
  n int;
begin
  assert (select count(*) from app.queue_alert_pushes(y)) = 0, 'yellow queues for nobody';
  assert not exists (select 1 from notifications where weather_alert_id = y), 'yellow never pushes';
  raise notice 'PASS yellow never pushes, even over home and watched towns';

  assert exists (select 1 from app.alert_client_towns(m, '35000000-0000-4000-8000-00000000000d')), 'the Mexican town is inside the polygon';
  assert (select count(*) from app.queue_alert_pushes(m)) = 0 and not app.should_push(m), 'Mexico is not launched';
  assert not exists (select 1 from notifications where weather_alert_id = m), 'no push for an inactive country';
  raise notice 'PASS no push for a country whose warnings are not launched (MX red over a client town)';

  update weather_alerts set superseded_by_id = y where id = s;
  assert (select count(*) from app.queue_alert_pushes(x)) = 0, 'an expired alert pushes to nobody';
  assert (select count(*) from app.queue_alert_pushes(s)) = 0, 'an already-superseded alert pushes to nobody';
  select count(*) into n from notifications where weather_alert_id in (x, s) and client_id::text like '35000000-%';
  assert n = 0, format('backfilled or late messages never push, got %s', n);
  raise notice 'PASS expired and already-superseded messages push to nobody';
end $$;

-- ---------------------------------------------------------------------------
-- Lifecycle: Update and Cancel reach the original recipients.
-- ---------------------------------------------------------------------------
do $$
declare
  o bigint; u bigint; c bigint; d bigint; r record; n int;
begin
  o := (select id from weather_alerts where cap_identifier = 'T35-ORANGE-1');
  -- A, B and E's phones received the original.
  update notifications set status = 'sent', attempts = 1, sent_at = now() where weather_alert_id = o;

  -- The Update moves the area away from every client town, still orange.
  u := pg_temp.msg('JM', 'T35-ORANGE-1-UPD', 'Update', 'orange', 'Thunderstorm Watch', pg_temp.elsewhere(), array['T35-ORANGE-1']);
  perform app.apply_cap_lifecycle(u, array['T35-ORANGE-1']);
  perform app.queue_alert_pushes(u);
  select count(*) into n from notifications where weather_alert_id = u and client_id::text like '35000000-%';
  assert n = 3, format('the Update reaches all three original recipients, got %s', n);
  select * into r from notifications where weather_alert_id = u and client_id = '35000000-0000-4000-8000-00000000000a';
  assert r.alert_reason = 'lifecycle' and r.title = 'Updated: Orange · Meteorological Service Jamaica'
         and r.body = 'Thunderstorm Watch — T35 Home, T35 Watch', format('%s / %s / %s', r.alert_reason, r.title, r.body);
  assert not exists (select 1 from notifications where weather_alert_id = u and client_id = '35000000-0000-4000-8000-00000000000c'),
    'the Update does not reach someone who never got the original';
  raise notice 'PASS Update reaches the original recipients, with their towns: "%" / "%"', r.title, r.body;

  -- A later yellow Update (a downgrade) still reaches them: they were told orange.
  update notifications set status = 'sent', attempts = 1 where weather_alert_id = u;
  d := pg_temp.msg('JM', 'T35-ORANGE-1-DOWN', 'Update', 'yellow', 'Thunderstorm Advisory', pg_temp.square(), array['T35-ORANGE-1-UPD']);
  perform app.apply_cap_lifecycle(d, array['T35-ORANGE-1-UPD']);
  perform app.queue_alert_pushes(d);
  select count(*) into n from notifications where weather_alert_id = d and client_id::text like '35000000-%';
  assert n = 3 and not exists (select 1 from notifications where weather_alert_id = d and alert_reason <> 'lifecycle'),
    format('a yellow Update goes only to those told orange, got %s', n);
  assert (select title from notifications where weather_alert_id = d and client_id = '35000000-0000-4000-8000-00000000000b')
         = 'Actualizado: Amarillo · Meteorological Service Jamaica';
  raise notice 'PASS a yellow Update reaches only people who received the orange it changes';

  -- The Cancel has no area of its own.
  update notifications set status = 'sent', attempts = 1 where weather_alert_id = d;
  c := pg_temp.msg('JM', 'T35-ORANGE-1-CXL', 'Cancel', 'orange', 'Thunderstorm Watch', null, array['T35-ORANGE-1-DOWN']);
  perform app.apply_cap_lifecycle(c, array['T35-ORANGE-1-DOWN']);
  perform app.queue_alert_pushes(c);
  select count(*) into n from notifications where weather_alert_id = c and client_id::text like '35000000-%';
  assert n = 3, format('the Cancel reaches all three recipients, got %s', n);
  select * into r from notifications where weather_alert_id = c and client_id = '35000000-0000-4000-8000-00000000000b';
  assert r.title = 'Cancelado: Naranja · Meteorological Service Jamaica' and r.body = 'Thunderstorm Watch — T35 Watch',
    format('%s / %s', r.title, r.body);
  assert (select cancelled_at is not null from weather_alerts where id = d), 'the cancelled message is inactive';
  raise notice 'PASS Cancel reaches the original recipients: "%" / "%"', r.title, r.body;
end $$;

-- ---------------------------------------------------------------------------
-- An original still waiting to send is overtaken, and a Cancel never goes to
-- someone who did not get the original.
-- ---------------------------------------------------------------------------
do $$
declare
  o bigint := pg_temp.msg('JM', 'T35-RED-2', 'Alert', 'red', 'Flash Flood Warning', pg_temp.square());
  c bigint; r record; n int;
begin
  perform app.queue_alert_pushes(o);
  assert exists (select 1 from notifications where weather_alert_id = o and client_id = '35000000-0000-4000-8000-00000000000e'),
    'E (home T35 Watch) is queued';
  update notifications set status = 'sent', attempts = 1 where weather_alert_id = o and client_id <> '35000000-0000-4000-8000-00000000000e';

  c := pg_temp.msg('JM', 'T35-RED-2-CXL', 'Cancel', 'red', 'Flash Flood Warning', null, array['T35-RED-2']);
  perform app.queue_alert_pushes(c);
  select * into r from notifications where weather_alert_id = o and client_id = '35000000-0000-4000-8000-00000000000e';
  assert r.status = 'suppressed' and r.error = 'cancelled by T35-RED-2-CXL before it was sent', format('%s %s', r.status, r.error);
  assert not exists (select 1 from notifications where weather_alert_id = c and client_id = '35000000-0000-4000-8000-00000000000e'),
    'no cancellation for a warning that never reached the phone';
  select count(*) into n from notifications where weather_alert_id = c and client_id::text like '35000000-%';
  assert n = 2, format('A and B, who got it, are told, got %s', n);
  raise notice 'PASS an unsent original is not sent after its Cancel, and the Cancel goes only to those who got it';
end $$;

-- ---------------------------------------------------------------------------
-- Hoy: the family section's data never answers "are there warnings".
-- ---------------------------------------------------------------------------
do $$
declare
  f jsonb := app.family_warnings('35000000-0000-4000-8000-00000000000a');
  g jsonb := app.family_warnings('35000000-0000-4000-8000-00000000000d');
begin
  assert f->>'state' in ('current', 'stale') and f->>'agency' = 'Meteorological Service Jamaica', f::text;
  assert (select array_agg(t->>'name' order by ord) from jsonb_array_elements(f->'towns') with ordinality x(t, ord))
         = array['T35 Home', 'T35 Outside', 'T35 Watch'], f->>'towns';
  assert (f->'towns'->0->>'is_home')::boolean and (f->>'watching')::int = 2 and (f->>'subscriptions')::int = 0, f::text;
  assert f->'push_levels' = '["red", "orange"]'::jsonb, f->>'push_levels';
  assert not (f ? 'alerts') and not (f ? 'count'), 'the family section carries no alert count';
  assert g->>'state' = 'not_monitored' and g->>'agency' = 'CONAGUA / SMN' and g->'push_levels' = 'null'::jsonb, g::text;
  assert app.client_alert('35000000-0000-4000-8000-00000000000d', (select id from weather_alerts where cap_identifier = 'T35-MX-RED-1')) is null,
    'an alert from a source that is not launched never opens as focused';
  assert app.client_alert('35000000-0000-4000-8000-00000000000a', (select id from weather_alerts where cap_identifier = 'T35-ORANGE-1'))->>'state' = 'superseded';
  raise notice 'PASS family section data: towns home first, push reach, never a count; not launched says so';
end $$;

rollback;
