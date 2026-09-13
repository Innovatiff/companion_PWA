-- 0006_alert_policy.sql
-- Per-source ingest route and push policy.
--
-- Jamaica and Mexico push differently (decision 2026-09-13), so the policy is
-- data rather than a branch in the ingest code:
--   Jamaica — push red and orange; geometry is 739-vertex, precise enough.
--   Mexico  — push red ONLY, and always show SMN's own areaDesc verbatim,
--             because ~6-vertex state-shaped polygons cannot imply "your town".

alter table alert_sources
  -- Alert Hub fallback route. The hub's per-country feeds are GEOGRAPHIC
  -- FILTERS, so hub_source_id records which issuing source is the national one
  -- and everything else in that feed is discarded.
  add column hub_feed_url  text,
  add column hub_source_id text,

  -- Which levels earn a push for this source. Everything else displays in-app.
  add column push_levels alert_level[] not null default '{red,orange}',

  -- Show the agency's own area wording in the notification, so a coarse
  -- coverage area is visible to the user rather than implied to be their town.
  add column include_area_desc boolean not null default false;

comment on column alert_sources.hub_source_id is
  'Issuing source id within the Alert Hub feed. Items from any other source are discarded: the country feed is a geographic filter, not a national feed.';

-- Authoritative push decision. weather_alerts.push_eligible stays as a generic
-- "is this high severity" index; whether it actually pushes is per-source.
create or replace function app.should_push(p_alert_id bigint)
returns boolean
language sql
stable
as $$
  select a.level = any(s.push_levels)
  from weather_alerts a
  join alert_sources s on s.id = a.source_id
  where a.id = p_alert_id;
$$;

-- Notification body for an alert, assembled from agency wording only.
-- No rewriting, no summarising, no paraphrase.
create or replace function app.alert_notification_body(p_alert_id bigint)
returns text
language sql
stable
as $$
  select
    -- Agency wording verbatim, then the area when policy requires it.
    coalesce(a.headline, a.event)
    || case
         when s.include_area_desc and a.area_desc is not null
           then ' — ' || a.area_desc
         else ''
       end
    || ' (' || s.agency || ')'
  from weather_alerts a
  join alert_sources s on s.id = a.source_id
  where a.id = p_alert_id;
$$;

-- ---------------------------------------------------------------------------
-- Priority-aware notification queueing.
--
-- ONE notification per client per local day. When a higher-priority trigger
-- arrives after a lower one is already queued, it REPLACES it rather than being
-- dropped -- a weather alert must be able to displace a queued lottery result.
-- An already-SENT notification is never replaced: it is on the phone.
-- ---------------------------------------------------------------------------

create or replace function app.queue_notification(
  p_client_id      uuid,
  p_local_date     date,
  p_trigger        notification_trigger,
  p_title          text,
  p_body           text,
  p_scheduled_for  timestamptz,
  p_alert_id       bigint default null,
  p_fixture_id     bigint default null
) returns text
language plpgsql
as $$
declare
  existing   notifications%rowtype;
  new_prio   smallint := app.trigger_priority(p_trigger);
begin
  select * into existing
  from notifications
  where client_id = p_client_id
    and local_date = p_local_date
    and status in ('queued','sent')
  limit 1;

  if not found then
    insert into notifications (client_id, local_date, trigger, title, body,
                               weather_alert_id, fixture_id, scheduled_for)
    values (p_client_id, p_local_date, p_trigger, p_title, p_body,
            p_alert_id, p_fixture_id, p_scheduled_for);
    return 'queued';
  end if;

  if existing.status = 'sent' then
    return 'skipped_already_sent';
  end if;

  if new_prio >= app.trigger_priority(existing.trigger) then
    return 'skipped_lower_priority';
  end if;

  update notifications
     set trigger = p_trigger, title = p_title, body = p_body,
         weather_alert_id = p_alert_id, fixture_id = p_fixture_id,
         scheduled_for = p_scheduled_for
   where id = existing.id;
  return 'replaced';
end $$;
