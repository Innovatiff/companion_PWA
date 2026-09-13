-- First-run setup: accent-insensitive partial municipality search scoped to a
-- region, each step saved, skip and resume, and the once-a-day home prompt.
\set ON_ERROR_STOP on

insert into affiliates (id, name) values ('99990000-0000-4000-8000-000000000011', 'Setup Test') on conflict do nothing;
insert into municipalities (country, admin_region, name, lat, lng, population, timezone) values
  ('MX', 'Estado de Prueba', 'Pátzcuaro de Prueba', 19.51, -101.60, 90000, 'America/Mexico_City'),
  ('MX', 'Estado de Prueba', 'San Andrés Prueba',   19.40, -101.50, 1200,  'America/Mexico_City'),
  ('MX', 'Estado de Prueba', 'Ciudad 100% Prueba',  19.30, -101.40, 500,   'America/Mexico_City'),
  ('MX', 'Otro Estado',      'Pátzcuaro Otro',      20.00, -102.00, 10,    'America/Mexico_City'),
  ('GT', 'Departamento Prueba', 'Pátzcuaro de Guatemala', 14.60, -90.50, 10, 'America/Guatemala')
on conflict do nothing;

insert into clients (id, affiliate_id, code, full_name, country)
values ('99990000-0000-4000-8000-0000000000c1', '99990000-0000-4000-8000-000000000011', 'MXZETVP2', 'Cliente Setup', 'MX')
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Search
-- --------------------------------------------------------------------------
do $$
declare names text[];
begin
  -- The seeded catalog has a real Pátzcuaro (Michoacán) too, so check containment.
  select array_agg(name order by name) into names from app.search_municipalities('MX', null, 'patzcuaro');
  assert names @> array['Pátzcuaro de Prueba', 'Pátzcuaro Otro'], format('accent-insensitive: %s', names);

  select array_agg(name) into names from app.search_municipalities('MX', 'Estado de Prueba', 'CUARO');
  assert names = array['Pátzcuaro de Prueba'], format('partial, case-insensitive, scoped to the region: %s', names);

  select array_agg(name) into names from app.search_municipalities('MX', 'Estado de Prueba', 'andres');
  assert names = array['San Andrés Prueba'], format('%s', names);

  assert not exists (select 1 from app.search_municipalities('MX', null, 'Guatemala')), 'another country''s places are not offered';
  assert not exists (select 1 from app.search_municipalities('MX', null, 'p')), 'one character is too short to search';

  select array_agg(name) into names from app.search_municipalities('MX', null, '100%');
  assert names = array['Ciudad 100% Prueba'], format('a %% in the query is literal: %s', names);

  select array_agg(admin_region) into names from app.admin_regions('MX') where admin_region in ('Estado de Prueba', 'Otro Estado');
  assert names = array['Estado de Prueba', 'Otro Estado'], format('%s', names);
  raise notice 'PASS setup: municipality search is accent-insensitive, partial and scoped';
end $$;

-- --------------------------------------------------------------------------
-- Steps: skip, resume, save, validate
-- --------------------------------------------------------------------------
do $$
declare v_client uuid := '99990000-0000-4000-8000-0000000000c1';
        v_home bigint := (select id from municipalities where name = 'Pátzcuaro de Prueba');
        v_other bigint := (select id from municipalities where name = 'San Andrés Prueba');
        v_gt bigint := (select id from municipalities where name = 'Pátzcuaro de Guatemala');
        ok boolean; c clients%rowtype;
begin
  assert app.setup_next_step(v_client) = 'municipality';
  perform app.setup_mark(v_client, 'municipality', 'skipped');
  assert app.setup_next_step(v_client) = 'watch', 'a skipped step moves on';

  begin
    perform app.setup_set_municipality(v_client, v_gt);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a municipality from another country is refused';

  perform app.setup_set_municipality(v_client, v_home);
  select * into c from clients where id = v_client;
  assert c.municipality = 'Pátzcuaro de Prueba' and c.admin_region = 'Estado de Prueba'
     and c.municipality_lat = 19.51 and c.municipality_lng = -101.60 and c.setup_state->>'municipality' = 'done',
    format('name and coordinates are stored: %s', row_to_json(c));

  begin
    perform app.setup_set_watch(v_client, (select array_agg(id) from municipalities where country = 'MX'));
    ok := (select count(*) from municipalities where country = 'MX' and id <> v_home) <= 3;
  exception when check_violation then ok := true;
  end;
  assert ok, 'more than 3 additional towns is refused';

  perform app.setup_set_watch(v_client, array[v_home, v_other]);
  assert (select array_agg(municipality_id) from client_watch_locations where client_id = v_client) = array[v_other],
    'their own town is not counted as an additional one';

  begin
    perform app.setup_set_segment(v_client, 'seasonal', current_date - 5);
    ok := false;
  exception when check_violation then ok := true;
  end;
  assert ok, 'a departure date in the past is refused';
  perform app.setup_set_segment(v_client, 'seasonal', current_date + 60);
  assert (select departure_date from clients where id = v_client) = current_date + 60;
  perform app.setup_set_segment(v_client, 'settled', current_date + 90);
  select * into c from clients where id = v_client;
  assert c.departure_date is null and c.next_trip_date = current_date + 90, 'settled uses their own next-trip date';

  perform app.setup_set_kids(v_client, true);
  assert app.setup_next_step(v_client) = 'corridor';
  assert (select setup_completed_at from clients where id = v_client) is null;
  perform app.setup_confirm_corridor(v_client);
  assert app.setup_next_step(v_client) is null and (select setup_completed_at is not null from clients where id = v_client);
  raise notice 'PASS setup: steps save, skip, resume, validate and complete';
end $$;

-- --------------------------------------------------------------------------
-- The home prompt appears at most once a day, only without a municipality
-- --------------------------------------------------------------------------
do $$
declare v_client uuid := '99990000-0000-4000-8000-0000000000c1'; m jsonb;
begin
  update clients set municipality_id = null, municipality = null, municipality_prompted_on = null where id = v_client;
  m := app.render_home(v_client);
  assert m->>'prompt' = 'municipality', format('first open of the day prompts: %s', m->>'prompt');
  assert (select prompt from home_renders where render_id = (m->>'render_id')::uuid) = 'municipality', 'the prompt is recorded';
  m := app.render_home(v_client);
  assert m->>'prompt' is null, 'the second open that day does not prompt again';

  update clients set municipality_prompted_on = municipality_prompted_on - 1 where id = v_client;
  assert app.render_home(v_client)->>'prompt' = 'municipality', 'the next day it prompts again';

  perform app.setup_set_municipality(v_client, (select id from municipalities where name = 'Pátzcuaro de Prueba'));
  update clients set municipality_prompted_on = null where id = v_client;
  assert app.render_home(v_client)->>'prompt' is null, 'never once a municipality is set';
  raise notice 'PASS setup: the municipality prompt shows at most once a day, never once set';
end $$;
