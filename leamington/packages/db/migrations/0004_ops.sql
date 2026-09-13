-- 0004_ops.sql — feed health, alert matching, notification delivery log.

-- ---------------------------------------------------------------------------
-- Feed health. "Silent scraper failure is the worst outcome here."
-- ---------------------------------------------------------------------------

create type run_status as enum ('ok','partial','error');

create table source_runs (
  id            bigint generated always as identity primary key,
  feed          text not null,               -- 'fx', 'alerts:HN', 'lottery:JM:cashpot'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        run_status not null default 'ok',
  records_written integer not null default 0,
  http_status   integer,
  error         text,
  notes         jsonb
);

create index source_runs_feed_idx on source_runs (feed, started_at desc);

-- What the admin feed-health dashboard reads. A feed that has never succeeded
-- and a feed that succeeded 14h ago are different failures; both are visible.
create view feed_health as
select
  feed,
  max(started_at) filter (where status = 'ok')            as last_ok_at,
  max(started_at)                                         as last_attempt_at,
  now() - max(started_at) filter (where status = 'ok')     as since_last_ok,
  (array_agg(status order by started_at desc))[1]          as latest_status,
  (array_agg(error  order by started_at desc) filter (where error is not null))[1]
                                                           as latest_error,
  count(*) filter (where status <> 'ok'
                     and started_at > now() - interval '24 hours')
                                                           as failures_24h
from source_runs
group by feed;

-- Staleness check for alert sources specifically. The owner is paged off this.
create view alert_source_staleness as
select
  s.id                as source_id,
  s.country,
  s.agency,
  s.kind,
  s.active,
  s.stale_after_seconds,
  h.last_ok_at,
  h.since_last_ok,
  (h.last_ok_at is null
     or h.last_ok_at < now() - make_interval(secs => s.stale_after_seconds))
                      as is_stale
from alert_sources s
left join feed_health h
  on h.feed = 'alerts:' || s.country::text
where s.active;

-- ---------------------------------------------------------------------------
-- Alert -> client matching, by polygon. Not by name.
-- ---------------------------------------------------------------------------

-- Returns the clients an alert geographically covers, across their home
-- municipality AND any additional towns they chose to watch.
create or replace function app.clients_for_alert(p_alert_id bigint)
returns table (client_id uuid, municipality_id bigint, is_home boolean)
language sql
stable
as $$
  with a as (
    select area_geog, center_geog, radius_m, country
    from weather_alerts where id = p_alert_id
  ),
  covered as (
    select m.id as municipality_id
    from municipalities m, a
    where (
      (a.area_geog is not null and extensions.ST_Covers(a.area_geog, m.geog))
      or
      (a.area_geog is null and a.center_geog is not null and a.radius_m is not null
        and extensions.ST_DWithin(a.center_geog, m.geog, a.radius_m))
    )
  )
  select c.id, c.municipality_id, true
  from clients c
  join covered cv on cv.municipality_id = c.municipality_id
  where c.active
  union
  select w.client_id, w.municipality_id, false
  from client_watch_locations w
  join covered cv on cv.municipality_id = w.municipality_id
  join clients c on c.id = w.client_id
  where c.active;
$$;

-- ---------------------------------------------------------------------------
-- Notifications — ONE per day maximum, at a fixed hour.
-- ---------------------------------------------------------------------------

-- Priority when several triggers are eligible the same day. Weather alert
-- always wins; lottery never overrides an alert or a match day.
create type notification_trigger as enum
  ('weather_alert','match_day','fx_30d_high','lottery','other');

create type notification_status as enum ('queued','sent','failed','suppressed');

create table notifications (
  id              bigint generated always as identity primary key,
  client_id       uuid not null references clients(id) on delete cascade,

  -- The client's LOCAL calendar date. The unique index below is what actually
  -- enforces "one per day" -- over-sending kills this permanently.
  local_date      date not null,

  trigger         notification_trigger not null,
  title           text not null,
  body            text not null,

  weather_alert_id bigint references weather_alerts(id) on delete set null,
  fixture_id       bigint references fixtures(id) on delete set null,

  status          notification_status not null default 'queued',
  scheduled_for   timestamptz not null,
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);

-- ONE per client per local day. Anything else is a bug, enforced in the schema
-- rather than trusted to the sender.
create unique index notifications_one_per_day_idx
  on notifications (client_id, local_date)
  where status in ('queued','sent');

create index notifications_client_idx   on notifications (client_id, local_date desc);
create index notifications_delivery_idx on notifications (status, scheduled_for);
-- Alert delivery log (admin): which alert reached whom, and when.
create index notifications_alert_idx    on notifications (weather_alert_id)
  where weather_alert_id is not null;

-- Numeric priority for the daily picker. Lower wins.
create or replace function app.trigger_priority(t notification_trigger)
returns smallint language sql immutable as $$
  select case t
    when 'weather_alert' then 1
    when 'match_day'     then 2
    when 'fx_30d_high'   then 3
    when 'lottery'       then 4
    else 5
  end::smallint;
$$;
