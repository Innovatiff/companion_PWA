-- 0020_client_setup.sql
-- First-run setup in Hoy, done by the client, one question per screen:
--   1. municipality (required for the weather line)   3. seasonal or settled + date
--   2. up to 3 more towns to watch                    4. kids   5. currency corridor
-- Every step can be skipped and resumed. Progress lives here, so a closed
-- browser picks up where it stopped.

alter table clients
  add column setup_state             jsonb not null default '{}'::jsonb,   -- step -> 'done' | 'skipped'
  add column municipality_prompted_on date,                                -- the once-a-day home prompt
  add column corridor_confirmed_at   timestamptz;

-- Accent-insensitive, partial municipality search.
create index municipalities_search_idx
  on municipalities using gin (app.immutable_unaccent(lower(name)) extensions.gin_trgm_ops);
create index municipalities_country_region_idx on municipalities (country, admin_region);

create or replace function app.admin_regions(p_country country_code)
returns table (admin_region text, municipalities integer)
language sql
stable
set search_path = public, app
as $$
  select m.admin_region, count(*)::int
    from municipalities m
   where m.country = p_country
   group by m.admin_region
   order by m.admin_region
$$;

create or replace function app.search_municipalities(
  p_country      country_code,
  p_admin_region text,
  p_query        text,
  p_limit        integer default 12
) returns table (id bigint, name text, admin_region text, population integer)
language sql
stable
set search_path = public, app, extensions
as $$
  with q as (
    select replace(replace(replace(app.immutable_unaccent(lower(btrim(coalesce(p_query, '')))),
                   '\', '\\'), '%', '\%'), '_', '\_') as t
  )
  select m.id, m.name, m.admin_region, m.population
    from municipalities m, q
   where m.country = p_country
     and (p_admin_region is null or m.admin_region = p_admin_region)
     and char_length(q.t) >= 2
     and app.immutable_unaccent(lower(m.name)) like '%' || q.t || '%'
   order by (app.immutable_unaccent(lower(m.name)) like q.t || '%') desc,
            m.population desc nulls last,
            m.name
   limit least(greatest(coalesce(p_limit, 12), 1), 30)
$$;

create or replace function app.setup_steps() returns text[] language sql immutable as $$
  select array['municipality', 'watch', 'segment', 'kids', 'corridor']
$$;

-- The first step neither done nor skipped, or null when setup is finished.
create or replace function app.setup_next_step(p_client_id uuid)
returns text
language sql
stable
set search_path = public, app
as $$
  select s
    from clients c, unnest(app.setup_steps()) with ordinality as u(s, n)
   where c.id = p_client_id and c.setup_state->>u.s is null
   order by u.n
   limit 1
$$;

create or replace function app.setup_mark(p_client_id uuid, p_step text, p_state text)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  if p_step <> all (app.setup_steps()) or p_state not in ('done', 'skipped') then
    raise exception 'unknown setup step % / state %', p_step, p_state using errcode = 'check_violation';
  end if;
  update clients set setup_state = setup_state || jsonb_build_object(p_step, p_state),
                     setup_completed_at = case
                       when app.setup_next_step(id) is null then setup_completed_at
                       else setup_completed_at end
   where id = p_client_id;
  update clients set setup_completed_at = coalesce(setup_completed_at, now())
   where id = p_client_id and app.setup_next_step(id) is null;
end $$;

-- 1. Municipality: must be in the client's country. Stores name and coordinates.
create or replace function app.setup_set_municipality(p_client_id uuid, p_municipality_id bigint)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_m municipalities%rowtype;
begin
  select m.* into v_m
    from municipalities m join clients c on c.country = m.country
   where m.id = p_municipality_id and c.id = p_client_id;
  if not found then
    raise exception 'municipality % is not in this client''s country', p_municipality_id using errcode = 'check_violation';
  end if;
  update clients
     set municipality_id = v_m.id, municipality = v_m.name, admin_region = v_m.admin_region,
         municipality_lat = v_m.lat, municipality_lng = v_m.lng
   where id = p_client_id;
  delete from client_watch_locations where client_id = p_client_id and municipality_id = v_m.id;
  perform app.setup_mark(p_client_id, 'municipality', 'done');
end $$;

-- 2. Up to 3 more towns in the client's country, not counting their own.
create or replace function app.setup_set_watch(p_client_id uuid, p_municipality_ids bigint[])
returns void
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_ids bigint[];
begin
  select array_agg(distinct m.id) into v_ids
    from municipalities m join clients c on c.country = m.country and c.id = p_client_id
   where m.id = any(coalesce(p_municipality_ids, '{}'))
     and m.id is distinct from c.municipality_id;
  if coalesce(array_length(v_ids, 1), 0) > 3 then
    raise exception 'at most 3 additional towns' using errcode = 'check_violation';
  end if;
  delete from client_watch_locations where client_id = p_client_id;
  insert into client_watch_locations (client_id, municipality_id)
  select p_client_id, unnest(coalesce(v_ids, '{}'));
  perform app.setup_mark(p_client_id, 'watch', 'done');
end $$;

-- 3. Seasonal with a departure date, or settled with their own next-trip date.
create or replace function app.setup_set_segment(p_client_id uuid, p_segment client_segment, p_date date)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  if p_date is not null and p_date < (select (now() at time zone c.timezone)::date from clients c where c.id = p_client_id) then
    raise exception 'the date must be today or later' using errcode = 'check_violation';
  end if;
  update clients
     set segment = p_segment,
         departure_date = case when p_segment = 'seasonal' then p_date end,
         next_trip_date = case when p_segment = 'settled' then p_date end
   where id = p_client_id;
  perform app.setup_mark(p_client_id, 'segment', 'done');
end $$;

-- 4. Kids: enables the school calendar.
create or replace function app.setup_set_kids(p_client_id uuid, p_has_kids boolean)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  update clients set has_kids = p_has_kids where id = p_client_id;
  perform app.setup_mark(p_client_id, 'kids', 'done');
end $$;

-- 5. The client confirms the corridor shown to them (CAD to their home currency).
create or replace function app.setup_confirm_corridor(p_client_id uuid)
returns void
language plpgsql
volatile
set search_path = public, app
as $$
begin
  update clients set corridor_confirmed_at = now() where id = p_client_id;
  perform app.setup_mark(p_client_id, 'corridor', 'done');
end $$;

-- ---------------------------------------------------------------------------
-- Home: the once-a-day municipality prompt, recorded with the render.
-- ---------------------------------------------------------------------------

alter table home_renders add column prompt text;

create or replace function app.render_home(p_client_id uuid)
returns jsonb
language plpgsql
volatile
set search_path = public, app
as $$
declare
  v_msg     jsonb;
  v_render  uuid;
  v_at      timestamptz;
  v_prompt  text;
  v_today   date;
begin
  v_msg := app.home_message(p_client_id, now());
  if v_msg is null then
    return null;
  end if;

  -- No municipality: offer to choose one, at most once per local day. Never
  -- blocking, never modal.
  v_today := (v_msg->>'local_date')::date;
  update clients set municipality_prompted_on = v_today
   where id = p_client_id and municipality_id is null
     and municipality_prompted_on is distinct from v_today;
  if found then
    v_prompt := 'municipality';
  end if;

  insert into home_renders (client_id, local_date, served, absent, message, prompt)
  values (p_client_id, v_today,
          array(select l.value->>'key' from jsonb_array_elements(v_msg->'lines') with ordinality l order by l.ordinality),
          v_msg->'absent', v_msg, v_prompt)
  returning render_id, rendered_at into v_render, v_at;

  update clients set last_seen_at = now() where id = p_client_id;
  return v_msg || jsonb_build_object('render_id', v_render, 'rendered_at', v_at, 'prompt', v_prompt);
end $$;
