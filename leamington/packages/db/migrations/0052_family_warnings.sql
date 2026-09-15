-- 0052_family_warnings.sql
-- Weather warnings for the family's towns: one push per CAP identifier per
-- client, naming every one of their towns the warning covers, with the CAP
-- lifecycle carried to the people who received the original.
--
-- The rules this keeps (CLAUDE.md, weather ALERTS):
--   * Match by polygon: a town's point inside the alert area. Never by name.
--   * A client's towns are their home municipality AND every town they watch.
--   * A NEW push only for the source's push levels (Jamaica red+orange, Mexico
--     red). Yellow displays in the app with no notification.
--   * Only a country whose warnings are launched (alert_sources.active) sends
--     anything. Nothing here activates a country.
--   * The ALERT queue stays uncapped and immediate; every distinct identifier
--     sends once per client (0009's unique index), whatever towns it covers.
--   * Agency wording is passed through verbatim.
--
-- Lifecycle, per client:
--   Alert   pushes to the clients whose towns it covers, if its level pushes.
--   Update  pushes to the clients whose towns it covers (if its level pushes)
--           AND to everyone who received a message it updates, whatever its
--           level: a man told "orange" must be told when the agency changes it.
--   Cancel  pushes to everyone who received a message it cancels.
--   A message that has already expired, or been superseded or cancelled by a
--   message we already hold (feeds are not ordered), pushes to nobody: a
--   backfill must never send yesterday's warnings.
--   An original still waiting to be sent when its Update or Cancel arrives is
--   not sent (suppressed, with the reason), and a Cancel does not go to someone
--   who never got the original.

-- ---------------------------------------------------------------------------
-- The delivery log records which towns each alert push covered, and why the
-- client received it.
-- ---------------------------------------------------------------------------
alter table notifications
  add column alert_town_ids bigint[],
  add column alert_towns    text[],
  add column alert_reason   text check (alert_reason in ('area', 'lifecycle'));

comment on column notifications.alert_towns is
  'Alert pushes: the client''s towns (home first) the warning covered, as named when queued.';
comment on column notifications.alert_reason is
  'Alert pushes: area = one of their towns is inside the warning''s area; lifecycle = they received the message this one updates or cancels.';

-- ---------------------------------------------------------------------------
-- A client's towns (home first, then watched, by name) inside an alert's area.
-- ---------------------------------------------------------------------------
create or replace function app.alert_client_towns(p_alert_id bigint, p_client_id uuid)
returns table (municipality_id bigint, name text, is_home boolean)
language sql
stable
set search_path = public, app, extensions
as $$
  with a as (
    select area_geog, center_geog, radius_m from weather_alerts where id = p_alert_id
  ), t as (
    select c.municipality_id as id from clients c where c.id = p_client_id and c.municipality_id is not null
    union
    select w.municipality_id from client_watch_locations w where w.client_id = p_client_id
  )
  select m.id, m.name, m.id = (select c.municipality_id from clients c where c.id = p_client_id)
    from t
    join municipalities m on m.id = t.id
   cross join a
   where (a.area_geog is not null and extensions.ST_Covers(a.area_geog, m.geog))
      or (a.area_geog is null and a.center_geog is not null and a.radius_m is not null
          and extensions.ST_DWithin(a.center_geog, m.geog, a.radius_m))
   order by 3 desc, m.name
$$;

-- ---------------------------------------------------------------------------
-- The notification's words. One place, used by the queue and by the Mexico
-- readiness dry run.
--
--   title  "{Nivel} · {agency}", with "Actualizado: " / "Cancelado: " before it
--          for an Update or Cancel (English for en clients).
--   body   the agency's own headline, or its event, verbatim; then " — " and
--          the client's towns. Where the source's geometry is coarse
--          (include_area_desc, Mexico), the agency's own areaDesc takes the
--          towns' place, so a state-shaped area is never implied to be "your
--          town" (OPEN-DECISIONS 1).
-- ---------------------------------------------------------------------------
create or replace function app.alert_push_text(
  p_msg_type text, p_level alert_level, p_severity_raw text, p_agency text,
  p_headline text, p_event text, p_area_desc text, p_include_area_desc boolean,
  p_lang text, p_towns text[]
) returns table (title text, body text)
language sql
immutable
as $$
  select
    case coalesce(p_msg_type, 'Alert')
      when 'Update' then case when p_lang = 'en' then 'Updated: ' else 'Actualizado: ' end
      when 'Cancel' then case when p_lang = 'en' then 'Cancelled: ' else 'Cancelado: ' end
      else '' end
    || case p_level
         when 'red'    then case when p_lang = 'en' then 'Red' else 'Rojo' end
         when 'orange' then case when p_lang = 'en' then 'Orange' else 'Naranja' end
         when 'yellow' then case when p_lang = 'en' then 'Yellow' else 'Amarillo' end
         when 'green'  then case when p_lang = 'en' then 'Green' else 'Verde' end
         else coalesce(p_severity_raw, case when p_lang = 'en' then 'Warning' else 'Aviso' end) end
    || ' · ' || p_agency,
    coalesce(p_headline, p_event)
    || case
         when p_include_area_desc then case when p_area_desc is not null then ' — ' || p_area_desc else '' end
         when coalesce(cardinality(p_towns), 0) > 0 then ' — ' || array_to_string(p_towns, ', ')
         else '' end
$$;

-- ---------------------------------------------------------------------------
-- ALERT queue, one client, one identifier (0009's contract, same outcomes).
-- p_town_ids: the towns to name; null means the client's towns inside the area.
-- ---------------------------------------------------------------------------
drop function if exists app.queue_alert_notification(uuid, bigint);

create or replace function app.queue_alert_notification(
  p_client_id uuid,
  p_alert_id  bigint,
  p_town_ids  bigint[] default null,
  p_reason    text default 'area'
) returns text
language plpgsql
set search_path = public, app, extensions
as $$
declare
  a        weather_alerts%rowtype;
  s        alert_sources%rowtype;
  v_local  date;
  v_lang   text;
  v_home   bigint;
  v_ids    bigint[];
  v_names  text[];
  v_title  text;
  v_body   text;
begin
  select * into a from weather_alerts where id = p_alert_id;
  if not found then return 'skipped_no_alert'; end if;

  -- Ack and Error are machine bookkeeping and are never shown to a person.
  if a.msg_type is not null and a.msg_type in ('Ack','Error') then
    return 'skipped_not_surfaceable';
  end if;
  select * into s from alert_sources where id = a.source_id;

  select (now() at time zone c.timezone)::date, c.language::text, c.municipality_id
    into v_local, v_lang, v_home
    from clients c where c.id = p_client_id;

  if p_town_ids is null then
    select array_agg(t.municipality_id order by t.is_home desc, t.name), array_agg(t.name order by t.is_home desc, t.name)
      into v_ids, v_names
      from app.alert_client_towns(p_alert_id, p_client_id) t;
  else
    select array_agg(m.id order by m.id = v_home desc, m.name), array_agg(m.name order by m.id = v_home desc, m.name)
      into v_ids, v_names
      from municipalities m where m.id = any(p_town_ids);
  end if;

  select x.title, x.body into v_title, v_body
    from app.alert_push_text(a.msg_type, a.level, a.severity_raw, s.agency, a.headline, a.event,
                             a.area_desc, s.include_area_desc, v_lang, coalesce(v_names, '{}')) x;

  insert into notifications (client_id, local_date, channel, trigger, title, body,
                             weather_alert_id, cap_identifier, scheduled_for,
                             alert_town_ids, alert_towns, alert_reason)
  values (p_client_id, v_local, 'alert', 'weather_alert', v_title, v_body,
          p_alert_id, a.cap_identifier, now(),
          coalesce(v_ids, '{}'), coalesce(v_names, '{}'), p_reason)
  on conflict (client_id, cap_identifier)
    where channel = 'alert' and cap_identifier is not null
  do nothing;

  if found then return 'queued'; end if;
  return 'skipped_duplicate_identifier';
end $$;

-- Whether an alert's level pushes, for a launched source only.
create or replace function app.should_push(p_alert_id bigint)
returns boolean
language sql
stable
as $$
  select a.level = any(s.push_levels) and s.active
  from weather_alerts a
  join alert_sources s on s.id = a.source_id
  where a.id = p_alert_id;
$$;

-- ---------------------------------------------------------------------------
-- The push decision for one stored message, applied: who gets it, with which
-- towns, and why. Returns one row per client it was queued (or skipped) for.
-- ---------------------------------------------------------------------------
create or replace function app.queue_alert_pushes(p_alert_id bigint, p_now timestamptz default now())
returns table (client_id uuid, outcome text, reason text, towns text[])
language plpgsql
volatile
set search_path = public, app, extensions
as $$
declare
  a        weather_alerts%rowtype;
  s        alert_sources%rowtype;
  v_type   text;
  v_refs   bigint[];
  v_live   boolean;
  v_life   jsonb := '[]'::jsonb;
  v_done   uuid[] := '{}';
  r        record;
  v_out    text;
begin
  select * into a from weather_alerts w where w.id = p_alert_id;
  if not found then return; end if;
  select * into s from alert_sources x where x.id = a.source_id;
  v_type := coalesce(a.msg_type, 'Alert');

  -- A country whose warnings are not launched sends nothing, and Ack/Error
  -- never reach a person.
  if not s.active or v_type not in ('Alert', 'Update', 'Cancel') then return; end if;

  v_live := a.superseded_by_id is null and a.cancelled_at is null
            and (a.expires_at is null or a.expires_at > p_now);

  if v_type in ('Update', 'Cancel') and cardinality(a.cap_reference_ids) > 0 then
    select array_agg(w.id) into v_refs
      from weather_alerts w
     where w.source_id = a.source_id and w.cap_identifier = any(a.cap_reference_ids) and w.id <> a.id;
  end if;

  if v_refs is not null then
    -- Who received a message this one updates or cancels (possibly shown: sent,
    -- or mid-retry), while that message had not yet expired; with their towns.
    select coalesce(jsonb_agg(jsonb_build_object('c', x.client_id, 't', x.towns)), '[]'::jsonb) into v_life
      from (select n.client_id, array_agg(distinct t.id) filter (where t.id is not null) as towns
              from notifications n
              join weather_alerts o on o.id = n.weather_alert_id
              left join lateral unnest(n.alert_town_ids) as t(id) on true
              join clients c on c.id = n.client_id and c.active
             where n.channel = 'alert' and n.weather_alert_id = any(v_refs)
               and (n.status = 'sent' or (n.status = 'queued' and n.attempts > 0))
               and (o.expires_at is null or o.expires_at > p_now)
             group by n.client_id) x;

    -- An original not yet sent is overtaken: it is never sent.
    update notifications n
       set status = 'suppressed',
           error = format('%s by %s before it was sent',
                          case when v_type = 'Cancel' then 'cancelled' else 'superseded' end, a.cap_identifier)
     where n.channel = 'alert' and n.weather_alert_id = any(v_refs) and n.status = 'queued';
  end if;

  -- By area: a live Alert or Update at a level this source pushes.
  if v_type in ('Alert', 'Update') and v_live and a.level = any(s.push_levels) then
    for r in
      with covered as (
        select m.id from municipalities m
         where m.country = a.country
           and ((a.area_geog is not null and extensions.ST_Covers(a.area_geog, m.geog))
             or (a.area_geog is null and a.center_geog is not null and a.radius_m is not null
                 and extensions.ST_DWithin(a.center_geog, m.geog, a.radius_m)))
      ), hit as (
        select c.id as cid, c.municipality_id as mid
          from clients c join covered cv on cv.id = c.municipality_id
         where c.active and c.country = a.country
        union
        select w.client_id, w.municipality_id
          from client_watch_locations w
          join covered cv on cv.id = w.municipality_id
          join clients c on c.id = w.client_id
         where c.active and c.country = a.country
      )
      select h.cid, array_agg(h.mid) as ids from hit h group by h.cid order by h.cid
    loop
      v_out := app.queue_alert_notification(r.cid, a.id, r.ids, 'area');
      v_done := v_done || r.cid;
      client_id := r.cid; outcome := v_out; reason := 'area';
      towns := (select n.alert_towns from notifications n
                 where n.client_id = r.cid and n.channel = 'alert' and n.cap_identifier = a.cap_identifier);
      return next;
    end loop;
  end if;

  -- By lifecycle: a live Update, or a Cancel, to everyone who got the original.
  if (v_type = 'Update' and v_live) or v_type = 'Cancel' then
    for r in
      select (e->>'c')::uuid as cid,
             (select array_agg(x::bigint) from jsonb_array_elements_text(coalesce(nullif(e->'t', 'null'::jsonb), '[]'::jsonb)) x) as ids
        from jsonb_array_elements(v_life) e
    loop
      continue when r.cid = any(v_done);
      v_out := app.queue_alert_notification(r.cid, a.id, coalesce(r.ids, '{}'), 'lifecycle');
      client_id := r.cid; outcome := v_out; reason := 'lifecycle';
      towns := (select n.alert_towns from notifications n
                 where n.client_id = r.cid and n.channel = 'alert' and n.cap_identifier = a.cap_identifier);
      return next;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The alert delivery log, per push: which warning, which towns, why, and what
-- happened. Owner-only through notifications' RLS (security_invoker).
-- ---------------------------------------------------------------------------
create or replace view alert_delivery_log with (security_invoker = true) as
select n.id as notification_id, n.client_id, n.weather_alert_id, n.cap_identifier,
       w.msg_type, w.level, s.country, s.agency,
       n.alert_reason as reason, n.alert_towns as towns, n.alert_town_ids as town_ids,
       n.title, n.body, n.status, n.attempts, n.delivered_count, n.error,
       n.created_at as queued_at, n.sent_at
  from notifications n
  left join weather_alerts w on w.id = n.weather_alert_id
  left join alert_sources s on s.id = w.source_id
 where n.channel = 'alert';

-- ---------------------------------------------------------------------------
-- Hoy: "Avisos para tu familia". The towns we read warnings for, whether push
-- reaches a phone of theirs, and when we last checked. Never whether there are
-- warnings: absence in our database is not safety.
-- ---------------------------------------------------------------------------
create or replace function app.family_warnings(p_client_id uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
set search_path = public, app
as $$
declare
  v_c       clients%rowtype;
  v_src     alert_sources%rowtype;
  v_checked timestamptz;
  v_state   text;
begin
  select * into v_c from clients where id = p_client_id and active;
  if not found then return null; end if;

  select * into v_src from alert_sources where country = v_c.country and active order by (kind = 'cap') desc limit 1;
  if found then
    select h.last_ok_at into v_checked from feed_health h where h.feed = 'alerts:' || v_c.country::text;
    -- The same 45-minute rule as Clima (weather_page).
    v_state := case when v_checked is not null and v_checked >= p_now - interval '45 minutes' then 'current' else 'stale' end;
  else
    v_state := 'not_monitored';
    select * into v_src from alert_sources where country = v_c.country order by (kind = 'cap') desc limit 1;
  end if;

  return jsonb_build_object(
    'state', v_state,
    'checked_at', v_checked,
    'agency', v_src.agency,
    'agency_url', v_src.website_url,
    'push_levels', case when v_state <> 'not_monitored' then to_jsonb(v_src.push_levels::text[]) end,
    'towns', coalesce((
       select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'is_home', m.id = v_c.municipality_id)
                        order by (m.id = v_c.municipality_id) desc, m.name)
         from municipalities m
        where m.id = v_c.municipality_id
           or m.id in (select w.municipality_id from client_watch_locations w where w.client_id = p_client_id)), '[]'::jsonb),
    'watching', (select count(*) from client_watch_locations w where w.client_id = p_client_id),
    'subscriptions', (select count(*) from push_subscriptions ps where ps.client_id = p_client_id and ps.disabled_at is null));
end $$;

-- One alert, as a push opens it (/clima?aviso=): verbatim, with its lifecycle
-- state and the client's towns it named. Only their own country's launched
-- source, never Ack/Error.
create or replace function app.client_alert(p_client_id uuid, p_alert_id bigint, p_now timestamptz default now())
returns jsonb
language sql
stable
set search_path = public, app, extensions
as $$
  select app.alert_json(a.id) || jsonb_build_object(
           'state', case when coalesce(a.msg_type, 'Alert') = 'Cancel' then 'cancel'
                         when a.cancelled_at is not null then 'cancelled'
                         when a.superseded_by_id is not null then 'superseded'
                         when a.expires_at is not null and a.expires_at <= p_now then 'expired'
                         else 'active' end,
           'towns', coalesce(
              (select to_jsonb(n.alert_towns) from notifications n
                where n.client_id = c.id and n.weather_alert_id = a.id and n.channel = 'alert'
                  and cardinality(n.alert_towns) > 0 limit 1),
              (select jsonb_agg(t.name order by t.is_home desc, t.name) from app.alert_client_towns(a.id, c.id) t),
              '[]'::jsonb))
    from weather_alerts a
    join alert_sources s on s.id = a.source_id and s.active
    join clients c on c.id = p_client_id and c.active and c.country = a.country
   where a.id = p_alert_id and coalesce(a.msg_type, 'Alert') not in ('Ack', 'Error')
$$;
