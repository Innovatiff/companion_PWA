-- 0013_owner_alert_delivery.sql
-- Whether an owner alert actually reached the owner.
--
-- The staleness monitor used to bump notify_count and last_notified_at whatever
-- the webhook answered, so a page that reached Telegram and one that was
-- rejected looked identical in the data. Every attempt is now recorded. A
-- failed delivery shows in feed_health_detail and fails /health: an owner alert
-- that cannot be delivered is the same as no owner alert.

create table owner_alert_deliveries (
  id              bigint generated always as identity primary key,
  owner_alert_id  bigint references owner_alerts(id) on delete cascade,
  feed            text not null,
  kind            text not null,            -- an owner_alert_kind, or 'recovered'
  attempted_at    timestamptz not null default now(),
  delivered       boolean not null,
  http_status     integer,
  error           text
);

create index owner_alert_deliveries_recent_idx on owner_alert_deliveries (attempted_at desc);
create index owner_alert_deliveries_feed_idx   on owner_alert_deliveries (feed, attempted_at desc);

alter table owner_alert_deliveries enable row level security;
create policy owner_alert_deliveries_owner_read on owner_alert_deliveries
  for select using (app.is_owner());

-- The delivery path as a whole. The most recent attempt decides: a failure is
-- cleared only by a later delivery that got through. No attempt at all is
-- 'untested', which is not the same as working.
create view owner_alert_delivery_health as
select
  case
    when count(*) = 0 then 'untested'
    when (array_agg(delivered order by attempted_at desc, id desc))[1] then 'ok'
    else 'failing'
  end                                                             as status,
  max(attempted_at)                                               as last_attempt_at,
  max(attempted_at) filter (where delivered)                      as last_delivered_at,
  (array_agg(error order by attempted_at desc, id desc) filter (where not delivered))[1]
                                                                  as last_failure_error,
  count(*) filter (where not delivered
                     and attempted_at > now() - interval '24 hours') as failures_24h
from owner_alert_deliveries;

-- Columns may only be appended to a replaced view.
create or replace view feed_health_detail as
select
  e.feed,
  e.label,
  e.expected_interval,
  h.last_ok_at,
  h.last_attempt_at,
  h.latest_status,
  h.latest_error,
  h.failures_24h,
  case
    when h.last_attempt_at is null then 'never_run'
    when h.last_ok_at is null      then 'never_succeeded'
    when h.last_ok_at < now() - (e.expected_interval + e.grace) then 'stale'
    when h.latest_status = 'error' then 'failing'
    when h.latest_status = 'partial' then 'degraded'
    else 'ok'
  end as health,
  now() - h.last_ok_at as since_last_ok,
  -- items | confirmed_empty | no_answer; null for feeds that do not report it.
  h.latest_result,
  -- Owner alerts about this feed that did not reach the owner.
  (select count(*) from owner_alert_deliveries d
    where d.feed = e.feed and not d.delivered
      and d.attempted_at > now() - interval '24 hours') as alert_delivery_failures_24h
from feed_expectations e
left join feed_health h on h.feed = e.feed
where e.active;
